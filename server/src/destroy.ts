/**
 * Hook destroy — exécuté lors de l'arrêt de Strapi.
 *
 * Responsabilités :
 *   - Libération du store de rate limiting en mémoire
 *   - Nettoyage des ressources ouvertes par le plugin
 *
 * Ce hook garantit que les ressources sont libérées proprement
 * lors d'un redémarrage ou d'un arrêt graceful du serveur.
 */

import { type Core } from '@strapi/strapi';
import { memoryStore } from './middlewares/rate-limit';

/**
 * Hook destroy du plugin.
 * Appelé par Strapi lors de l'arrêt du serveur (SIGTERM, SIGINT, etc.).
 *
 * @param _options - Contient l'instance strapi (non utilisée ici)
 */
export default ({ strapi: _strapi }: { strapi: Core.Strapi }): void => {
  try {
    // Libération du store de rate limiting en mémoire
    memoryStore.clear();
    console.info(
      '[strapi-plugin-comments][destroy] Store de rate limiting libéré (' +
        `${memoryStore.size()} entrées supprimées).`
    );
  } catch (err) {
    console.warn('[strapi-plugin-comments][destroy] Erreur lors du nettoyage du store :', err);
  }

  console.info('[strapi-plugin-comments][destroy] Plugin arrêté proprement.');
};
