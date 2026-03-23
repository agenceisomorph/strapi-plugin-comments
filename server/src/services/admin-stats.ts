/**
 * Service des statistiques admin du plugin comments.
 *
 * Performance : toutes les valeurs sont récupérées via des requêtes COUNT parallèles
 * (Promise.all) plutôt que des COUNT GROUP BY qui nécessiteraient une requête SQL brute.
 * En pratique, 5 COUNT en parallèle sur des index DB = ~5 ms, acceptable pour un dashboard.
 *
 * Pilier Perf ISOMORPH : une seule passe DB, pas de traitement en mémoire.
 */

import { type Core } from '@strapi/strapi';
import { type AdminStats } from '../types/strapi';

/**
 * Calcule les statistiques du tableau de bord admin.
 * Effectue les comptages DB en parallèle pour minimiser la latence.
 *
 * @param strapi - Instance Strapi
 * @returns Statistiques agrégées
 */
export async function getStats(strapi: Core.Strapi): Promise<AdminStats> {
  const [
    totalComments,
    pendingApproval,
    approvedComments,
    blockedComments,
    totalReports,
    pendingReports,
  ] = await Promise.all([
    // Total commentaires (tous statuts)
    strapi.documents('plugin::comments.comment').count({}),

    // En attente de modération : non approuvés et non bloqués
    strapi.documents('plugin::comments.comment').count({
      filters: {
        approved: { $eq: false },
        blocked: { $eq: false },
      } as never,
    }),

    // Approuvés et non bloqués
    strapi.documents('plugin::comments.comment').count({
      filters: {
        approved: { $eq: true },
        blocked: { $eq: false },
      } as never,
    }),

    // Bloqués
    strapi.documents('plugin::comments.comment').count({
      filters: { blocked: { $eq: true } } as never,
    }),

    // Total signalements
    strapi.documents('plugin::comments.report').count({}),

    // Signalements en attente
    strapi.documents('plugin::comments.report').count({
      filters: { status: { $eq: 'pending' } } as never,
    }),
  ]);

  return {
    totalComments,
    pendingApproval,
    approvedComments,
    blockedComments,
    reports: {
      total: totalReports,
      pending: pendingReports,
    },
  };
}
