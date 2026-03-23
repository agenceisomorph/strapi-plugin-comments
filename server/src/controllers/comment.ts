/**
 * Controller commentaires — routes publiques (content-api).
 *
 * Principe ISOMORPH : les controllers ne contiennent AUCUNE logique métier.
 *   → Validation Zod des inputs
 *   → Appel du service
 *   → Formatage de la réponse HTTP
 *
 * Validation Zod : pilier OWASP — tout input non validé est rejeté avec 400.
 * Pas d'accès direct au Document Service depuis le controller.
 */

import { z } from 'zod';
import { type Core } from '@strapi/strapi';
import { type StrapiContext } from '../types/strapi';
// CommentServiceError identifié par svcErr.name dans les catch blocks (pas d'import nécessaire)

// ─── Schémas de validation Zod ────────────────────────────────────────────────

/**
 * Schéma de validation des query params pour GET /comments.
 * relatedDocumentId est obligatoire — sans lui, la requête est rejetée.
 */
const FindQuerySchema = z.object({
  relatedDocumentId: z
    .string({ required_error: 'Le paramètre relatedDocumentId est obligatoire.' })
    .min(1, 'relatedDocumentId ne peut pas être vide.'),
  relatedCollection: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(20),
});

/**
 * Schéma de validation du body pour POST /comments.
 * Tous les champs correspondent aux attributs du content-type comment.
 */
const CreateCommentSchema = z.object({
  firstname: z
    .string({ required_error: 'Le prénom est obligatoire.' })
    .min(1, 'Le prénom ne peut pas être vide.')
    .max(100, 'Le prénom ne peut pas dépasser 100 caractères.'),
  email: z
    .string({ required_error: "L'email est obligatoire." })
    .email("L'adresse email n'est pas valide."),
  content: z
    .string({ required_error: 'Le contenu est obligatoire.' })
    .min(1, 'Le contenu ne peut pas être vide.')
    .max(2000, 'Le contenu ne peut pas dépasser 2000 caractères.'),
  relatedDocumentId: z
    .string({ required_error: 'relatedDocumentId est obligatoire.' })
    .min(1),
  relatedCollection: z.string().optional(),
  // recaptchaToken est consommé par le middleware recaptcha-verify, pas par le controller
  recaptchaToken: z.string().optional(),
});

/** Type inféré du schéma de création */
type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

/**
 * Schéma de validation du body pour POST /comments/:id/reply.
 * Identique à la création mais sans relatedDocumentId (hérité du parent).
 */
const ReplyCommentSchema = z.object({
  firstname: z
    .string({ required_error: 'Le prénom est obligatoire.' })
    .min(1)
    .max(100),
  email: z
    .string({ required_error: "L'email est obligatoire." })
    .email("L'adresse email n'est pas valide."),
  content: z
    .string({ required_error: 'Le contenu est obligatoire.' })
    .min(1)
    .max(2000),
  recaptchaToken: z.string().optional(),
});

// ─── Controller ───────────────────────────────────────────────────────────────

/**
 * Factory du controller — pattern Strapi V5 recommandé.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * GET /comments
   * Liste les commentaires approuvés pour un document.
   */
  async find(ctx: StrapiContext): Promise<void> {
    const parseResult = FindQuerySchema.safeParse(ctx.query);

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

    const { relatedDocumentId, relatedCollection, page, pageSize } = parseResult.data;
    const pluginConfig = strapi.config.get('plugin::comments') as unknown as { targetCollection: string };

    try {
      const commentService = strapi.plugin('comments').service('comment');
      const comments = await commentService.findByDocument(
        relatedDocumentId,
        relatedCollection ?? pluginConfig.targetCollection,
        { pagination: { page, pageSize } }
      );

      ctx.status = 200;
      ctx.body = { data: comments };
    } catch (err: unknown) {
      console.error('[strapi-plugin-comments][find] Erreur:', err);
      throw err;
    }
  },

  /**
   * GET /comments/:id
   * Retourne le détail d'un commentaire approuvé et non bloqué.
   */
  async findOne(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant du commentaire est requis." } };
      return;
    }

    const comment = await strapi
      .plugin('comments')
      .service('comment')
      .findOne(id);

    if (!comment) {
      ctx.status = 404;
      ctx.body = { error: { status: 404, message: 'Commentaire introuvable.' } };
      return;
    }

    ctx.status = 200;
    ctx.body = { data: comment };
  },

  /**
   * POST /comments
   * Soumet un nouveau commentaire.
   * Middlewares : sanitize-input → recaptcha-verify → rate-limit
   */
  async create(ctx: StrapiContext): Promise<void> {
    // Strapi V5 content-api enveloppe les données dans { data: {...} }
    const body = (ctx.request.body as Record<string, unknown>)?.data ?? ctx.request.body;
    const parseResult = CreateCommentSchema.safeParse(body);

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

    const validData: CreateCommentInput = parseResult.data;

    try {
      const comment = await strapi
        .plugin('comments')
        .service('comment')
        .create({
          firstname: validData.firstname,
          email: validData.email,
          content: validData.content,
          relatedDocumentId: validData.relatedDocumentId,
          relatedCollection: validData.relatedCollection,
        });

      ctx.status = 201;
      ctx.body = { data: comment };
    } catch (err) {
      const svcErr = err as { name?: string; statusCode?: number; message?: string };
      if (svcErr.name === 'CommentServiceError' && svcErr.statusCode) {
        ctx.status = svcErr.statusCode;
        ctx.body = { error: { status: svcErr.statusCode, message: svcErr.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * POST /comments/:id/reply
   * Répond à un commentaire existant (N-1 uniquement).
   * Middlewares : sanitize-input → recaptcha-verify → rate-limit
   */
  async reply(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant du commentaire parent est requis." } };
      return;
    }

    const body = (ctx.request.body as Record<string, unknown>)?.data ?? ctx.request.body;
    const parseResult = ReplyCommentSchema.safeParse(body);

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

    const validData = parseResult.data;

    try {
      const reply = await strapi
        .plugin('comments')
        .service('comment')
        .createReply(id, {
          firstname: validData.firstname,
          email: validData.email,
          content: validData.content,
          relatedDocumentId: '', // hérité du parent dans le service
        });

      ctx.status = 201;
      ctx.body = { data: reply };
    } catch (err) {
      const svcErr = err as { name?: string; statusCode?: number; message?: string };
      if (svcErr.name === 'CommentServiceError' && svcErr.statusCode) {
        ctx.status = svcErr.statusCode;
        ctx.body = { error: { status: svcErr.statusCode, message: svcErr.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * POST /comments/:id/like
   * Incrémente le compteur de likes d'un commentaire.
   * Middleware : rate-limit (protection contre le spam de likes par IP)
   * Auth : désactivée — like public sans authentification.
   */
  async like(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant du commentaire est requis." } };
      return;
    }

    try {
      const newLikes = await strapi
        .plugin('comments')
        .service('comment')
        .like(id);

      ctx.status = 200;
      ctx.body = { data: { likes: newLikes } };
    } catch (err) {
      const svcErr = err as { name?: string; statusCode?: number; message?: string };
      if (svcErr.name === 'CommentServiceError' && svcErr.statusCode) {
        ctx.status = svcErr.statusCode;
        ctx.body = { error: { status: svcErr.statusCode, message: svcErr.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * POST /comments/:id/unlike
   * Décrémente le compteur de likes d'un commentaire (minimum 0).
   * Middleware : rate-limit (même protection que like)
   * Auth : désactivée — unlike public sans authentification.
   */
  async unlike(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant du commentaire est requis." } };
      return;
    }

    try {
      const newLikes = await strapi
        .plugin('comments')
        .service('comment')
        .unlike(id);

      ctx.status = 200;
      ctx.body = { data: { likes: newLikes } };
    } catch (err) {
      const svcErr = err as { name?: string; statusCode?: number; message?: string };
      if (svcErr.name === 'CommentServiceError' && svcErr.statusCode) {
        ctx.status = svcErr.statusCode;
        ctx.body = { error: { status: svcErr.statusCode, message: svcErr.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * DELETE /comments/:id
   * Supprime son propre commentaire (requiert allowDelete=true + auth).
   * Policy : comment-owner
   */
  async delete(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;
    const pluginConfig = strapi.config.get('plugin::comments') as unknown as { allowDelete?: boolean };

    // Vérification de la config — la route est désactivée si allowDelete=false
    if (!pluginConfig.allowDelete) {
      ctx.status = 403;
      ctx.body = {
        error: {
          status: 403,
          message: 'La suppression de commentaires est désactivée sur ce site.',
        },
      };
      return;
    }

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant du commentaire est requis." } };
      return;
    }

    try {
      await strapi.plugin('comments').service('comment').delete(id);

      ctx.status = 200;
      ctx.body = { data: { documentId: id, deleted: true } };
    } catch (err) {
      const svcErr = err as { name?: string; statusCode?: number; message?: string };
      if (svcErr.name === 'CommentServiceError' && svcErr.statusCode) {
        ctx.status = svcErr.statusCode;
        ctx.body = { error: { status: svcErr.statusCode, message: svcErr.message } };
        return;
      }
      throw err;
    }
  },
});
