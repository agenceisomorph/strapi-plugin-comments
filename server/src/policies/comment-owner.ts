/**
 * Policy comment-owner — seul l'auteur peut supprimer son commentaire.
 *
 * Policy optionnelle, activée uniquement si :
 *   - config.allowDelete = true dans les options du plugin
 *   - L'utilisateur est authentifié via plugin::users-permissions
 *
 * Si le plugin comments.allowDelete est false, la route DELETE est bloquée
 * au niveau du controller avant d'arriver à cette policy.
 *
 * Retourne 403 si l'utilisateur authentifié n'est pas l'auteur du commentaire.
 *
 * OWASP A01:2021 — Broken Access Control : vérification d'ownership côté serveur.
 */

import { type Core } from '@strapi/strapi';
import { type StrapiContext, type StrapiUser, type CommentEntity } from '../types/strapi';

/**
 * Policy comment-owner — format fonction Strapi V5.
 *
 * @param ctx - Contexte Koa enrichi par Strapi
 * @param _config - Configuration de la policy (non utilisée)
 * @param options - Options Strapi (contient l'instance strapi)
 * @returns true si l'accès est autorisé, false sinon
 */
export default async (
  ctx: StrapiContext,
  _config: Record<string, unknown>,
  options: { strapi: Core.Strapi }
): Promise<boolean> => {
  const { strapi } = options;
  const { user } = ctx.state;

  // Utilisateur non authentifié — accès refusé
  if (!user) {
    return false;
  }

  const { id } = ctx.params;

  if (!id || id.trim().length === 0) {
    return false;
  }

  try {
    // Récupération du commentaire avec son auteur
    const comment = await strapi.documents('plugin::comments.comment').findOne({
      documentId: id,
      populate: { author: { fields: ['documentId'] } },
    });

    if (!comment) {
      // Commentaire introuvable — la policy retourne false, le controller gérera le 404
      return false;
    }

    const commentEntity = comment as unknown as CommentEntity;
    const authenticatedUser = user as StrapiUser;

    // Vérification d'ownership : l'auteur du commentaire doit correspondre à l'utilisateur connecté
    if (!commentEntity.author) {
      // Commentaire anonyme (pas d'auteur enregistré) — suppression refusée
      return false;
    }

    return commentEntity.author.documentId === authenticatedUser.documentId;
  } catch (err) {
    console.error(
      '[strapi-plugin-comments][comment-owner] Erreur lors de la vérification d\'ownership :',
      err
    );
    // Fail-closed en cas d'erreur — accès refusé par sécurité
    return false;
  }
};
