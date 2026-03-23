/**
 * Export des policies du plugin comments.
 * Strapi V5 enregistre ces policies sous le namespace plugin::comments.*
 *
 * Référencement dans les routes :
 *   'plugin::comments.is-admin'      → routes admin uniquement
 *   'plugin::comments.comment-owner' → route DELETE /comments/:id
 */

import isAdmin from './is-admin';
import commentOwner from './comment-owner';

export default {
  'is-admin': isAdmin,
  'comment-owner': commentOwner,
};
