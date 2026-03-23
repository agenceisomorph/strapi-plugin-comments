/**
 * Service d'inscription automatique des commentateurs comme "Abonnés".
 *
 * Stratégie findOrCreate sur l'email :
 *   - Si l'utilisateur existe déjà : on lui ajoute la catégorie Abonné sans modifier son profil
 *   - Si l'utilisateur est bloqué (blocked=true) : la soumission du commentaire est rejetée
 *   - Si le plugin users-permissions n'est pas présent : mode dégradé (aucune action)
 *
 * Le plugin est 100% standalone — le plugin users-permissions est optionnel.
 */

import { randomBytes } from 'crypto';
import { type Core } from '@strapi/strapi';
import { type UserCategoryEntity, type StrapiUser } from '../types/strapi';

/** Configuration nécessaire pour ce service */
interface SubscriberConfig {
  categoryName: string;
  categorySlug: string;
}

/**
 * Vérifie si le plugin users-permissions est disponible dans l'instance Strapi.
 * Utilisé pour le mode fail-safe — le plugin comments fonctionne sans lui.
 *
 * @param strapi - Instance Strapi
 */
function isUsersPermissionsAvailable(strapi: Core.Strapi): boolean {
  try {
    return !!strapi.plugin('users-permissions');
  } catch {
    return false;
  }
}

/**
 * Vérifie l'existence de la catégorie "Abonné" et la crée si absente.
 * Appelé au bootstrap du plugin.
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration subscriber (categoryName, categorySlug)
 */
export async function ensureSubscriberCategory(
  strapi: Core.Strapi,
  config: SubscriberConfig
): Promise<UserCategoryEntity | null> {
  try {
    // Recherche de la catégorie existante par slug
    const existing = await strapi.documents('plugin::comments.user-category').findFirst({
      filters: { slug: { $eq: config.categorySlug } },
    });

    if (existing) {
      return existing as unknown as UserCategoryEntity;
    }

    // Création de la catégorie Abonné
    const created = await strapi.documents('plugin::comments.user-category').create({
      data: {
        name: config.categoryName,
        slug: config.categorySlug,
        description: 'Catégorie assignée automatiquement aux commentateurs',
        color: '#C7CEEA',
      },
    });

    console.info(
      `[strapi-plugin-comments] Catégorie "${config.categoryName}" créée avec l'id: ${created.documentId}`
    );

    return created as unknown as UserCategoryEntity;
  } catch (err) {
    console.error(
      '[strapi-plugin-comments] Erreur lors de la création de la catégorie Abonné :',
      err
    );
    return null;
  }
}

/**
 * Inscrit un commentateur comme Abonné (findOrCreate sur l'email).
 *
 * Comportement :
 *   1. Recherche de l'utilisateur par email
 *   2. Si bloqué → retourne null (le controller rejettera la soumission)
 *   3. Si trouvé → ajoute la catégorie Abonné si pas déjà assignée
 *   4. Si absent → crée l'utilisateur avec le rôle Authenticated + catégorie Abonné
 *
 * @param strapi - Instance Strapi
 * @param email - Email du commentateur
 * @param firstname - Prénom du commentateur
 * @param config - Configuration subscriber
 * @returns L'utilisateur Strapi ou null si plugin users-permissions absent
 */
export async function registerAsSubscriber(
  strapi: Core.Strapi,
  email: string,
  firstname: string,
  config: SubscriberConfig
): Promise<StrapiUser | null> {
  // Mode dégradé : plugin users-permissions absent
  if (!isUsersPermissionsAvailable(strapi)) {
    return null;
  }

  try {
    // Récupération de la catégorie Abonné
    const subscriberCategory = await strapi.documents('plugin::comments.user-category').findFirst({
      filters: { slug: { $eq: config.categorySlug } },
    });

    if (!subscriberCategory) {
      console.warn(
        '[strapi-plugin-comments] Catégorie Abonné introuvable. L\'inscription automatique est ignorée.'
      );
      return null;
    }

    // Recherche de l'utilisateur existant par email
    const existingUsers = await strapi.documents('plugin::users-permissions.user').findMany({
      filters: { email: { $eq: email.toLowerCase() } },
      populate: ['userCategories'],
      pagination: { limit: 1 },
    });

    const existingUser = existingUsers[0] as (StrapiUser & {
      userCategories?: Array<{ slug: string; documentId: string }>;
    }) | undefined;

    if (existingUser) {
      // Utilisateur bloqué : on signale le rejet au service appelant
      if (existingUser.blocked) {
        return { ...existingUser, blocked: true };
      }

      // Vérification si la catégorie Abonné est déjà assignée
      const alreadySubscriber = existingUser.userCategories?.some(
        (cat) => cat.slug === config.categorySlug
      ) ?? false;

      if (!alreadySubscriber) {
        // Ajout de la catégorie sans modifier les autres données du profil
        await strapi.documents('plugin::users-permissions.user').update({
          documentId: existingUser.documentId,
          data: {
            userCategories: {
              connect: [{ documentId: subscriberCategory.documentId }],
            },
          } as never,
        });
      }

      return existingUser as StrapiUser;
    }

    // Récupération du rôle "Authenticated" (rôle public par défaut de users-permissions)
    const authenticatedRole = await strapi
      .plugin('users-permissions')
      .service('role')
      .findOne({ type: 'authenticated' }) as { id: number; documentId: string } | null;

    // Création du nouvel utilisateur Abonné
    const newUser = await strapi.documents('plugin::users-permissions.user').create({
      data: {
        email: email.toLowerCase(),
        username: email.toLowerCase(),
        firstname: firstname,
        // SEC-003 : Math.random() est un PRNG non cryptographique (OWASP A02).
        // randomBytes(32) garantit 256 bits d'entropie cryptographique.
        password: randomBytes(32).toString('hex'),
        confirmed: true,
        blocked: false,
        provider: 'local',
        role: authenticatedRole ? { connect: [{ id: authenticatedRole.id }] } : undefined,
        userCategories: {
          connect: [{ documentId: subscriberCategory.documentId }],
        },
      },
    });

    // SEC-008 : pseudonymisation de l'email dans les logs (RGPD — données à caractère personnel).
    const maskedEmail = email.replace(/(.{2}).+(@.+)/, '$1***$2');
    strapi.log.info(
      `[strapi-plugin-comments] Nouvel abonné créé : ${maskedEmail} (documentId: ${newUser.documentId})`
    );

    return newUser as unknown as StrapiUser;
  } catch (err) {
    console.error(
      '[strapi-plugin-comments] Erreur lors de l\'inscription de l\'abonné :',
      err
    );
    // Fail-open : l'inscription Abonné échouée ne doit pas bloquer la soumission du commentaire
    return null;
  }
}
