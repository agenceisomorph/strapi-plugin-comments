/**
 * Middleware de vérification reCAPTCHA V3.
 *
 * Attend le token dans :
 *   - Header : x-recaptcha-token
 *   - Body   : recaptchaToken
 *
 * OWASP : La clé secrète ne transite jamais côté client.
 * Si reCAPTCHA est désactivé dans la config (recaptcha.enabled=false),
 * ou si RECAPTCHA_SECRET_KEY n'est pas définie, le middleware est transparent.
 *
 * Répond 403 si :
 *   - Le token est absent
 *   - Le score est inférieur au seuil configuré
 *   - L'appel Google échoue et failClosed=true
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from '../config';
import { type StrapiContext } from '../types/strapi';
import { verify, isConfigured } from '../services/recaptcha';

/**
 * Middleware reCAPTCHA Strapi V5.
 */
export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) =>
  async (ctx: StrapiContext, next: () => Promise<void>): Promise<void> => {
    const pluginConfig = strapi.config.get('plugin::comments') as unknown as PluginConfig;
    const recaptchaConfig = pluginConfig.recaptcha;

    // Court-circuit si reCAPTCHA désactivé ou non configuré
    if (!recaptchaConfig.enabled || !isConfigured()) {
      await next();
      return;
    }

    const secretKey = process.env['RECAPTCHA_SECRET_KEY'];

    if (!secretKey) {
      // RECAPTCHA_SECRET_KEY absente — avertissement et bypass (pas de blocage à la config)
      console.warn(
        '[strapi-plugin-comments][recaptcha-verify] RECAPTCHA_SECRET_KEY non définie. Vérification ignorée.'
      );
      await next();
      return;
    }

    // Récupération du token depuis le header ou le body
    const token =
      (ctx.request.headers['x-recaptcha-token'] as string | undefined) ||
      (ctx.request.body as Record<string, unknown>)['recaptchaToken'] as string | undefined;

    if (!token || token.trim().length === 0) {
      ctx.status = 403;
      ctx.body = {
        error: {
          status: 403,
          message: 'Token reCAPTCHA manquant. Veuillez réessayer.',
        },
      };
      return;
    }

    // Vérification auprès de l'API Google
    const result = await verify(
      token,
      secretKey,
      recaptchaConfig.scoreThreshold,
      ctx.request.ip,
      recaptchaConfig.failClosed
    );

    if (!result.success) {
      ctx.status = 403;
      ctx.body = {
        error: {
          status: 403,
          message: 'Vérification reCAPTCHA échouée. Veuillez réessayer.',
          // Ne pas exposer les error-codes Google dans la réponse publique (OWASP)
        },
      };
      return;
    }

    await next();
  };
