/**
 * Policy is-admin — réservée aux rôles admin Strapi.
 *
 * Vérifie que le contexte d'authentification correspond à un utilisateur
 * du tableau de bord Strapi admin (rôle strapi-admin).
 *
 * Utilisée sur toutes les routes de modération (/comments/admin/*).
 * Retourne 403 si l'utilisateur n'est pas authentifié ou n'a pas le rôle admin.
 *
 * OWASP A01:2021 — Broken Access Control : protection des routes d'administration.
 */

import { type Core } from '@strapi/strapi';
import { type StrapiContext, type StrapiAdminUser } from '../types/strapi';

/**
 * Policy Strapi V5 — format fonction.
 *
 * @param ctx - Contexte Koa enrichi par Strapi
 * @param _config - Configuration de la policy (non utilisée)
 * @param _options - Options Strapi (non utilisées)
 * @returns true si l'accès est autorisé, false sinon (Strapi retourne 403 automatiquement)
 */
export default (
  ctx: StrapiContext,
  _config: Record<string, unknown>,
  _options: { strapi: Core.Strapi }
): boolean => {
  const { auth } = ctx.state;

  // Vérification de la présence de l'authentification
  if (!auth || !auth.credentials) {
    return false;
  }

  // Vérification que la stratégie d'auth est bien admin (pas users-permissions JWT)
  if (auth.strategy?.name !== 'admin') {
    return false;
  }

  const adminUser = auth.credentials as StrapiAdminUser;

  // Vérification de la présence de rôles admin
  if (!adminUser.roles || adminUser.roles.length === 0) {
    return false;
  }

  // Au moins un rôle admin valide doit être présent
  // Les rôles Strapi admin standard : 'strapi-super-admin', 'strapi-editor', 'strapi-author'
  const validAdminRoles = ['strapi-super-admin', 'strapi-editor', 'strapi-author'];
  const hasAdminRole = adminUser.roles.some(
    (role) => validAdminRoles.includes(role.code) || role.code.startsWith('strapi-')
  );

  return hasAdminRole;
};
