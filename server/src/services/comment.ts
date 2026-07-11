/**
 * Service principal des commentaires — orchestre tous les autres services.
 *
 * Responsabilités :
 *   - findByDocument : requête Document Service avec filtres approved+!blocked, construction arbre N-1
 *   - create : pipeline filtre injures → couleur avatar → enregistrement → inscription Abonné
 *   - createReply : vérification profondeur N-1, puis délégation à create
 *   - delete : suppression commentaire + enfants en cascade
 *   - buildTree : construction de l'arbre parent → children depuis une liste plate
 *
 * ADR-01 : Profondeur limitée à N-1. Un commentaire qui est lui-même une réponse
 *          (parent !== null) ne peut pas recevoir de réponse.
 *
 * Performance : requêtes Document Service avec filtres DB (pas de filtrage en mémoire).
 * Les index PostgreSQL sur (relatedDocumentId, relatedCollection, blocked, approved)
 * et (parentId) garantissent les CWV "Good".
 */

import { type Core } from '@strapi/strapi';
import { type CommentEntity, type CommentTree, type PaginationOptions } from '../types/strapi';
import { type PluginConfig } from '../config';
import * as avatarService from './avatar';
import * as profanityService from './profanity';
import * as subscriberService from './subscriber';
import { createLicenseService, COMMUNITY_COMMENT_LIMIT, PRO_PURCHASE_URL } from './license';

/**
 * Lit les paramètres stockés en base (Strapi store) et les merge avec la config statique.
 * Les settings de la base ont priorité sur la config fichier.
 */
async function getEffectiveConfig(strapi: Core.Strapi, config: PluginConfig): Promise<PluginConfig> {
  try {
    const store = strapi.store({ type: 'plugin', name: 'comments' });
    const settings = (await store.get({ key: 'settings' })) as Record<string, unknown> | null;
    if (!settings) return config;

    return {
      ...config,
      requireApproval: (settings.requireApproval as boolean) ?? config.requireApproval,
      profanityFilter: {
        ...config.profanityFilter,
        enabled: (settings.profanityFilterEnabled as boolean) ?? config.profanityFilter.enabled,
        // BUG-3 : Mapping Settings admin → config interne.
        // L'enum Zod du store accepte 'block'/'sanitize', mais on gère aussi
        // les valeurs internes 'reject'/'flag' pour robustesse (modif directe en base).
        action: (() => {
          const raw = settings.profanityFilterAction as string | undefined;
          if (!raw) return config.profanityFilter.action;
          if (raw === 'block') return 'reject' as const;
          if (raw === 'sanitize') return 'flag' as const;
          // Valeurs internes déjà normalisées (ex: migration manuelle en base)
          if (raw === 'reject') return 'reject' as const;
          if (raw === 'flag') return 'flag' as const;
          // Valeur inconnue → fallback config fichier
          return config.profanityFilter.action;
        })(),
      },
      rateLimit: {
        ...config.rateLimit,
        enabled: (settings.rateLimitEnabled as boolean) ?? config.rateLimit.enabled,
        max: (settings.rateLimitMax as number) ?? config.rateLimit.max,
        windowMs: (settings.rateLimitWindowMs as number) ?? config.rateLimit.windowMs,
      },
      avatar: {
        ...config.avatar,
        enabled: (settings.avatarEnabled as boolean) ?? config.avatar.enabled,
      },
      subscriber: {
        ...config.subscriber,
        enabled: (settings.subscriberEnabled as boolean) ?? config.subscriber.enabled,
        categoryName: (settings.subscriberCategoryName as string) ?? config.subscriber.categoryName,
      },
      moderation: {
        ...config.moderation,
        enabled: (settings.moderationEnabled as boolean) ?? config.moderation.enabled,
      },
      reportThreshold: {
        ...config.reportThreshold,
        enabled: (settings.reportThresholdEnabled as boolean) ?? config.reportThreshold.enabled,
        count: (settings.reportThresholdCount as number) ?? config.reportThreshold.count,
      },
      recaptcha: {
        ...config.recaptcha,
        enabled: (settings.recaptchaEnabled as boolean) ?? config.recaptcha.enabled,
        scoreThreshold: (settings.recaptchaMinScore as number) ?? config.recaptcha.scoreThreshold,
      },
    };
  } catch (err) {
    // SEC-009 : fail-closed — en cas d'erreur d'accès au store, on force
    // requireApproval et moderation.enabled à true pour ne pas approuver
    // silencieusement des commentaires si la base est défaillante.
    strapi.log.warn(
      `[strapi-plugin-comments][sécurité] Impossible de lire les settings en base, ` +
      `bascule en mode fail-closed (requireApproval=true, moderation.enabled=true) : ${String(err)}`
    );
    return {
      ...config,
      requireApproval: true,
      moderation: {
        ...config.moderation,
        enabled: true,
      },
    };
  }
}

/** Données d'entrée pour la création d'un commentaire */
export interface CreateCommentInput {
  firstname: string;
  email: string;
  content: string;
  relatedDocumentId: string;
  relatedCollection?: string;
}

/** Options de recherche pour findByDocument */
export interface FindByDocumentOptions {
  includeBlocked?: boolean;
  includeUnapproved?: boolean;
  pagination?: PaginationOptions;
}

/** Erreur métier du service commentaires */
export class CommentServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'CommentServiceError';
  }
}

/**
 * Récupère les commentaires d'un document, structurés en arbre N-1.
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration du plugin
 * @param relatedDocumentId - documentId de l'entité cible
 * @param relatedCollection - UID de la collection cible
 * @param options - Options de filtrage et pagination
 * @returns Liste de commentaires racine avec leurs réponses
 */
export async function findByDocument(
  strapi: Core.Strapi,
  config: PluginConfig,
  relatedDocumentId: string,
  relatedCollection: string,
  options: FindByDocumentOptions = {}
): Promise<CommentTree[]> {
  const targetCollection = relatedCollection || config.targetCollection;

  // Filtres de base : n'exposer que les commentaires visibles par défaut
  const filters: Record<string, unknown> = {
    relatedDocumentId: { $eq: relatedDocumentId },
    relatedCollection: { $eq: targetCollection },
    // Commentaires racine uniquement — les réponses sont chargées via populate
    parent: { $null: true },
  };

  if (!options.includeBlocked) {
    filters['blocked'] = { $eq: false };
  }

  if (!options.includeUnapproved) {
    filters['approved'] = { $eq: true };
  }

  const pagination = options.pagination ?? { pageSize: 50, page: 1 };

  const comments = await strapi.documents('plugin::comments.comment').findMany({
    filters: filters as never,
    populate: {
      children: {
        filters: {
          blocked: { $eq: false },
          approved: { $eq: true },
        },
        populate: ['author'],
        sort: ['createdAt:asc'],
      },
      author: {
        fields: ['documentId', 'username', 'email'],
      },
    },
    sort: ['createdAt:desc'],
    pagination: {
      page: pagination.page ?? 1,
      pageSize: pagination.pageSize ?? 50,
    },
  });

  // Enrichissement avec les données d'avatar
  return (comments as unknown as CommentEntity[]).map((comment) =>
    enrichWithAvatar(comment, config)
  );
}

/**
 * Récupère un commentaire par son documentId.
 * Vérifie qu'il est approuvé et non bloqué (sauf si admin).
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du commentaire
 * @param isAdmin - Si true, bypasse les filtres approved/blocked
 */
export async function findOne(
  strapi: Core.Strapi,
  config: PluginConfig,
  documentId: string,
  isAdmin = false
): Promise<CommentTree | null> {
  const filters: Record<string, unknown> = {};

  if (!isAdmin) {
    filters['blocked'] = { $eq: false };
    filters['approved'] = { $eq: true };
  }

  const comment = await strapi.documents('plugin::comments.comment').findOne({
    documentId,
    populate: {
      children: {
        populate: ['author'],
      },
      parent: true,
      author: {
        fields: ['documentId', 'username', 'email'],
      },
    },
  });

  if (!comment) {
    return null;
  }

  // Vérification des filtres manuellement pour findOne
  const entity = comment as unknown as CommentEntity;

  if (!isAdmin && (entity.blocked || !entity.approved)) {
    return null;
  }

  return enrichWithAvatar(entity, config);
}

/**
 * Crée un nouveau commentaire.
 *
 * Pipeline de création :
 *   1. Filtre anti-injures (configurable : reject ou flag)
 *   2. Génération de la couleur d'avatar
 *   3. Enregistrement en base
 *   4. Inscription Abonné (fail-open si erreur)
 *   5. Émission de l'événement comment.created
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration du plugin
 * @param data - Données du commentaire
 * @returns Commentaire créé
 */
export async function create(
  strapi: Core.Strapi,
  config: PluginConfig,
  data: CreateCommentInput
): Promise<CommentTree> {
  // Merge config fichier + settings base (les settings admin ont priorité)
  const cfg = await getEffectiveConfig(strapi, config);
  const targetCollection = data.relatedCollection || cfg.targetCollection;

  // ── Étape 0 : Vérification de la limite Community (500 commentaires) ───────
  // En tier Community, on bloque la création si le seuil est atteint.
  // Fail-open : si le service de licence ou le comptage échoue, on laisse passer.
  try {
    const licenseService = createLicenseService(strapi);
    if (licenseService.getTier() === 'community') {
      const count = await strapi.documents('plugin::comments.comment').count({});
      if (count >= COMMUNITY_COMMENT_LIMIT) {
        throw new CommentServiceError(
          `Limite Community atteinte (${COMMUNITY_COMMENT_LIMIT} commentaires). ` +
            `Passez à la licence Pro pour des commentaires illimités. ${PRO_PURCHASE_URL}`,
          403
        );
      }
    }
  } catch (err) {
    // Relancer uniquement les erreurs métier (CommentServiceError)
    if (err instanceof CommentServiceError) throw err;
    // Autres erreurs (réseau, config) : fail-open — ne pas bloquer le frontend
    console.warn(
      '[strapi-plugin-comments][license] Impossible de vérifier la limite Community. ' +
        'La création est autorisée par défaut.',
      err
    );
  }

  // ── Étape 1 : Filtre anti-injures ──────────────────────────────────────────
  if (cfg.profanityFilter.enabled) {
    // BUG-2 : quand action === 'reject', failOpen doit être false.
    // Sinon une erreur interne du filtre (dictionnaire non initialisé, etc.)
    // ferait retourner check()=false et laisserait passer l'injure silencieusement.
    // Pour 'flag', le comportement fail-open est acceptable (le commentaire part en modération).
    const failOpen = cfg.profanityFilter.action === 'reject'
      ? false
      : (cfg.profanityFilter.failOpen ?? true);

    // Utiliser l'implémentation injectable si fournie, sinon le wrapper leo-profanity
    const hasProfanity = cfg.profanityFilter.customFilter
      ? cfg.profanityFilter.customFilter.check(data.content)
      : profanityService.check(data.content, failOpen);

    if (hasProfanity) {
      if (cfg.profanityFilter.action === 'reject') {
        throw new CommentServiceError(
          'Le contenu du commentaire contient des termes inappropriés.',
          400
        );
      }
      // action === 'flag' : le commentaire sera soumis à modération manuelle
    }
  }

  // ── Étape 2 : Vérification auteur bloqué ──────────────────────────────────
  if (cfg.subscriber.enabled) {
    const existingUsers = await strapi
      .documents('plugin::users-permissions.user')
      .findMany({
        filters: { email: { $eq: data.email.toLowerCase() } },
        fields: ['blocked'],
        pagination: { limit: 1 },
      })
      .catch(() => []);

    const existingUser = existingUsers[0] as { blocked?: boolean } | undefined;
    if (existingUser?.blocked) {
      throw new CommentServiceError(
        'Votre compte a été suspendu. La soumission de commentaires est désactivée.',
        403
      );
    }
  }

  // ── Étape 3 : Génération de la couleur d'avatar ────────────────────────────
  const avatarColor = cfg.avatar.enabled
    ? avatarService.generateColor(data.firstname, cfg.avatar.palette)
    : undefined;

  // ── Étape 4 : Détermination du statut d'approbation ───────────────────────
  // Si moderation.enabled OU requireApproval, les commentaires nécessitent approbation
  let approved = !(cfg.requireApproval || cfg.moderation.enabled);

  if (cfg.profanityFilter.enabled && cfg.profanityFilter.action === 'flag') {
    const hasProfanity = cfg.profanityFilter.customFilter
      ? cfg.profanityFilter.customFilter.check(data.content)
      : profanityService.check(data.content, cfg.profanityFilter.failOpen);

    if (hasProfanity) {
      approved = false;
    }
  }

  // ── Étape 5 : Enregistrement en base ──────────────────────────────────────
  const commentData: Record<string, unknown> = {
    firstname: data.firstname,
    email: data.email.toLowerCase(),
    content: data.content,
    blocked: false,
    approved,
    relatedDocumentId: data.relatedDocumentId,
    relatedCollection: targetCollection,
    ...(avatarColor ? { avatarColor } : {}),
  };

  const created = await strapi.documents('plugin::comments.comment').create({
    data: commentData,
    populate: {
      children: true,
      author: true,
    },
  });

  const createdComment = created as unknown as CommentEntity;

  // ── Étape 6 : Inscription Abonné (fail-open) ──────────────────────────────
  if (cfg.subscriber.enabled) {
    const user = await subscriberService.registerAsSubscriber(
      strapi,
      data.email,
      data.firstname,
      {
        categoryName: cfg.subscriber.categoryName,
        categorySlug: cfg.subscriber.categorySlug,
      }
    );

    // Association de l'auteur si l'inscription a réussi
    if (user && !user.blocked) {
      await strapi.documents('plugin::comments.comment').update({
        documentId: createdComment.documentId,
        data: {
          author: { connect: [{ documentId: user.documentId }] },
        } as never,
      }).catch((err: unknown) => {
        console.warn(
          '[strapi-plugin-comments] Impossible d\'associer l\'auteur au commentaire :',
          err
        );
      });
    }
  }

  // ── Étape 7 : Événement lifecycle ─────────────────────────────────────────
  strapi.eventHub.emit('comment.created', {
    comment: createdComment,
    document: { id: data.relatedDocumentId, collection: targetCollection },
  });

  return enrichWithAvatar(createdComment, config);
}

/**
 * Crée une réponse à un commentaire existant.
 * ADR-01 : Limite à N-1 niveau de profondeur.
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration du plugin
 * @param parentDocumentId - documentId du commentaire parent
 * @param data - Données de la réponse
 */
export async function createReply(
  strapi: Core.Strapi,
  config: PluginConfig,
  parentDocumentId: string,
  data: CreateCommentInput
): Promise<CommentTree> {
  // Récupération du commentaire parent avec vérification de profondeur
  const parentComment = await strapi.documents('plugin::comments.comment').findOne({
    documentId: parentDocumentId,
    populate: ['parent'],
  });

  if (!parentComment) {
    throw new CommentServiceError('Commentaire parent introuvable.', 404);
  }

  const parent = parentComment as unknown as CommentEntity;

  if (parent.blocked) {
    throw new CommentServiceError('Impossible de répondre à un commentaire bloqué.', 400);
  }

  // ADR-01 : Vérification de profondeur N-1
  if (parent.parent !== null && parent.parent !== undefined) {
    throw new CommentServiceError(
      'Les réponses ne peuvent pas être imbriquées au-delà d\'un niveau.',
      400
    );
  }

  // Réutilisation du pipeline de création avec référence au parent
  const replyData: CreateCommentInput = {
    ...data,
    relatedDocumentId: parent.relatedDocumentId,
    relatedCollection: parent.relatedCollection,
  };

  // Pipeline create standard — merge config fichier + settings base
  const cfg = await getEffectiveConfig(strapi, config);
  const targetCollection = replyData.relatedCollection || cfg.targetCollection;

  if (cfg.profanityFilter.enabled) {
    // BUG-2 (réplique dans createReply) : même logique failOpen que dans create().
    const failOpenReply = cfg.profanityFilter.action === 'reject'
      ? false
      : (cfg.profanityFilter.failOpen ?? true);

    const hasProfanity = cfg.profanityFilter.customFilter
      ? cfg.profanityFilter.customFilter.check(replyData.content)
      : profanityService.check(replyData.content, failOpenReply);

    if (hasProfanity && cfg.profanityFilter.action === 'reject') {
      throw new CommentServiceError(
        'Le contenu du commentaire contient des termes inappropriés.',
        400
      );
    }
  }

  const avatarColor = cfg.avatar.enabled
    ? avatarService.generateColor(replyData.firstname, cfg.avatar.palette)
    : undefined;

  const approved = !(cfg.requireApproval || cfg.moderation.enabled);

  const created = await strapi.documents('plugin::comments.comment').create({
    data: {
      firstname: replyData.firstname,
      email: replyData.email.toLowerCase(),
      content: replyData.content,
      blocked: false,
      approved,
      relatedDocumentId: replyData.relatedDocumentId,
      relatedCollection: targetCollection,
      parent: { connect: [{ documentId: parentDocumentId }] },
      ...(avatarColor ? { avatarColor } : {}),
    },
    populate: {
      parent: true,
      author: true,
    },
  });

  const createdReply = created as unknown as CommentEntity;

  // Inscription Abonné (fail-open)
  if (cfg.subscriber.enabled) {
    await subscriberService
      .registerAsSubscriber(strapi, replyData.email, replyData.firstname, {
        categoryName: cfg.subscriber.categoryName,
        categorySlug: cfg.subscriber.categorySlug,
      })
      .catch((err: unknown) => {
        console.warn('[strapi-plugin-comments] Erreur inscription abonné (réponse) :', err);
      });
  }

  // Événement lifecycle
  strapi.eventHub.emit('comment.replied', {
    reply: createdReply,
    parentComment: parent,
    document: { id: replyData.relatedDocumentId, collection: targetCollection },
  });

  return enrichWithAvatar(createdReply, cfg);
}

/**
 * Supprime un commentaire et ses réponses en cascade.
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du commentaire à supprimer
 */
export async function deleteComment(
  strapi: Core.Strapi,
  documentId: string
): Promise<void> {
  // Suppression des enfants en cascade (réponses au commentaire)
  const children = await strapi.documents('plugin::comments.comment').findMany({
    filters: { parent: { documentId: { $eq: documentId } } },
    fields: ['documentId'],
  });

  for (const child of children) {
    const childEntity = child as unknown as { documentId: string };
    await strapi.documents('plugin::comments.comment').delete({
      documentId: childEntity.documentId,
    });
  }

  // Suppression du commentaire principal
  await strapi.documents('plugin::comments.comment').delete({ documentId });
}

/**
 * Incrémente le compteur de likes d'un commentaire.
 *
 * Vérifie l'existence du commentaire et l'absence de blocage avant d'incrémenter.
 * La protection contre le spam de likes multiples est déléguée au middleware rate-limit
 * configuré sur la route — pas de déduplication par utilisateur ici (pas d'auth).
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du commentaire à liker
 * @returns Nouveau compteur de likes après incrément
 * @throws CommentServiceError 404 si le commentaire est introuvable
 * @throws CommentServiceError 403 si le commentaire est bloqué
 */
export async function likeComment(
  strapi: Core.Strapi,
  documentId: string
): Promise<number> {
  const comment = await strapi.documents('plugin::comments.comment').findOne({
    documentId,
    fields: ['documentId', 'blocked', 'likes'],
  });

  if (!comment) {
    throw new CommentServiceError('Commentaire introuvable.', 404);
  }

  const entity = comment as unknown as { blocked: boolean; likes?: number };

  if (entity.blocked) {
    throw new CommentServiceError('Impossible de liker un commentaire bloqué.', 403);
  }

  const newLikes = (entity.likes ?? 0) + 1;

  await strapi.documents('plugin::comments.comment').update({
    documentId,
    data: { likes: newLikes } as never,
  });

  return newLikes;
}

/**
 * Décrémente le compteur de likes d'un commentaire (minimum 0).
 *
 * Vérifie l'existence du commentaire et l'absence de blocage avant de décrémenter.
 * La protection contre le spam est déléguée au middleware rate-limit
 * configuré sur la route — même logique que likeComment.
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du commentaire à unliker
 * @returns Nouveau compteur de likes après décrément
 * @throws CommentServiceError 404 si le commentaire est introuvable
 * @throws CommentServiceError 403 si le commentaire est bloqué
 */
export async function unlikeComment(
  strapi: Core.Strapi,
  documentId: string
): Promise<number> {
  const comment = await strapi.documents('plugin::comments.comment').findOne({
    documentId,
    fields: ['documentId', 'blocked', 'likes'],
  });

  if (!comment) {
    throw new CommentServiceError('Commentaire introuvable.', 404);
  }

  const entity = comment as unknown as { blocked: boolean; likes?: number };

  if (entity.blocked) {
    throw new CommentServiceError('Impossible de retirer un like sur un commentaire bloqué.', 403);
  }

  const newLikes = Math.max(0, (entity.likes ?? 0) - 1);

  await strapi.documents('plugin::comments.comment').update({
    documentId,
    data: { likes: newLikes } as never,
  });

  return newLikes;
}

/**
 * Construit la structure arborescente parent → children depuis une liste plate.
 * Utilisé quand les données ne sont pas populées via Strapi.
 *
 * @param flatComments - Liste plate de commentaires
 * @returns Liste des commentaires racine avec leurs enfants imbriqués
 */
export function buildTree(flatComments: CommentEntity[]): CommentTree[] {
  const commentMap = new Map<string, CommentTree>();

  // Première passe : indexation de tous les commentaires
  for (const comment of flatComments) {
    commentMap.set(comment.documentId, {
      ...comment,
      children: [],
    });
  }

  const roots: CommentTree[] = [];

  // Deuxième passe : construction de l'arbre
  for (const comment of flatComments) {
    const treeNode = commentMap.get(comment.documentId)!;

    if (comment.parent && comment.parent.documentId) {
      const parentNode = commentMap.get(comment.parent.documentId);
      if (parentNode) {
        parentNode.children.push(treeNode);
      } else {
        // Parent introuvable dans la liste → commentaire racine orphelin
        roots.push(treeNode);
      }
    } else {
      roots.push(treeNode);
    }
  }

  return roots;
}

/**
 * Enrichit un commentaire avec les données d'avatar calculées.
 * Ajoute { avatar: { initial, color } } à la réponse.
 *
 * @param comment - Commentaire brut
 * @param config - Configuration du plugin
 */
function enrichWithAvatar(comment: CommentEntity, config: PluginConfig): CommentTree {
  const avatar = config.avatar.enabled
    ? avatarService.getAvatarData(comment.firstname, config.avatar.palette)
    : undefined;

  const children: CommentTree[] = (comment.children ?? []).map((child) =>
    enrichWithAvatar(child, config)
  );

  return {
    ...comment,
    children,
    ...(avatar ? { avatar } : {}),
  };
}
