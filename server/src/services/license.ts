/**
 * Service de licence freemium du plugin strapi-plugin-comments.
 *
 * Tiers disponibles :
 *   - 'community' : gratuit, sans clé, fonctionnalités de base avec limite 500 commentaires
 *   - 'pro'       : avec clé ISOMORPH valide, fonctionnalités illimitées
 *
 * Algorithme de validation V1 (local, sans appel réseau) :
 *   - Vérification du format : ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX (hex majuscule)
 *   - Vérification du checksum : somme des nibbles hex modulo 2 === 0
 *
 * V2 prévue : validation serveur ISOMORPH avec cache 24h en mémoire.
 *
 * Fail-open : en cas d'erreur inattendue, on retourne 'community'
 * (ne bloque jamais le site, dégrade gracieusement les fonctionnalités Pro).
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from '../config';

/** Tier de la licence */
export type LicenseTier = 'community' | 'pro';

/** Limite du nombre de commentaires en tier Community */
export const COMMUNITY_COMMENT_LIMIT = 500;

/** URL d'achat de la licence Pro */
export const PRO_PURCHASE_URL = 'https://isomorph.fr/plugins/comments';

/**
 * Valide le format et le checksum d'une clé de licence ISOMORPH.
 *
 * Format attendu : ISOMORPH-COMMENTS-XXXX-XXXX-XXXX-XXXX
 * où X est un caractère hexadécimal en majuscule (0-9, A-F).
 *
 * Règle checksum : la somme de tous les nibbles hexadécimaux (16 chiffres)
 * doit être paire (divisible par 2).
 *
 * @param key - Clé de licence à valider
 * @returns true si la clé est valide, false sinon
 */
export function validateLicenseKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  // Vérification du format strict
  const regex = /^ISOMORPH-COMMENTS-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;
  if (!regex.test(key)) return false;

  // Extraction des 16 caractères hexadécimaux (sans le préfixe et les tirets)
  const hexPart = key.replace('ISOMORPH-COMMENTS-', '').replace(/-/g, '');

  // Calcul du checksum : somme des valeurs entières de chaque nibble
  const sum = hexPart.split('').reduce((acc, c) => acc + parseInt(c, 16), 0);

  // Le checksum est valide si la somme est paire
  return sum % 2 === 0;
}

/**
 * Détermine le tier de licence à partir d'une clé.
 *
 * @param licenseKey - Clé de licence (peut être vide ou undefined)
 * @returns 'pro' si la clé est valide, 'community' sinon
 */
function resolveTier(licenseKey: string | undefined): LicenseTier {
  if (!licenseKey) return 'community';

  try {
    return validateLicenseKey(licenseKey) ? 'pro' : 'community';
  } catch {
    // Fail-open : erreur inattendue → Community (ne bloque pas le site)
    return 'community';
  }
}

/**
 * Factory du service de licence.
 *
 * Le service est instancié une fois par session Strapi.
 * La clé est lue depuis la config du plugin au moment de chaque appel
 * (pas de mise en cache de la résolution — la config est déjà en mémoire Strapi).
 *
 * @param strapi - Instance Strapi
 * @returns Objet exposant les méthodes du service de licence
 */
export function createLicenseService(strapi: Core.Strapi) {
  /**
   * Lit la clé de licence depuis la configuration du plugin hôte.
   * La clé est définie dans config/plugins.ts du projet Strapi :
   *
   * ```ts
   * comments: { config: { licenseKey: process.env.COMMENTS_LICENSE_KEY } }
   * ```
   */
  function getLicenseKey(): string | undefined {
    const config = strapi.config.get('plugin::comments') as PluginConfig & {
      licenseKey?: string;
    };
    return config?.licenseKey;
  }

  return {
    /**
     * Retourne true si la licence active est de tier Pro.
     * Ne lève jamais d'exception (fail-open).
     */
    isProLicense(): boolean {
      return resolveTier(getLicenseKey()) === 'pro';
    },

    /**
     * Retourne le tier actuel : 'community' ou 'pro'.
     * Ne lève jamais d'exception (fail-open → 'community').
     */
    getTier(): LicenseTier {
      return resolveTier(getLicenseKey());
    },

    /**
     * Retourne la clé de licence masquée pour l'affichage dans l'admin.
     * Affiche uniquement les 4 derniers caractères du dernier groupe.
     * Retourne null si aucune clé n'est configurée.
     *
     * @example "ISOMORPH-COMMENTS-****-****-****-AB3F"
     */
    getMaskedKey(): string | null {
      const key = getLicenseKey();
      if (!key) return null;

      // On ne masque que pour l'affichage — jamais transmis au client
      const parts = key.split('-');
      // Structure : ['ISOMORPH', 'COMMENTS', 'GRP1', 'GRP2', 'GRP3', 'GRP4']
      if (parts.length < 6) return '****';

      return `ISOMORPH-COMMENTS-****-****-****-${parts[5]}`;
    },
  };
}

/** Type du service de licence (inféré depuis la factory) */
export type LicenseService = ReturnType<typeof createLicenseService>;
