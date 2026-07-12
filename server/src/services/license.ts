/**
 * Service de licence freemium du plugin strapi-plugin-comments.
 *
 * Tiers :
 *   - 'community' : gratuit, sans clé, limite 500 commentaires
 *   - 'pro'       : clé de licence ISOMORPH VALIDÉE EN LIGNE, illimité + fonctions Pro
 *
 * ⚠️ Sécurité — validation EN LIGNE (V2, 2026-07-12) :
 *   La V1 validait la clé localement par un simple checksum → n'importe qui
 *   pouvait fabriquer une clé « valide ». La V2 vérifie la clé contre le service
 *   ISOMORPH (`https://isomorph.dev/api/licenses/verify`) : une clé n'est Pro que
 *   si elle existe dans la base des licences (créée uniquement après un paiement
 *   Stripe réel) et qu'elle est active + non expirée. Le checksum local ne sert
 *   plus que de pré-filtre pour éviter d'appeler le serveur sur une clé malformée.
 *
 * Robustesse (le plugin tourne chez le client) :
 *   - Résultat mis en cache en mémoire + persisté dans le store du plugin.
 *   - Revérification périodique (défaut 12 h).
 *   - Fenêtre de grâce (défaut 7 j) : une panne réseau / du serveur ISOMORPH ne
 *     rétrograde PAS un client payant tant que la dernière vérif Pro réussie est
 *     dans la fenêtre. Passé ce délai sans confirmation → repli Community (fail-safe
 *     pour honorer les révocations).
 *   - Réponse « invalide » explicite (clé inconnue / révoquée / expirée) →
 *     rétrogradation immédiate en Community.
 *   - `getTier()`/`isProLicense()` sont SYNCHRONES et ne lèvent jamais : elles
 *     lisent l'état en cache. La mise à jour se fait en tâche de fond.
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from '../config';

/** Tier de la licence */
export type LicenseTier = 'community' | 'pro';

/** Limite du nombre de commentaires en tier Community */
export const COMMUNITY_COMMENT_LIMIT = 500;

/** URL d'achat de la licence Pro */
export const PRO_PURCHASE_URL = 'https://isomorph.dev/plugins/comments';

/** Valeurs par défaut du bloc `license` de la config (si l'hôte ne les surcharge pas). */
const LICENSE_DEFAULTS = {
  verifyUrl: 'https://isomorph.dev/api/licenses/verify',
  verifyIntervalHours: 12,
  graceDays: 7,
  timeoutMs: 5000,
};

/** Clé de stockage du cache de licence dans le store du plugin. */
const STORE_KEY = 'license-cache';

/**
 * État de licence partagé au niveau module (un process Node = une instance plugin).
 * Toutes les fonctions du service lisent/écrivent cet état unique, quel que soit
 * le nombre de fois où `createLicenseService` est appelé.
 */
interface LicenseState {
  tier: LicenseTier;
  /** Epoch ms de la dernière vérification Pro RÉUSSIE (base de la fenêtre de grâce). */
  lastGoodAt: number | null;
  /** Epoch ms de la dernière tentative de vérification. */
  checkedAt: number | null;
  /** Date d'expiration de la licence (ISO), pour affichage. */
  expiresAt: string | null;
  /** Verrou anti-concurrence des refresh. */
  refreshing: boolean;
  /** Handle de l'intervalle de revérification (pour cleanup). */
  timer: ReturnType<typeof setInterval> | null;
}

const state: LicenseState = {
  tier: 'community',
  lastGoodAt: null,
  checkedAt: null,
  expiresAt: null,
  refreshing: false,
  timer: null,
};

// ---------------------------------------------------------------------------
// Format local (pré-filtre uniquement — plus la frontière de sécurité)
// ---------------------------------------------------------------------------

/**
 * Vérifie le FORMAT d'une clé (ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX, checksum pair).
 *
 * ⚠️ Ce n'est PLUS une preuve de validité : une clé peut passer ce test et ne
 * correspondre à aucun achat. Sert seulement à éviter un appel réseau inutile
 * sur une clé manifestement malformée.
 */
export function validateLicenseKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const regex = /^ISOMORPH-COMMENTS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;
  if (!regex.test(key)) return false;
  const hexPart = key.replace('ISOMORPH-COMMENTS-', '').replace(/-/g, '');
  const sum = hexPart.split('').reduce((acc, c) => acc + parseInt(c, 16), 0);
  return sum % 2 === 0;
}

// ---------------------------------------------------------------------------
// Helpers config / environnement
// ---------------------------------------------------------------------------

function getPluginConfig(strapi: Core.Strapi): PluginConfig & {
  licenseKey?: string;
  license?: Partial<typeof LICENSE_DEFAULTS>;
} {
  return strapi.config.get('plugin::comments') as PluginConfig & {
    licenseKey?: string;
    license?: Partial<typeof LICENSE_DEFAULTS>;
  };
}

function getLicenseSettings(strapi: Core.Strapi): typeof LICENSE_DEFAULTS {
  const cfg = getPluginConfig(strapi);
  return { ...LICENSE_DEFAULTS, ...(cfg.license ?? {}) };
}

function getLicenseKey(strapi: Core.Strapi): string | undefined {
  return getPluginConfig(strapi).licenseKey;
}

/** Domaine du site hôte (best effort), transmis au serveur de vérification pour traçabilité. */
function getDomain(strapi: Core.Strapi): string | undefined {
  try {
    const url =
      (strapi.config.get('server.url') as string | undefined) ||
      process.env['URL'] ||
      process.env['PUBLIC_URL'];
    if (!url) return undefined;
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Appel réseau de vérification
// ---------------------------------------------------------------------------

interface VerifyResponse {
  valid: boolean;
  plan?: string;
  plugin?: string;
  expiresAt?: string;
  reason?: string;
}

/**
 * Appelle le service de vérification ISOMORPH. Ne mute PAS l'état.
 * Lève en cas d'erreur réseau / timeout / réponse non-JSON / statut >= 500
 * (= panne transitoire → géré par la fenêtre de grâce en amont).
 * Retourne le corps parsé sinon (y compris `valid:false`, qui est une réponse
 * définitive et non une panne).
 */
async function callVerify(strapi: Core.Strapi, key: string): Promise<VerifyResponse> {
  const settings = getLicenseSettings(strapi);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), settings.timeoutMs);
  try {
    const res = await fetch(settings.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, domain: getDomain(strapi) }),
      signal: controller.signal,
    });
    // 5xx = panne serveur = transitoire → on lève pour tomber dans la grâce
    if (res.status >= 500) {
      throw new Error(`Verify service ${res.status}`);
    }
    return (await res.json()) as VerifyResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Persistance du cache (survit aux redémarrages)
// ---------------------------------------------------------------------------

async function loadPersisted(strapi: Core.Strapi): Promise<void> {
  try {
    const store = strapi.store({ type: 'plugin', name: 'comments' });
    const cached = (await store.get({ key: STORE_KEY })) as {
      tier?: LicenseTier;
      lastGoodAt?: number | null;
      expiresAt?: string | null;
    } | null;
    if (cached) {
      state.tier = cached.tier === 'pro' ? 'pro' : 'community';
      state.lastGoodAt = cached.lastGoodAt ?? null;
      state.expiresAt = cached.expiresAt ?? null;
    }
  } catch {
    // Fail-safe : pas de cache persisté → on part de Community.
  }
}

async function persist(strapi: Core.Strapi): Promise<void> {
  try {
    const store = strapi.store({ type: 'plugin', name: 'comments' });
    await store.set({
      key: STORE_KEY,
      value: { tier: state.tier, lastGoodAt: state.lastGoodAt, expiresAt: state.expiresAt },
    });
  } catch {
    // Non bloquant.
  }
}

// ---------------------------------------------------------------------------
// Rafraîchissement de l'état de licence
// ---------------------------------------------------------------------------

/**
 * Vérifie la licence et met à jour l'état/cache. Ne lève jamais.
 * Appelée au bootstrap, périodiquement, et paresseusement si le cache est vieux.
 */
async function refresh(strapi: Core.Strapi): Promise<void> {
  if (state.refreshing) return;
  state.refreshing = true;
  const now = Date.now();
  try {
    const key = getLicenseKey(strapi);

    // Pas de clé → Community, aucun appel réseau.
    if (!key) {
      state.tier = 'community';
      state.lastGoodAt = null;
      state.expiresAt = null;
      state.checkedAt = now;
      await persist(strapi);
      return;
    }

    // Clé manifestement malformée → Community sans appel réseau.
    if (!validateLicenseKey(key)) {
      state.tier = 'community';
      state.lastGoodAt = null;
      state.expiresAt = null;
      state.checkedAt = now;
      await persist(strapi);
      return;
    }

    state.checkedAt = now;

    try {
      const result = await callVerify(strapi, key);

      const isPro =
        result.valid === true &&
        (result.plan === 'pro' || result.plan === 'enterprise') &&
        (result.plugin === undefined || result.plugin === 'comments');

      if (isPro) {
        state.tier = 'pro';
        state.lastGoodAt = now;
        state.expiresAt = result.expiresAt ?? null;
        await persist(strapi);
        return;
      }

      // Réponse définitive « invalide » (inconnue / révoquée / expirée) →
      // rétrogradation immédiate.
      state.tier = 'community';
      state.lastGoodAt = null;
      state.expiresAt = null;
      await persist(strapi);
      return;
    } catch {
      // Panne transitoire (réseau, timeout, 5xx) → fenêtre de grâce.
      const settings = getLicenseSettings(strapi);
      const graceMs = settings.graceDays * 24 * 60 * 60 * 1000;
      if (state.lastGoodAt && now - state.lastGoodAt < graceMs) {
        // On maintient le Pro : client payant non pénalisé par une panne.
        state.tier = 'pro';
        strapi.log?.warn?.(
          '[strapi-plugin-comments][license] Service de vérification injoignable — ' +
            'maintien du tier Pro dans la fenêtre de grâce.'
        );
      } else {
        // Grâce dépassée (ou jamais validé) → repli Community.
        state.tier = 'community';
        strapi.log?.warn?.(
          '[strapi-plugin-comments][license] Service de vérification injoignable et ' +
            'fenêtre de grâce dépassée — repli en tier Community.'
        );
      }
      return;
    }
  } finally {
    state.refreshing = false;
  }
}

// ---------------------------------------------------------------------------
// Factory du service
// ---------------------------------------------------------------------------

export function createLicenseService(strapi: Core.Strapi) {
  return {
    /** true si le tier courant (en cache) est Pro. Synchrone, ne lève jamais. */
    isProLicense(): boolean {
      return state.tier === 'pro';
    },

    /** Tier courant (en cache). Synchrone, ne lève jamais. */
    getTier(): LicenseTier {
      return state.tier;
    },

    /** Date d'expiration connue de la licence (ISO) ou null. */
    getExpiresAt(): string | null {
      return state.expiresAt;
    },

    /**
     * Initialise le service : charge le cache persisté, lance une première
     * vérification, puis planifie les revérifications. Appelé au bootstrap.
     */
    async init(): Promise<void> {
      await loadPersisted(strapi);
      await refresh(strapi);
      if (!state.timer) {
        const settings = getLicenseSettings(strapi);
        const intervalMs = settings.verifyIntervalHours * 60 * 60 * 1000;
        state.timer = setInterval(() => {
          void refresh(strapi);
        }, intervalMs);
        // Ne pas empêcher le process de s'arrêter à cause du timer.
        state.timer.unref?.();
      }
    },

    /** Force une revérification immédiate (ex: après changement de config). */
    async refreshNow(): Promise<LicenseTier> {
      await refresh(strapi);
      return state.tier;
    },

    /**
     * Teste une clé ARBITRAIRE en ligne sans toucher à l'état du plugin.
     * Utilisé par l'endpoint admin « vérifier cette clé ».
     * Retourne { valid, tier, reason } — fail-open informatif si le serveur est down.
     */
    async testKey(key: string): Promise<{
      valid: boolean;
      tier: LicenseTier;
      reason?: string;
      serverUnreachable?: boolean;
    }> {
      if (!key || !validateLicenseKey(key)) {
        return { valid: false, tier: 'community', reason: 'invalid_format' };
      }
      try {
        const result = await callVerify(strapi, key);
        const isPro =
          result.valid === true &&
          (result.plan === 'pro' || result.plan === 'enterprise') &&
          (result.plugin === undefined || result.plugin === 'comments');
        return {
          valid: isPro,
          tier: isPro ? 'pro' : 'community',
          reason: result.reason,
        };
      } catch {
        return {
          valid: false,
          tier: 'community',
          reason: 'server_unreachable',
          serverUnreachable: true,
        };
      }
    },

    /**
     * Clé masquée pour l'affichage admin — jamais transmise au client.
     * @example "ISOMORPH-COMMENTS-****-****-****-E4D7"
     */
    getMaskedKey(): string | null {
      const key = getLicenseKey(strapi);
      if (!key) return null;
      const parts = key.split('-');
      if (parts.length < 6) return '****';
      return `ISOMORPH-COMMENTS-****-****-****-${parts[5]}`;
    },
  };
}

/** Type du service de licence (inféré depuis la factory). */
export type LicenseService = ReturnType<typeof createLicenseService>;
