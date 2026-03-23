/**
 * Middleware de rate limiting par IP — fenêtre glissante.
 *
 * ADR-03 : Store en mémoire par défaut (Map JavaScript).
 * Interface RateLimitStore injectable pour déploiements multi-instances (Redis).
 *
 * Limitation connue : sur un déploiement multi-nodes (load balancer),
 * le store mémoire n'est pas partagé entre les instances.
 * Dans ce cas, injecter un store Redis via config.rateLimit.store.
 *
 * OWASP : rate limiting est une protection contre les attaques par déni de service
 * et le spam de soumissions. Répond 429 Too Many Requests.
 */

import { type Core } from '@strapi/strapi';
import { type RateLimitStore, type PluginConfig } from '../config';
import { type StrapiContext } from '../types/strapi';

/** Entrée dans le store de rate limiting */
interface RateLimitEntry {
  /** Nombre de requêtes dans la fenêtre courante */
  count: number;
  /** Timestamp de fin de la fenêtre (ms depuis epoch) */
  resetAt: number;
}

/**
 * Implémentation du store de rate limiting en mémoire.
 * Utilisée par défaut (single-node).
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly store: Map<string, RateLimitEntry> = new Map();

  /**
   * Incrémente le compteur pour une clé.
   * Si la fenêtre est expirée, remet à 1.
   *
   * @param key - Identifiant de la clé (ex: IP)
   * @param windowMs - Durée de la fenêtre en millisecondes
   * @returns Nombre de requêtes dans la fenêtre courante
   */
  async increment(key: string, windowMs: number): Promise<number> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetAt) {
      // Nouvelle fenêtre ou fenêtre expirée
      const entry: RateLimitEntry = { count: 1, resetAt: now + windowMs };
      this.store.set(key, entry);
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }

  /**
   * Remet à zéro le compteur pour une clé.
   * @param key - Identifiant de la clé
   */
  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Libère toutes les entrées du store.
   * Appelé au destroy du plugin.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Retourne le nombre d'entrées actives dans le store.
   * Utile pour le monitoring.
   */
  size(): number {
    return this.store.size;
  }
}

// Instance singleton du store mémoire — partagée sur la durée de vie du processus
export const memoryStore = new MemoryRateLimitStore();

/**
 * Middleware de rate limiting Strapi V5.
 *
 * Utilise le store injecté via config.rateLimit.store, ou le store mémoire par défaut.
 * Répond 429 si la limite est dépassée.
 *
 * @param ctx - Contexte Koa
 * @param next - Fonction suivante dans la chaîne
 */
export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) =>
  async (ctx: StrapiContext, next: () => Promise<void>): Promise<void> => {
    const pluginConfig = strapi.config.get('plugin::comments') as unknown as PluginConfig;
    const rateLimitConfig = pluginConfig.rateLimit;

    // Court-circuit si le rate limiting est désactivé
    if (!rateLimitConfig.enabled) {
      await next();
      return;
    }

    const store: RateLimitStore = rateLimitConfig.store ?? memoryStore;
    const ip = ctx.request.ip;

    if (!ip) {
      // SEC-002 : IP indisponible — fail-closed (OWASP A07).
      // Un proxy correctement configuré transmet toujours l'IP via X-Forwarded-For.
      // Laisser passer une requête sans IP permettrait de contourner le rate limiter.
      strapi.log.warn(
        '[strapi-plugin-comments][rate-limit] IP non disponible dans le contexte. Requête rejetée (fail-closed).'
      );
      ctx.status = 429;
      ctx.body = {
        error: {
          status: 429,
          message: 'Requête rejetée : adresse IP non identifiable.',
        },
      };
      return;
    }

    // Whitelist d'IPs : localhost toujours autorisé + config fichier + settings base
    const defaultWhitelist = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const configWhitelist = rateLimitConfig.whitelist ?? [];

    // Lecture de la whitelist depuis les settings base (chaîne CSV → tableau)
    let storeWhitelist: string[] = [];
    try {
      const store = strapi.store({ type: 'plugin', name: 'comments' });
      const settings = (await store.get({ key: 'settings' })) as Record<string, unknown> | null;
      const raw = settings?.rateLimitWhitelist as string | undefined;
      if (raw) {
        storeWhitelist = raw.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
    } catch {
      // Fail-open
    }

    const whitelist = [...defaultWhitelist, ...configWhitelist, ...storeWhitelist];

    if (whitelist.includes(ip)) {
      await next();
      return;
    }

    const count = await store.increment(ip, rateLimitConfig.windowMs);

    if (count > rateLimitConfig.max) {
      ctx.status = 429;
      ctx.body = {
        error: {
          status: 429,
          message: `Trop de soumissions. Veuillez réessayer dans ${Math.ceil(rateLimitConfig.windowMs / 60000)} minutes.`,
        },
      };
      return;
    }

    await next();
  };
