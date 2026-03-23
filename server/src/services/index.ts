/**
 * Export des services du plugin comments.
 * Strapi V5 enregistre ces services sous le namespace plugin::comments.*
 *
 * Accès depuis les controllers :
 *   strapi.plugin('comments').service('comment')
 *   strapi.plugin('comments').service('avatar')
 *   strapi.plugin('comments').service('profanity')
 *   strapi.plugin('comments').service('recaptcha')
 *   strapi.plugin('comments').service('subscriber')
 *   strapi.plugin('comments').service('report')
 *   strapi.plugin('comments').service('admin-stats')
 *   strapi.plugin('comments').service('license')
 */

import { type Core } from '@strapi/strapi';
import { type PluginConfig } from '../config';
import { type ReportStatus } from '../types/strapi';
import { createLicenseService } from './license';

/**
 * Factory des services — chaque service reçoit l'instance Strapi via closure.
 * Pattern recommandé Strapi V5 pour les services qui dépendent de strapi.documents().
 */
export default {
  /**
   * Service commentaires principal.
   * Exposé sous : plugin::comments.comment
   */
  comment: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      findByDocument: (
        relatedDocumentId: string,
        relatedCollection: string,
        options?: Parameters<typeof import('./comment').findByDocument>[4]
      ) => import('./comment').then(({ findByDocument }) =>
        findByDocument(strapi, getConfig(), relatedDocumentId, relatedCollection, options)
      ),

      findOne: (documentId: string, isAdmin?: boolean) =>
        import('./comment').then(({ findOne }) =>
          findOne(strapi, getConfig(), documentId, isAdmin)
        ),

      create: (data: Parameters<typeof import('./comment').create>[2]) =>
        import('./comment').then(({ create }) =>
          create(strapi, getConfig(), data)
        ),

      createReply: (
        parentDocumentId: string,
        data: Parameters<typeof import('./comment').createReply>[3]
      ) =>
        import('./comment').then(({ createReply }) =>
          createReply(strapi, getConfig(), parentDocumentId, data)
        ),

      delete: (documentId: string) =>
        import('./comment').then(({ deleteComment }) =>
          deleteComment(strapi, documentId)
        ),

      like: (documentId: string) =>
        import('./comment').then(({ likeComment }) =>
          likeComment(strapi, documentId)
        ),

      unlike: (documentId: string) =>
        import('./comment').then(({ unlikeComment }) =>
          unlikeComment(strapi, documentId)
        ),

      buildTree: (flatComments: Parameters<typeof import('./comment').buildTree>[0]) =>
        import('./comment').then(({ buildTree }) => buildTree(flatComments)),
    };
  },

  /**
   * Service avatar — génération données initiale + couleur.
   * Exposé sous : plugin::comments.avatar
   * Service pur, sans dépendance Strapi.
   */
  avatar: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      generateColor: (firstname: string) => {
        const { generateColor } = require('./avatar') as typeof import('./avatar');
        return generateColor(firstname, getConfig().avatar.palette);
      },
      getAvatarData: (firstname: string) => {
        const { getAvatarData } = require('./avatar') as typeof import('./avatar');
        return getAvatarData(firstname, getConfig().avatar.palette);
      },
    };
  },

  /**
   * Service filtre anti-injures — wrapper leo-profanity.
   * Exposé sous : plugin::comments.profanity
   */
  profanity: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      init: () => {
        const { init } = require('./profanity') as typeof import('./profanity');
        return init(getConfig().profanityFilter.languages);
      },
      check: (text: string) => {
        const { check } = require('./profanity') as typeof import('./profanity');
        return check(text, getConfig().profanityFilter.failOpen);
      },
      clean: (text: string) => {
        const { clean } = require('./profanity') as typeof import('./profanity');
        return clean(text);
      },
    };
  },

  /**
   * Service reCAPTCHA V3 — vérification serveur-side.
   * Exposé sous : plugin::comments.recaptcha
   */
  recaptcha: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      verify: (token: string, remoteIp?: string) => {
        const { verify, isConfigured } = require('./recaptcha') as typeof import('./recaptcha');
        const config = getConfig();
        const secretKey = process.env['RECAPTCHA_SECRET_KEY'];

        if (!config.recaptcha.enabled || !isConfigured()) {
          return Promise.resolve({ success: true });
        }

        return verify(
          token,
          secretKey!,
          config.recaptcha.scoreThreshold,
          remoteIp,
          config.recaptcha.failClosed
        );
      },
    };
  },

  /**
   * Service abonné — inscription automatique des commentateurs.
   * Exposé sous : plugin::comments.subscriber
   */
  subscriber: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      ensureSubscriberCategory: () => {
        const { ensureSubscriberCategory } = require('./subscriber') as typeof import('./subscriber');
        const config = getConfig();
        return ensureSubscriberCategory(strapi, {
          categoryName: config.subscriber.categoryName,
          categorySlug: config.subscriber.categorySlug,
        });
      },
      registerAsSubscriber: (email: string, firstname: string) => {
        const { registerAsSubscriber } = require('./subscriber') as typeof import('./subscriber');
        const config = getConfig();
        return registerAsSubscriber(strapi, email, firstname, {
          categoryName: config.subscriber.categoryName,
          categorySlug: config.subscriber.categorySlug,
        });
      },
    };
  },

  /**
   * Service signalements — gestion des reports de commentaires.
   * Exposé sous : plugin::comments.report
   */
  report: ({ strapi }: { strapi: Core.Strapi }) => {
    const getConfig = (): PluginConfig =>
      strapi.config.get('plugin::comments') as unknown as PluginConfig;

    return {
      create: (data: Parameters<typeof import('./report').create>[2]) => {
        const { create } = require('./report') as typeof import('./report');
        return create(strapi, getConfig(), data);
      },

      checkThreshold: (commentDocumentId: string) => {
        const { checkThreshold } = require('./report') as typeof import('./report');
        return checkThreshold(strapi, getConfig(), commentDocumentId);
      },

      findAll: (
        filters: { status?: ReportStatus; commentDocumentId?: string },
        pagination: { page: number; pageSize: number }
      ) => {
        const { findAll } = require('./report') as typeof import('./report');
        return findAll(strapi, filters, pagination);
      },

      markReviewed: (documentId: string) => {
        const { markReviewed } = require('./report') as typeof import('./report');
        return markReviewed(strapi, documentId);
      },

      dismiss: (documentId: string) => {
        const { dismiss } = require('./report') as typeof import('./report');
        return dismiss(strapi, documentId);
      },

      updateStatus: (documentId: string, status: ReportStatus) => {
        const { updateStatus } = require('./report') as typeof import('./report');
        return updateStatus(strapi, documentId, status);
      },

      countPending: () => {
        const { countPending } = require('./report') as typeof import('./report');
        return countPending(strapi);
      },
    };
  },

  /**
   * Service statistiques admin — agrégation pour le tableau de bord.
   * Exposé sous : plugin::comments.admin-stats
   */
  'admin-stats': ({ strapi }: { strapi: Core.Strapi }) => ({
    getStats: () => {
      const { getStats } = require('./admin-stats') as typeof import('./admin-stats');
      return getStats(strapi);
    },
  }),

  /**
   * Service de licence freemium — gestion des tiers Community et Pro.
   * Exposé sous : plugin::comments.license
   *
   * Accès :
   *   strapi.plugin('comments').service('license').getTier()
   *   strapi.plugin('comments').service('license').isProLicense()
   */
  license: ({ strapi }: { strapi: Core.Strapi }) => createLicenseService(strapi),
};
