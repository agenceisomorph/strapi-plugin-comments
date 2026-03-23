/**
 * Middleware de contrôle d'accès aux fonctionnalités Pro.
 *
 * S'applique uniquement sur les routes Pro :
 *   - Actions en masse (bulk approve/block)
 *   - Épinglage de commentaires
 *   - Signalements (liste admin)
 *   - Réponse admin WYSIWYG
 *   - Paramètres avancés (rate limit whitelist, reCAPTCHA)
 *
 * Comportement :
 *   - Tier Pro  : passe au handler suivant
 *   - Tier Community : 403 avec message clair et lien vers la page d'achat
 *
 * Fail-closed côté admin (contrairement au fail-open côté frontend) :
 * une erreur de lecture de config retourne 403 par sécurité.
 *
 * OWASP A01 : contrôle d'accès côté serveur uniquement,
 * jamais basé sur un paramètre client.
 */

import { type Core } from '@strapi/strapi';
import { type StrapiContext } from '../types/strapi';
import { createLicenseService, PRO_PURCHASE_URL } from '../services/license';

/**
 * Factory du middleware license-gate pour Strapi V5.
 *
 * Référencement dans les routes :
 *   middlewares: ['plugin::comments.license-gate']
 */
export default (_config: unknown, { strapi }: { strapi: Core.Strapi }) =>
  async (ctx: StrapiContext, next: () => Promise<void>): Promise<void> => {
    const licenseService = createLicenseService(strapi);

    if (licenseService.isProLicense()) {
      // Licence Pro valide — accès accordé
      await next();
      return;
    }

    // Licence Community ou clé invalide — accès refusé
    ctx.status = 403;
    ctx.body = {
      error: {
        status: 403,
        name: 'LicenseRequired',
        message:
          'Cette fonctionnalité est réservée à la licence Pro. ' +
          `Obtenez votre licence sur ${PRO_PURCHASE_URL}`,
        details: {
          tier: 'community',
          upgradeUrl: PRO_PURCHASE_URL,
          feature: 'pro',
        },
      },
    };
  };
