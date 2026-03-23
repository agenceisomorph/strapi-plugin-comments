/**
 * Middleware de sanitisation XSS des inputs.
 *
 * Sanitise les champs firstname, email et content du body avant traitement.
 * Utilise la librairie `xss` (npm, 1.5 Ko gzippé, MIT) — conforme RGESN.
 *
 * Stratégie whitelist : suppression de TOUTES les balises HTML et entités dangereuses.
 * Les commentaires sont du texte brut, aucune balise HTML n'est légitime.
 *
 * OWASP A03:2021 — Injection : prévention des attaques XSS stockées.
 */

import { type Core } from '@strapi/strapi';
import { type StrapiContext } from '../types/strapi';

/* eslint-disable @typescript-eslint/no-require-imports */
// xss ne fournit pas d'export ESM natif en CommonJS
const xss = require('xss') as (input: string, options?: XssOptions) => string;
/* eslint-enable @typescript-eslint/no-require-imports */

/** Options de configuration xss */
interface XssOptions {
  whiteList?: Record<string, string[]>;
  stripIgnoreTag?: boolean;
  stripIgnoreTagBody?: string[];
}

/**
 * Options xss pour une politique stricte (aucune balise HTML autorisée).
 * Le texte brut est le seul format légitime pour les champs commentaire.
 */
const XSS_OPTIONS: XssOptions = {
  whiteList: {}, // Aucune balise HTML autorisée
  stripIgnoreTag: true, // Supprime les balises non autorisées
  stripIgnoreTagBody: ['script', 'style', 'iframe', 'noscript'], // Supprime aussi le contenu
};

/**
 * Sanitise une chaîne de caractères.
 * Supprime toutes les balises HTML, entités et scripts.
 *
 * @param input - Chaîne à sanitiser
 * @returns Chaîne nettoyée
 */
export function sanitizeString(input: string): string {
  return xss(input, XSS_OPTIONS).trim();
}

/**
 * Sanitise les champs textuels d'un objet body.
 * Seuls les champs string sont traités — les autres types sont ignorés.
 *
 * @param body - Corps de la requête
 * @param fields - Champs à sanitiser
 * @returns Nouveau body avec les champs sanitisés
 */
export function sanitizeFields(
  body: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const sanitized = { ...body };

  for (const field of fields) {
    const value = sanitized[field];
    if (typeof value === 'string') {
      sanitized[field] = sanitizeString(value);
    }
  }

  return sanitized;
}

/** Champs soumis à la sanitisation XSS */
const SANITIZED_FIELDS = ['firstname', 'email', 'content'];

/**
 * Middleware de sanitisation Strapi V5.
 *
 * Modifie ctx.request.body en place avec les champs sanitisés.
 * La sanitisation est transparente pour les données légitimes.
 */
export default (_config: unknown, _options: { strapi: Core.Strapi }) =>
  async (ctx: StrapiContext, next: () => Promise<void>): Promise<void> => {
    const body = ctx.request.body as Record<string, unknown> | undefined;
    if (body && typeof body === 'object') {
      // Strapi V5 content-api : les données sont dans body.data
      if (body.data && typeof body.data === 'object') {
        body.data = sanitizeFields(
          body.data as Record<string, unknown>,
          SANITIZED_FIELDS
        );
      } else {
        ctx.request.body = sanitizeFields(body, SANITIZED_FIELDS);
      }
    }

    await next();
  };

// ─── Test unitaire minimal ────────────────────────────────────────────────────
// sanitizeString('<script>alert("xss")</script>Hello') → 'Hello'
// sanitizeString('<b>Jean</b>') → 'Jean'
// sanitizeFields({ firstname: '<b>Jean</b>', email: 'test@test.com', content: 'Bonjour' }, SANITIZED_FIELDS)
//   → { firstname: 'Jean', email: 'test@test.com', content: 'Bonjour' }
