/**
 * Service de gestion des signalements de commentaires.
 *
 * Responsabilités :
 *   - create    : validation, enregistrement, vérification du seuil d'auto-masquage
 *   - findAll   : liste paginée avec filtres pour l'interface admin
 *   - markReviewed / dismiss : mise à jour du statut
 *   - checkThreshold : auto-masque un commentaire si le nombre de signalements atteint le seuil
 *   - countPending : compteur pour le badge admin
 *
 * Pilier OWASP : l'email du signalant n'est jamais exposé dans les réponses publiques.
 * Pilier Perf  : countPending utilise COUNT DB, pas un findMany en mémoire.
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from '../config';
import { type ReportEntity, type ReportReason, type ReportStatus } from '../types/strapi';

/** Données d'entrée pour la création d'un signalement */
export interface CreateReportInput {
  commentDocumentId: string;
  reason: ReportReason;
  description?: string;
  reporterEmail: string;
}

/** Erreur métier du service signalements */
export class ReportServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ReportServiceError';
  }
}

/**
 * Crée un signalement pour un commentaire.
 * Vérifie l'existence du commentaire, enregistre le signalement
 * puis déclenche la vérification du seuil d'auto-masquage.
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration du plugin
 * @param data - Données du signalement
 * @returns Signalement créé
 */
export async function create(
  strapi: Core.Strapi,
  config: PluginConfig,
  data: CreateReportInput
): Promise<ReportEntity> {
  // Vérification de l'existence du commentaire cible
  const comment = await strapi.documents('plugin::comments.comment').findOne({
    documentId: data.commentDocumentId,
    fields: ['documentId', 'blocked'],
  });

  if (!comment) {
    throw new ReportServiceError('Commentaire introuvable.', 404);
  }

  const commentEntity = comment as unknown as { documentId: string; blocked: boolean };

  if (commentEntity.blocked) {
    // Le commentaire est déjà bloqué — pas besoin de signalement supplémentaire
    throw new ReportServiceError('Ce commentaire a déjà été traité.', 409);
  }

  // Enregistrement du signalement
  const created = await strapi.documents('plugin::comments.report').create({
    data: {
      reason: data.reason,
      description: data.description ?? null,
      reporterEmail: data.reporterEmail.toLowerCase(),
      comment: { connect: [{ documentId: data.commentDocumentId }] },
      status: 'pending',
    },
  });

  // Vérification asynchrone du seuil d'auto-masquage (fail-open)
  if (config.reportThreshold.enabled) {
    checkThreshold(strapi, config, data.commentDocumentId).catch((err: unknown) => {
      // SEC-005 : une erreur dans checkThreshold peut laisser un commentaire signalé
      // en ligne sans être masqué. On log en error (pas warn) pour alerter le monitoring.
      strapi.log.error(
        '[strapi-plugin-comments][sécurité] Échec vérification seuil auto-masquage — ' +
        `le commentaire ${data.commentDocumentId} pourrait ne pas avoir été bloqué : ${String(err)}`
      );
    });
  }

  return created as unknown as ReportEntity;
}

/**
 * Vérifie si le nombre de signalements « pending » d'un commentaire
 * atteint le seuil configuré. Si oui, bloque automatiquement le commentaire.
 *
 * @param strapi - Instance Strapi
 * @param config - Configuration du plugin
 * @param commentDocumentId - documentId du commentaire à vérifier
 */
export async function checkThreshold(
  strapi: Core.Strapi,
  config: PluginConfig,
  commentDocumentId: string
): Promise<void> {
  const pendingCount = await strapi.documents('plugin::comments.report').count({
    filters: {
      comment: { documentId: { $eq: commentDocumentId } },
      status: { $eq: 'pending' },
    } as never,
  });

  if (pendingCount >= config.reportThreshold.count) {
    await strapi.documents('plugin::comments.comment').update({
      documentId: commentDocumentId,
      data: { blocked: true } as never,
    });

    // Émission de l'événement lifecycle pour les hooks éventuels du projet hôte
    strapi.eventHub.emit('comment.auto-blocked', {
      commentDocumentId,
      reportCount: pendingCount,
      threshold: config.reportThreshold.count,
    });

    console.info(
      `[strapi-plugin-comments] Commentaire ${commentDocumentId} auto-bloqué ` +
      `(${pendingCount} signalements ≥ seuil ${config.reportThreshold.count}).`
    );
  }
}

/**
 * Liste les signalements avec filtres et pagination pour l'interface admin.
 *
 * @param strapi - Instance Strapi
 * @param filters - Filtres optionnels (status, commentDocumentId)
 * @param pagination - Options de pagination
 * @returns Liste paginée des signalements
 */
export async function findAll(
  strapi: Core.Strapi,
  filters: { status?: ReportStatus; commentDocumentId?: string },
  pagination: { page: number; pageSize: number }
): Promise<{ data: ReportEntity[]; total: number }> {
  const dbFilters: Record<string, unknown> = {};

  if (filters.status) {
    dbFilters['status'] = { $eq: filters.status };
  }

  if (filters.commentDocumentId) {
    dbFilters['comment'] = { documentId: { $eq: filters.commentDocumentId } };
  }

  const [data, total] = await Promise.all([
    strapi.documents('plugin::comments.report').findMany({
      filters: dbFilters as never,
      populate: {
        comment: {
          fields: ['documentId', 'firstname', 'content', 'blocked', 'approved'],
        },
      },
      sort: ['createdAt:desc'],
      // Pagination v5 : limit/start à la racine (pagination:{page,pageSize} ignoré)
      limit: pagination.pageSize,
      start: (pagination.page - 1) * pagination.pageSize,
    }),
    strapi.documents('plugin::comments.report').count({
      filters: dbFilters as never,
    }),
  ]);

  return { data: data as unknown as ReportEntity[], total };
}

/**
 * Marque un signalement comme examiné.
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du signalement
 * @returns Signalement mis à jour
 */
export async function markReviewed(
  strapi: Core.Strapi,
  documentId: string
): Promise<ReportEntity> {
  return updateStatus(strapi, documentId, 'reviewed');
}

/**
 * Rejette un signalement (le marque comme non fondé).
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du signalement
 * @returns Signalement mis à jour
 */
export async function dismiss(
  strapi: Core.Strapi,
  documentId: string
): Promise<ReportEntity> {
  return updateStatus(strapi, documentId, 'dismissed');
}

/**
 * Met à jour le statut d'un signalement.
 *
 * @param strapi - Instance Strapi
 * @param documentId - documentId du signalement
 * @param status - Nouveau statut
 * @returns Signalement mis à jour
 */
export async function updateStatus(
  strapi: Core.Strapi,
  documentId: string,
  status: ReportStatus
): Promise<ReportEntity> {
  const existing = await strapi.documents('plugin::comments.report').findOne({
    documentId,
    fields: ['documentId', 'status'],
  });

  if (!existing) {
    throw new ReportServiceError('Signalement introuvable.', 404);
  }

  const updated = await strapi.documents('plugin::comments.report').update({
    documentId,
    data: { status } as never,
    populate: {
      comment: {
        fields: ['documentId', 'firstname', 'content', 'blocked', 'approved'],
      },
    },
  });

  return updated as unknown as ReportEntity;
}

/**
 * Compte les signalements en statut « pending ».
 * Utilisé pour le badge de notification dans la sidebar admin.
 *
 * @param strapi - Instance Strapi
 * @returns Nombre de signalements en attente
 */
export async function countPending(strapi: Core.Strapi): Promise<number> {
  return strapi.documents('plugin::comments.report').count({
    filters: { status: { $eq: 'pending' } } as never,
  });
}
