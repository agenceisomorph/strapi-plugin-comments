/**
 * Controller de modération — routes admin protégées.
 *
 * Toutes les routes sont protégées par la policy is-admin.
 * Accès réservé aux utilisateurs authentifiés avec rôle strapi-admin.
 *
 * Principe ISOMORPH : validation Zod + appel service + réponse formatée.
 * Aucune logique métier dans le controller.
 */

import { z } from 'zod';
import xss from 'xss';
import { type Core } from '@strapi/strapi';
import { type StrapiContext, type StrapiAdminUser } from '../types/strapi';
import { type PluginConfig } from '../config';
import { CommentServiceError } from '../services/comment';
import { getStats } from '../services/admin-stats';
import {
  validateLicenseKey,
  COMMUNITY_COMMENT_LIMIT,
  PRO_PURCHASE_URL,
  type LicenseTier,
} from '../services/license';

// ─── Schémas de validation Zod ────────────────────────────────────────────────

/**
 * Schéma de validation du body pour POST /admin/comments/:id/reply.
 */
const AdminReplySchema = z.object({
  contentHtml: z
    .string()
    .min(1, 'Le contenu de la réponse est requis.')
    .max(50_000, 'La réponse ne peut pas dépasser 50 000 caractères.'),
  adminEmail: z.string().email('Adresse email admin invalide.').optional(),
  firstname: z.string().max(100).optional().default('Admin'),
});

/**
 * Schéma de validation des query params pour GET /comments/admin/comments.
 */
const FindAllQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
  approved: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  blocked: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  relatedCollection: z.string().optional(),
  sortBy: z.enum(['createdAt', 'updatedAt', 'firstname', 'email', 'approved', 'blocked']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// ─── Controller de modération ─────────────────────────────────────────────────

/**
 * Factory du controller de modération.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * GET /comments/admin/comments
   * Liste tous les commentaires avec filtres et pagination.
   */
  async findAll(ctx: StrapiContext): Promise<void> {
    const parseResult = FindAllQuerySchema.safeParse(ctx.query);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Paramètres invalides.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const { page, pageSize, approved, blocked, relatedCollection, sortBy, sortOrder } =
      parseResult.data;

    // Construction des filtres dynamiques
    const filters: Record<string, unknown> = {};

    if (approved !== undefined) {
      filters['approved'] = { $eq: approved };
    }

    if (blocked !== undefined) {
      filters['blocked'] = { $eq: blocked };
    }

    if (relatedCollection) {
      filters['relatedCollection'] = { $eq: relatedCollection };
    }

    // BUG-4 : le Document Service Strapi v5 pagine avec `limit`/`start` à la racine
    // (`offset` n'existe pas, et `pagination: { page, pageSize }` est ignoré
    // silencieusement — vérifié sur banc d'essai 2026-07-11 : pageSize=2 renvoyait
    // tous les enregistrements).
    const findParams = {
      filters: filters as never,
      populate: {
        author: true,
        parent: true,
        children: true,
      },
      sort: [`${sortBy}:${sortOrder}`],
      limit: pageSize,
      start: (page - 1) * pageSize,
    };

    const results = await strapi.documents('plugin::comments.comment').findMany(findParams);
    const total = await strapi.documents('plugin::comments.comment').count({ filters: filters as never });

    ctx.status = 200;
    ctx.body = {
      data: results,
      meta: {
        pagination: {
          page,
          pageSize,
          pageCount: Math.ceil(total / pageSize),
          total,
        },
      },
    };
  },

  /**
   * GET /comments/admin/comments/:id
   * Détail complet d'un commentaire (avec author, parent, children).
   */
  async findOne(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const comment = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      populate: {
        author: true,
        parent: true,
        children: {
          populate: { author: true },
        },
      },
    });

    if (!comment) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    ctx.status = 200;
    ctx.body = { data: comment };
  },

  /**
   * PUT /comments/admin/comments/:id/approve
   * Approuve un commentaire en attente de modération.
   */
  async approve(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const existing = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
    });

    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    const updated = await strapi.documents('plugin::comments.comment').update({
      documentId: id,
      data: { approved: true } as never,
    });

    strapi.eventHub.emit('comment.approved', { comment: updated });

    ctx.status = 200;
    ctx.body = { data: updated };
  },

  /**
   * PUT /comments/admin/comments/:id/block
   * Bloque un commentaire (le masque du frontend).
   */
  async block(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const existing = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
    });

    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    const updated = await strapi.documents('plugin::comments.comment').update({
      documentId: id,
      data: { blocked: true } as never,
    });

    strapi.eventHub.emit('comment.blocked', {
      comment: updated,
      blockedBy: ctx.state.user,
    });

    ctx.status = 200;
    ctx.body = { data: updated };
  },

  /**
   * PUT /comments/admin/comments/:id/block-author
   * Bloque l'auteur d'un commentaire.
   * Tous ses futurs commentaires seront rejetés par le service.
   */
  async blockAuthor(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    // Récupération du commentaire avec son auteur
    const comment = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      populate: { author: true },
    });

    if (!comment) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    const commentWithAuthor = comment as unknown as {
      author?: { documentId: string; email: string; blocked: boolean };
    };

    if (!commentWithAuthor.author) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: 'Ce commentaire n\'est pas associé à un auteur enregistré.',
        },
      };
      return;
    }

    // Blocage de l'utilisateur
    const updatedUser = await strapi.documents('plugin::users-permissions.user').update({
      documentId: commentWithAuthor.author.documentId,
      data: { blocked: true } as never,
    });

    // Émission de l'événement lifecycle
    strapi.eventHub.emit('comment.author.blocked', { user: updatedUser });

    ctx.status = 200;
    ctx.body = {
      data: {
        comment,
        author: updatedUser,
        blocked: true,
      },
    };
  },

  /**
   * GET /comments/admin/stats
   * Retourne les statistiques agrégées du tableau de bord admin.
   */
  async stats(ctx: StrapiContext): Promise<void> {
    const adminStats = await getStats(strapi);

    ctx.status = 200;
    ctx.body = { data: adminStats };
  },

  /**
   * POST /comments/admin/comments/:id/reply
   * Crée une réponse admin avec contenu WYSIWYG.
   *
   * La réponse est toujours approuvée (approved=true), même si la modération est activée.
   * Le contentHtml est sanitisé côté serveur avant stockage (OWASP A03 XSS).
   */
  async adminReply(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const parseResult = AdminReplySchema.safeParse(ctx.request.body);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Données invalides.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const { contentHtml, adminEmail, firstname } = parseResult.data;

    // Vérification que le commentaire parent existe et n'est pas bloqué
    const parent = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      populate: { parent: true },
    });

    if (!parent) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    const parentEntity = parent as unknown as {
      documentId: string;
      blocked: boolean;
      relatedDocumentId: string;
      relatedCollection: string;
      parent?: { documentId: string } | null;
    };

    if (parentEntity.blocked) {
      ctx.status = 400;
      ctx.body = {
        error: { status: 400, message: 'Impossible de répondre à un commentaire bloqué.' },
      };
      return;
    }

    // ADR-01 : Vérification de profondeur N-1 (les réponses admin respectent la même limite)
    if (parentEntity.parent !== null && parentEntity.parent !== undefined) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: 'Les réponses ne peuvent pas être imbriquées au-delà d\'un niveau.',
        },
      };
      return;
    }

    // Sanitisation XSS du contenu HTML avant stockage (OWASP A03)
    const sanitizedHtml = xss(contentHtml);

    // Récupération de l'email admin depuis le contexte d'authentification si non fourni
    const adminUser = ctx.state.user as StrapiAdminUser | undefined;
    const resolvedEmail =
      adminEmail ?? adminUser?.email ?? 'admin@isomorph.fr';
    const resolvedFirstname = firstname ?? adminUser?.firstname ?? 'Admin';

    // Création de la réponse admin
    const reply = await strapi.documents('plugin::comments.comment').create({
      data: {
        firstname: resolvedFirstname,
        email: resolvedEmail.toLowerCase(),
        content: sanitizedHtml.replace(/<[^>]*>/g, '').slice(0, 2000),
        contentHtml: sanitizedHtml,
        isAdminReply: true,
        blocked: false,
        approved: true,
        relatedDocumentId: parentEntity.relatedDocumentId,
        relatedCollection: parentEntity.relatedCollection,
        parent: { connect: [{ documentId: id }] },
      },
      populate: {
        parent: true,
      },
    });

    // Émission de l'événement lifecycle
    strapi.eventHub.emit('comment.admin-replied', {
      reply,
      parentCommentId: id,
      adminEmail: resolvedEmail,
    });

    ctx.status = 201;
    ctx.body = { data: reply };
  },

  /**
   * GET /comments/admin/config
   * Retourne la configuration courante du plugin (lecture seule en V1).
   */
  async getConfig(ctx: StrapiContext): Promise<void> {
    const config = strapi.config.get('plugin::comments') as unknown as PluginConfig;

    // On ne retourne pas les secrets (clés API, etc.) — uniquement les options comportementales
    ctx.status = 200;
    ctx.body = {
      data: {
        targetCollection: config.targetCollection,
        requireApproval: config.requireApproval,
        allowDelete: config.allowDelete,
        profanityFilter: {
          enabled: config.profanityFilter.enabled,
          languages: config.profanityFilter.languages,
          action: config.profanityFilter.action,
        },
        rateLimit: {
          enabled: config.rateLimit.enabled,
          windowMs: config.rateLimit.windowMs,
          max: config.rateLimit.max,
        },
        avatar: {
          enabled: config.avatar.enabled,
        },
        subscriber: {
          enabled: config.subscriber.enabled,
          categoryName: config.subscriber.categoryName,
        },
        moderation: config.moderation,
        reportThreshold: config.reportThreshold,
      },
    };
  },

  /**
   * PUT /comments/admin/comments/:id/unblock
   * Débloque un commentaire et son auteur associé.
   */
  async unblock(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const comment = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      populate: { author: true },
    });

    if (!comment) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    // Débloquer le commentaire
    const updated = await strapi.documents('plugin::comments.comment').update({
      documentId: id,
      data: { blocked: false, approved: true } as never,
    });

    // Débloquer l'auteur s'il est associé et bloqué
    const commentWithAuthor = comment as unknown as {
      author?: { documentId: string; blocked: boolean } | null;
    };

    if (commentWithAuthor.author?.blocked) {
      await strapi.documents('plugin::users-permissions.user').update({
        documentId: commentWithAuthor.author.documentId,
        data: { blocked: false } as never,
      });
    }

    strapi.eventHub.emit('comment.unblocked', { comment: updated });

    ctx.status = 200;
    ctx.body = { data: updated };
  },

  /**
   * GET /comments/admin/settings
   * Lecture des paramètres du plugin stockés en base (Strapi store).
   */
  async getSettings(ctx: StrapiContext): Promise<void> {
    const store = strapi.store({ type: 'plugin', name: 'comments' });
    const settings = (await store.get({ key: 'settings' })) as Record<string, unknown> | null;

    // Defaults depuis la config fichier ; les valeurs stockées (potentiellement
    // partielles — le PUT ne persiste que les clés modifiées) sont fusionnées
    // par-dessus pour que l'admin voie toujours l'état effectif complet.
    const config = strapi.config.get('plugin::comments') as unknown as PluginConfig;
    const defaults = {
      requireApproval: config.requireApproval ?? false,
      profanityFilterEnabled: config.profanityFilter?.enabled ?? true,
      profanityFilterLanguages: config.profanityFilter?.languages ?? ['fr', 'en'],
      profanityFilterAction: config.profanityFilter?.action ?? 'block',
      rateLimitEnabled: config.rateLimit?.enabled ?? true,
      rateLimitMax: config.rateLimit?.max ?? 5,
      rateLimitWindowMs: config.rateLimit?.windowMs ?? 60000,
      rateLimitWhitelist: config.rateLimit?.whitelist?.join(', ') ?? '',
      avatarEnabled: config.avatar?.enabled ?? true,
      subscriberEnabled: config.subscriber?.enabled ?? true,
      subscriberCategoryName: config.subscriber?.categoryName ?? 'Abonné',
      moderationEnabled: config.moderation?.enabled ?? false,
      reportThresholdEnabled: config.reportThreshold?.enabled ?? true,
      reportThresholdCount: config.reportThreshold?.count ?? 3,
      recaptchaEnabled: config.recaptcha?.enabled ?? false,
      // SEC-001 : on n'expose jamais les clés reCAPTCHA côté API.
      // Le booléen indique si la clé secrète est présente dans l'environnement.
      recaptchaConfigured: !!process.env.RECAPTCHA_SECRET_KEY,
      recaptchaMinScore: config.recaptcha?.scoreThreshold ?? 0.5,
    };

    ctx.status = 200;
    ctx.body = { data: { ...defaults, ...(settings ?? {}) } };
  },

  /**
   * PUT /comments/admin/settings
   * Mise à jour des paramètres du plugin (stockés en base via Strapi store).
   */
  async updateSettings(ctx: StrapiContext): Promise<void> {
    const SettingsSchema = z.object({
      requireApproval: z.boolean().optional(),
      profanityFilterEnabled: z.boolean().optional(),
      profanityFilterLanguages: z.array(z.string()).optional(),
      profanityFilterAction: z.enum(['block', 'sanitize']).optional(),
      rateLimitEnabled: z.boolean().optional(),
      rateLimitMax: z.number().int().positive().optional(),
      rateLimitWindowMs: z.number().int().positive().optional(),
      rateLimitWhitelist: z.string().max(1000).optional(),
      avatarEnabled: z.boolean().optional(),
      subscriberEnabled: z.boolean().optional(),
      subscriberCategoryName: z.string().max(100).optional(),
      moderationEnabled: z.boolean().optional(),
      reportThresholdEnabled: z.boolean().optional(),
      reportThresholdCount: z.number().int().positive().optional(),
      recaptchaEnabled: z.boolean().optional(),
      // SEC-001 : recaptchaSiteKey et recaptchaSecretKey exclus du schéma —
      // les clés reCAPTCHA ne doivent jamais transiter par l'API ni être stockées en base.
      recaptchaMinScore: z.number().min(0).max(1).optional(),
    });

    // Accepte le corps enveloppé { data: {...} } (convention des autres endpoints)
    // comme le corps à plat. Sans ce déballage, Zod strippe la clé inconnue `data`
    // et persiste un objet vide : PUT 200 mais réglages perdus en silence
    // (constaté sur banc d'essai 2026-07-11).
    const rawBody = (ctx.request.body as Record<string, unknown>)?.['data'] ?? ctx.request.body;
    const parseResult = SettingsSchema.safeParse(rawBody);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Données invalides.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const store = strapi.store({ type: 'plugin', name: 'comments' });
    const current = (await store.get({ key: 'settings' })) as Record<string, unknown> | null;

    // SEC-001 : filtrage défensif — même si le schéma Zod ne les accepte plus,
    // on s'assure qu'aucune clé reCAPTCHA ne sera jamais persistée en base.
    const safeData = { ...parseResult.data } as Record<string, unknown>;
    delete safeData['recaptchaSiteKey'];
    delete safeData['recaptchaSecretKey'];

    const merged = { ...(current ?? {}), ...safeData };

    await store.set({ key: 'settings', value: merged });

    ctx.status = 200;
    ctx.body = { data: merged };
  },

  /**
   * PUT /comments/admin/comments/:id/pin
   * Épingle ou désépingle un commentaire (toggle pinned).
   */
  async togglePin(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const existing = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      fields: ['documentId', 'pinned'],
    });

    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    const entity = existing as unknown as { pinned?: boolean };
    const newPinned = !entity.pinned;

    const updated = await strapi.documents('plugin::comments.comment').update({
      documentId: id,
      data: { pinned: newPinned } as never,
    });

    ctx.status = 200;
    ctx.body = { data: updated };
  },

  // ── Licence ───────────────────────────────────────────────────────────────

  /**
   * GET /comments/admin/license
   * Retourne le tier de licence actuel, le nombre de commentaires utilisés
   * et la liste des fonctionnalités déverrouillées.
   *
   * SÉCURITÉ : la clé de licence n'est jamais retournée au client.
   * On retourne uniquement le tier résolu et la clé masquée.
   */
  async getLicense(ctx: StrapiContext): Promise<void> {
    const licenseService = strapi.plugin('comments').service('license') as {
      getTier: () => LicenseTier;
      isProLicense: () => boolean;
      getMaskedKey: () => string | null;
    };

    const tier = licenseService.getTier();

    // Comptage des commentaires (utile pour l'affichage Community)
    let commentCount = 0;
    try {
      commentCount = await strapi.documents('plugin::comments.comment').count({});
    } catch {
      // Fail-open : si la base n'est pas accessible, on retourne 0
    }

    // Définition des fonctionnalités par tier
    const features = {
      // Fonctionnalités Community (toujours disponibles)
      crud: true,
      profanityFilter: true,
      avatar: true,
      likes: true,
      adminBasic: true,

      // Fonctionnalités Pro
      unlimitedComments: tier === 'pro',
      bulkActions: tier === 'pro',
      pinning: tier === 'pro',
      reports: tier === 'pro',
      adminReply: tier === 'pro',
      advancedSearch: tier === 'pro',
      rateLimit: tier === 'pro',
      recaptcha: tier === 'pro',
      notificationBadge: tier === 'pro',
    };

    ctx.status = 200;
    ctx.body = {
      data: {
        tier,
        maskedKey: licenseService.getMaskedKey(),
        commentCount,
        commentLimit: tier === 'community' ? COMMUNITY_COMMENT_LIMIT : null,
        upgradeUrl: tier === 'community' ? PRO_PURCHASE_URL : null,
        features,
      },
    };
  },

  /**
   * POST /comments/admin/license/verify
   * Vérifie une clé de licence (validation locale, sans persistance).
   *
   * Permet à l'admin de tester une clé avant de la configurer dans .env.
   * La clé soumise n'est jamais stockée — elle est uniquement validée.
   *
   * SÉCURITÉ OWASP A01 : validation côté serveur uniquement,
   * la réponse indique uniquement valid/invalid, pas les détails du checksum.
   */
  async verifyLicense(ctx: StrapiContext): Promise<void> {
    const VerifySchema = z.object({
      licenseKey: z
        .string()
        .min(1, 'La clé de licence est requise.')
        .max(200, 'Format de clé invalide.'),
    });

    const parseResult = VerifySchema.safeParse(ctx.request.body);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Clé invalide.',
        },
      };
      return;
    }

    const { licenseKey } = parseResult.data;
    const isValid = validateLicenseKey(licenseKey);

    ctx.status = 200;
    ctx.body = {
      data: {
        valid: isValid,
        tier: isValid ? 'pro' : 'community',
        message: isValid
          ? 'Clé de licence valide. Configurez COMMENTS_LICENSE_KEY dans votre .env pour activer le tier Pro.'
          : 'Clé de licence invalide. Vérifiez le format ou obtenez une clé sur ' + PRO_PURCHASE_URL,
      },
    };
  },

  // ── Actions en masse (Pro) ────────────────────────────────────────────────

  /**
   * PUT /comments/admin/comments/bulk-approve
   * Approuve plusieurs commentaires en une seule requête.
   * Réservé au tier Pro (contrôlé par le middleware license-gate sur la route).
   */
  async bulkApprove(ctx: StrapiContext): Promise<void> {
    const BulkSchema = z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    });

    const parseResult = BulkSchema.safeParse(ctx.request.body);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Liste d\'identifiants invalide.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const { ids } = parseResult.data;
    const updated: string[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await strapi.documents('plugin::comments.comment').update({
          documentId: id,
          data: { approved: true } as never,
        });
        updated.push(id);
      } catch {
        errors.push(id);
      }
    }

    strapi.eventHub.emit('comment.bulk-approved', { ids: updated });

    ctx.status = 200;
    ctx.body = {
      data: {
        updated: updated.length,
        errors: errors.length,
        updatedIds: updated,
        ...(errors.length > 0 && { errorIds: errors }),
      },
    };
  },

  /**
   * PUT /comments/admin/comments/bulk-block
   * Bloque plusieurs commentaires en une seule requête.
   * Réservé au tier Pro (contrôlé par le middleware license-gate sur la route).
   */
  async bulkBlock(ctx: StrapiContext): Promise<void> {
    const BulkSchema = z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    });

    const parseResult = BulkSchema.safeParse(ctx.request.body);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Liste d\'identifiants invalide.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const { ids } = parseResult.data;
    const updated: string[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await strapi.documents('plugin::comments.comment').update({
          documentId: id,
          data: { blocked: true, approved: false } as never,
        });
        updated.push(id);
      } catch {
        errors.push(id);
      }
    }

    strapi.eventHub.emit('comment.bulk-blocked', { ids: updated });

    ctx.status = 200;
    ctx.body = {
      data: {
        updated: updated.length,
        errors: errors.length,
        updatedIds: updated,
        ...(errors.length > 0 && { errorIds: errors }),
      },
    };
  },

  /**
   * DELETE /comments/admin/comments/bulk-delete
   * Supprime plusieurs commentaires en une seule requête.
   * Réservé au tier Pro (contrôlé par le middleware license-gate sur la route).
   */
  async bulkDelete(ctx: StrapiContext): Promise<void> {
    const BulkSchema = z.object({
      ids: z.array(z.string().min(1)).min(1).max(100),
    });

    const parseResult = BulkSchema.safeParse(ctx.request.body);

    if (!parseResult.success) {
      ctx.status = 400;
      ctx.body = {
        error: {
          status: 400,
          message: parseResult.error.errors[0]?.message ?? 'Liste d\'identifiants invalide.',
          details: parseResult.error.errors,
        },
      };
      return;
    }

    const { ids } = parseResult.data;
    const deleted: string[] = [];
    const errors: string[] = [];

    for (const id of ids) {
      try {
        await strapi.plugin('comments').service('comment').delete(id);
        deleted.push(id);
      } catch {
        errors.push(id);
      }
    }

    strapi.eventHub.emit('comment.bulk-deleted', { ids: deleted });

    ctx.status = 200;
    ctx.body = {
      data: {
        deleted: deleted.length,
        errors: errors.length,
        deletedIds: deleted,
        ...(errors.length > 0 && { errorIds: errors }),
      },
    };
  },

  /**
   * DELETE /comments/admin/comments/:id
   * Supprime définitivement un commentaire et ses réponses (cascade).
   */
  async delete(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    const existing = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
    });

    if (!existing) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    try {
      await strapi.plugin('comments').service('comment').delete(id);

      ctx.status = 200;
      ctx.body = { data: { documentId: id, deleted: true } };
    } catch (err) {
      if (err instanceof CommentServiceError) {
        ctx.status = err.statusCode;
        ctx.body = { error: { status: err.statusCode, message: err.message } };
        return;
      }
      throw err;
    }
  },
});
