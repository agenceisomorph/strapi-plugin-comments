/**
 * Routes publiques (content-api) du plugin comments.
 *
 * Middlewares appliqués sur les routes d'écriture (POST) :
 *   1. sanitize-input  — nettoyage XSS avant traitement
 *   2. recaptcha-verify — vérification token Google V3
 *   3. rate-limit      — fenêtre glissante par IP
 *
 * La route GET /comments requiert le paramètre relatedDocumentId (validé par Zod dans le controller).
 * La route DELETE /comments/:id est protégée par la policy comment-owner (optionnelle).
 */

const contentApiRoutes = {
  type: 'content-api' as const,
  prefix: '/comments',
  routes: [
    {
      method: 'GET',
      path: '/',
      handler: 'comment.find',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
        description: 'Liste les commentaires approuvés et non bloqués pour un document',
      },
    },
    {
      method: 'GET',
      path: '/:id',
      handler: 'comment.findOne',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
        description: 'Retourne le détail d\'un commentaire (approved et non bloqué)',
      },
    },
    {
      method: 'POST',
      path: '/',
      handler: 'comment.create',
      config: {
        auth: false,
        policies: [],
        middlewares: [
          'plugin::comments.sanitize-input',
          'plugin::comments.recaptcha-verify',
          'plugin::comments.rate-limit',
        ],
        description: 'Soumet un nouveau commentaire sur un document',
      },
    },
    {
      method: 'POST',
      path: '/:id/reply',
      handler: 'comment.reply',
      config: {
        auth: false,
        policies: [],
        middlewares: [
          'plugin::comments.sanitize-input',
          'plugin::comments.recaptcha-verify',
          'plugin::comments.rate-limit',
        ],
        description: 'Répond à un commentaire existant (niveau N-1 uniquement)',
      },
    },
    {
      method: 'POST',
      path: '/:id/like',
      handler: 'comment.like',
      config: {
        auth: false,
        policies: [],
        middlewares: ['plugin::comments.rate-limit'],
        description: 'Incrémente le compteur de likes d\'un commentaire',
      },
    },
    {
      method: 'POST',
      path: '/:id/unlike',
      handler: 'comment.unlike',
      config: {
        auth: false,
        policies: [],
        middlewares: ['plugin::comments.rate-limit'],
        description: 'Décrémente le compteur de likes d\'un commentaire (minimum 0)',
      },
    },
    {
      method: 'DELETE',
      path: '/:id',
      handler: 'comment.delete',
      config: {
        auth: { scope: [] },
        policies: ['plugin::comments.comment-owner'],
        middlewares: [],
        description: 'Supprime son propre commentaire (requiert allowDelete=true dans config)',
      },
    },
    {
      method: 'POST',
      path: '/reports',
      handler: 'report.create',
      config: {
        auth: false,
        policies: [],
        middlewares: [
          'plugin::comments.rate-limit',
          'plugin::comments.sanitize-input',
        ],
        description: 'Soumet un signalement anonyme sur un commentaire',
      },
    },
  ],
};

export default contentApiRoutes;
