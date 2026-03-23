/**
 * Export des routes du plugin comments.
 * Strapi V5 charge séparément les routes content-api (publiques) et admin (protégées).
 */

import contentApiRoutes from './content-api/comment';
import adminRoutes from './admin/moderation';

export default {
  'content-api': contentApiRoutes,
  admin: adminRoutes,
};
