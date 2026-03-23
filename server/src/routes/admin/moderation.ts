/**
 * Routes admin (modération) du plugin comments.
 *
 * Toutes les routes sont protégées par la policy is-admin.
 * Elles ne sont accessibles que via le tableau de bord Strapi admin.
 *
 * Préfixe appliqué par Strapi : /comments/admin/*
 * Note BUG-010 : les paths ne doivent pas inclure le nom du plugin.
 */

import { type RouteConfig } from '../../types/strapi';

const adminRoutes: RouteConfig = {
  type: 'admin',
  routes: [
    // ── Statistiques ──────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/admin/stats',
      handler: 'moderation.stats',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Statistiques agrégées du tableau de bord (total, pending, signalements)',
      },
    },

    // ── Configuration ─────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/admin/config',
      handler: 'moderation.getConfig',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Lecture de la configuration courante du plugin',
      },
    },

    // ── Licence ───────────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/admin/license',
      handler: 'moderation.getLicense',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Retourne le tier de licence actuel et les fonctionnalités déverrouillées',
      },
    },
    {
      method: 'POST',
      path: '/admin/license/verify',
      handler: 'moderation.verifyLicense',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Vérifie une clé de licence sans la persister (validation locale)',
      },
    },

    // ── Commentaires ─────────────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/admin/comments',
      handler: 'moderation.findAll',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Liste tous les commentaires avec filtres et pagination',
      },
    },
    {
      method: 'GET',
      path: '/admin/comments/:id',
      handler: 'moderation.findOne',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: "Détail complet d'un commentaire (avec author, parent, children)",
      },
    },
    {
      method: 'POST',
      path: '/admin/comments/:id/reply',
      handler: 'moderation.adminReply',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : réponse admin WYSIWYG réservée au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Crée une réponse admin avec contenu WYSIWYG (toujours approuvée) — Pro uniquement',
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/:id/approve',
      handler: 'moderation.approve',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Approuve un commentaire en attente de modération',
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/:id/block',
      handler: 'moderation.block',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Bloque un commentaire (le masque du frontend)',
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/:id/block-author',
      handler: 'moderation.blockAuthor',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: "Bloque l'auteur d'un commentaire (tous ses futurs commentaires rejetés)",
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/:id/unblock',
      handler: 'moderation.unblock',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Débloque un commentaire et son auteur associé',
      },
    },
    {
      method: 'GET',
      path: '/admin/settings',
      handler: 'moderation.getSettings',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Lecture des paramètres du plugin (stockés en base)',
      },
    },
    {
      method: 'PUT',
      path: '/admin/settings',
      handler: 'moderation.updateSettings',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Mise à jour des paramètres du plugin (stockés en base)',
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/:id/pin',
      handler: 'moderation.togglePin',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : épinglage réservé au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Épingle ou désépingle un commentaire (toggle pinned) — Pro uniquement',
      },
    },
    {
      method: 'DELETE',
      path: '/admin/comments/:id',
      handler: 'moderation.delete',
      config: {
        policies: ['plugin::comments.is-admin'],
        middlewares: [],
        description: 'Supprime définitivement un commentaire et ses réponses (cascade)',
      },
    },

    // ── Actions en masse (Pro) ───────────────────────────────────────────────
    {
      method: 'PUT',
      path: '/admin/comments/bulk-approve',
      handler: 'moderation.bulkApprove',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : actions en masse réservées au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Approuve plusieurs commentaires en une seule requête — Pro uniquement',
      },
    },
    {
      method: 'PUT',
      path: '/admin/comments/bulk-block',
      handler: 'moderation.bulkBlock',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : actions en masse réservées au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Bloque plusieurs commentaires en une seule requête — Pro uniquement',
      },
    },
    {
      method: 'DELETE',
      path: '/admin/comments/bulk-delete',
      handler: 'moderation.bulkDelete',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : actions en masse réservées au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Supprime plusieurs commentaires en une seule requête — Pro uniquement',
      },
    },

    // ── Signalements (Pro) ───────────────────────────────────────────────────
    {
      method: 'GET',
      path: '/admin/reports',
      handler: 'report.findAll',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : liste des signalements réservée au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Liste paginée des signalements avec filtres (status, commentId) — Pro uniquement',
      },
    },
    {
      method: 'PUT',
      path: '/admin/reports/:id/review',
      handler: 'report.markReviewed',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : actions sur signalements réservées au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Marque un signalement comme examiné — Pro uniquement',
      },
    },
    {
      method: 'PUT',
      path: '/admin/reports/:id/dismiss',
      handler: 'report.dismiss',
      config: {
        policies: ['plugin::comments.is-admin'],
        // Pro : actions sur signalements réservées au tier Pro
        middlewares: ['plugin::comments.license-gate'],
        description: 'Rejette un signalement (non fondé) — Pro uniquement',
      },
    },
  ],
};

export default adminRoutes;
