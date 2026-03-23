/**
 * Hook bootstrap — exécuté APRÈS le chargement de tous les plugins.
 *
 * Responsabilités :
 *   1. Création de la catégorie "Abonné" si absente (via service subscriber)
 *   2. Initialisation du filtre anti-injures (chargement des dictionnaires FR/EN)
 *   3. Log de confirmation du démarrage du plugin
 *
 * Ce hook est idempotent : il peut être exécuté plusieurs fois sans effet de bord
 * (ex: rechargement à chaud en développement, redémarrage du serveur).
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from './config';
import { init as initProfanityFilter } from './services/profanity';
import { ensureSubscriberCategory } from './services/subscriber';

/**
 * Hook bootstrap du plugin.
 * Appelé par Strapi après le chargement de tous les plugins.
 *
 * @param options - Contient l'instance strapi
 */
export default async ({ strapi }: { strapi: Core.Strapi }): Promise<void> => {
  const pluginConfig = strapi.config.get('plugin::comments') as unknown as PluginConfig;

  // ── Étape 1 : Initialisation du filtre anti-injures ───────────────────────
  if (pluginConfig.profanityFilter.enabled) {
    try {
      initProfanityFilter(pluginConfig.profanityFilter.languages);
      console.info(
        `[strapi-plugin-comments][bootstrap] Filtre anti-injures initialisé (langues : ${pluginConfig.profanityFilter.languages.join(', ')}).`
      );
    } catch (err) {
      console.warn(
        '[strapi-plugin-comments][bootstrap] Erreur d\'initialisation du filtre anti-injures. ' +
          'Le filtre sera désactivé pour cette session.',
        err
      );
    }
  }

  // ── Étape 2 : Création de la catégorie Abonné ─────────────────────────────
  if (pluginConfig.subscriber.enabled) {
    try {
      const category = await ensureSubscriberCategory(strapi, {
        categoryName: pluginConfig.subscriber.categoryName,
        categorySlug: pluginConfig.subscriber.categorySlug,
      });

      if (category) {
        console.info(
          `[strapi-plugin-comments][bootstrap] Catégorie "${pluginConfig.subscriber.categoryName}" vérifiée/créée.`
        );
      }
    } catch (err) {
      // Fail-safe : l'absence de catégorie ne doit pas bloquer le démarrage
      console.warn(
        '[strapi-plugin-comments][bootstrap] Erreur lors de la vérification de la catégorie Abonné. ' +
          'L\'inscription automatique des commentateurs sera ignorée.',
        err
      );
    }
  }

  // ── Étape 3 : Confirmation du démarrage ───────────────────────────────────
  console.info(
    '[strapi-plugin-comments] Plugin chargé et prêt. ' +
      `Configuration : requireApproval=${pluginConfig.requireApproval}, ` +
      `profanityFilter=${pluginConfig.profanityFilter.enabled}, ` +
      `recaptcha=${pluginConfig.recaptcha.enabled}, ` +
      `rateLimit=${pluginConfig.rateLimit.enabled}, ` +
      `subscriber=${pluginConfig.subscriber.enabled}.`
  );
};
