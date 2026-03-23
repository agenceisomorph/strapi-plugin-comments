/**
 * Controller de gestion des signalements.
 *
 * Routes publiques (content-api) :
 *   POST /api/comments/reports — soumettre un signalement (anonyme autorisé)
 *
 * Routes admin protégées :
 *   GET  /comments/admin/reports         — liste paginée des signalements
 *   PUT  /comments/admin/reports/:id/review  — marquer comme examiné
 *   PUT  /comments/admin/reports/:id/dismiss — rejeter le signalement
 *
 * Pilier OWASP : validation Zod sur tous les inputs.
 * L'email du signalant n'est pas exposé dans les réponses publiques.
 */

import { z } from 'zod';
import { type Core } from '@strapi/strapi';
import { type StrapiContext } from '../types/strapi';
import { type PluginConfig } from '../config';
import {
  create,
  findAll,
  markReviewed,
  dismiss,
  ReportServiceError,
} from '../services/report';

// ─── Schémas de validation Zod ────────────────────────────────────────────────

/**
 * Schéma de validation du body pour POST /reports (public).
 */
const CreateReportSchema = z.object({
  commentDocumentId: z
    .string()
    .min(1, 'Le documentId du commentaire est requis.')
    .max(255),
  reason: z.enum(['offensive', 'spam', 'harassment', 'misinformation', 'other'], {
    errorMap: () => ({
      message: 'La raison doit être : offensive, spam, harassment, misinformation ou other.',
    }),
  }),
  description: z.string().max(500, 'La description ne peut pas dépasser 500 caractères.').optional(),
  reporterEmail: z
    .string()
    .email('Adresse email invalide.')
    .max(255),
});

/**
 * Schéma de validation des query params pour GET /admin/reports.
 */
const FindAllQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(100).optional().default(25),
  status: z.enum(['pending', 'reviewed', 'dismissed']).optional(),
  commentDocumentId: z.string().optional(),
});

// ─── Controller report ────────────────────────────────────────────────────────

/**
 * Factory du controller report.
 */
export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * POST /api/comments/reports
   * Soumet un signalement depuis le frontend (anonyme autorisé).
   * L'email du signalant est stocké mais jamais retourné dans la réponse.
   */
  async create(ctx: StrapiContext): Promise<void> {
    // Le frontend peut envoyer { data: { ... } } ou { ... } directement
    const body = ctx.request.body as Record<string, unknown>;
    const input = body.data ?? body;
    const parseResult = CreateReportSchema.safeParse(input);

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

    const config = strapi.config.get('plugin::comments') as unknown as PluginConfig;

    // Filtre anti-injures sur la description du signalement
    if (parseResult.data.description && config.profanityFilter.enabled) {
      const profanityService = strapi.plugin('comments').service('profanity');
      const hasProfanity = profanityService.check(parseResult.data.description);
      if (hasProfanity) {
        ctx.status = 400;
        ctx.body = {
          error: {
            status: 400,
            message: 'Le texte du signalement contient des termes inappropriés.',
          },
        };
        return;
      }
    }

    try {
      const report = await create(strapi, config, parseResult.data);

      // Réponse publique : on ne retourne PAS l'email du signalant (OWASP)
      ctx.status = 201;
      ctx.body = {
        data: {
          documentId: report.documentId,
          reason: report.reason,
          status: report.status,
          createdAt: report.createdAt,
        },
      };
    } catch (err) {
      if (err instanceof ReportServiceError) {
        ctx.status = err.statusCode;
        ctx.body = { error: { status: err.statusCode, message: err.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * GET /comments/admin/reports
   * Liste paginée des signalements avec filtres (admin uniquement).
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

    const { page, pageSize, status, commentDocumentId } = parseResult.data;

    const { data, total } = await findAll(
      strapi,
      { status, commentDocumentId },
      { page, pageSize }
    );

    ctx.status = 200;
    ctx.body = {
      data,
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
   * PUT /comments/admin/reports/:id/review
   * Marque un signalement comme examiné.
   */
  async markReviewed(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    try {
      const updated = await markReviewed(strapi, id);
      ctx.status = 200;
      ctx.body = { data: updated };
    } catch (err) {
      if (err instanceof ReportServiceError) {
        ctx.status = err.statusCode;
        ctx.body = { error: { status: err.statusCode, message: err.message } };
        return;
      }
      throw err;
    }
  },

  /**
   * PUT /comments/admin/reports/:id/dismiss
   * Rejette un signalement (non fondé).
   */
  async dismiss(ctx: StrapiContext): Promise<void> {
    const { id } = ctx.params;

    if (!id || id.trim().length === 0) {
      ctx.status = 400;
      ctx.body = { error: { status: 400, message: "L'identifiant est requis." } };
      return;
    }

    try {
      const updated = await dismiss(strapi, id);
      ctx.status = 200;
      ctx.body = { data: updated };
    } catch (err) {
      if (err instanceof ReportServiceError) {
        ctx.status = err.statusCode;
        ctx.body = { error: { status: err.statusCode, message: err.message } };
        return;
      }
      throw err;
    }
  },
});
