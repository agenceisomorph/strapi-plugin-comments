/**
 * Hook register — exécuté AVANT l'initialisation de la base de données.
 *
 * Responsabilités :
 *   - Extension du modèle User (plugin::users-permissions.user)
 *     pour ajouter la relation userCategories → plugin::comments.user-category
 *
 * IMPORTANT : L'extension est fail-safe.
 * Si le plugin users-permissions est absent, le plugin comments fonctionne
 * en mode dégradé (commentaires anonymes uniquement, sans inscription Abonné).
 *
 * Strapi V5 : L'extension des content-types se fait dans register()
 * via strapi.contentTypes pour les modifier avant la création des tables.
 */

import { type Core } from '@strapi/strapi';

/**
 * Étend le modèle User pour ajouter la relation vers user-category.
 *
 * @param strapi - Instance Strapi
 */
function extendUserModel(strapi: Core.Strapi): void {
  try {
    // Accès direct aux content-types chargés par Strapi
    const userCT = (strapi.contentTypes as unknown as Record<string, { attributes?: Record<string, unknown> }>)[
      'plugin::users-permissions.user'
    ];

    if (!userCT) {
      console.warn(
        '[strapi-plugin-comments][register] Content-type users-permissions.user introuvable. ' +
          'Mode dégradé : inscription automatique des Abonnés désactivée.'
      );
      return;
    }

    if (!userCT.attributes) {
      console.warn(
        '[strapi-plugin-comments][register] Modèle User sans attributs. Extension ignorée.'
      );
      return;
    }

    // Vérification que la relation n'est pas déjà définie (idempotence)
    if (userCT.attributes['userCategories']) {
      return;
    }

    // Ajout de la relation manyToMany userCategories → plugin::comments.user-category
    userCT.attributes['userCategories'] = {
      type: 'relation',
      relation: 'manyToMany',
      target: 'plugin::comments.user-category',
      mappedBy: 'users',
    };

    console.info(
      '[strapi-plugin-comments][register] Relation userCategories ajoutée au modèle User.'
    );
  } catch (error: unknown) {
    // Fail-safe : le plugin fonctionne sans l'extension du modèle User
    console.warn(
      '[strapi-plugin-comments][register] Erreur lors de l\'extension du modèle User :',
      error
    );
  }
}

export default ({ strapi }: { strapi: Core.Strapi }): void => {
  extendUserModel(strapi);
};
