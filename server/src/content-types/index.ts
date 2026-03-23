/**
 * Export des content-types du plugin comments.
 * Chaque clé correspond au singularName du content-type.
 * Strapi V5 charge ces schémas automatiquement via le point d'entrée du plugin.
 */

import commentSchema from './comment/schema.json';
import userCategorySchema from './user-category/schema.json';
import reportSchema from './report/schema.json';

/**
 * Type représentant un schéma de content-type Strapi V5.
 * Utilisé pour typer les imports JSON sans dépendre des types internes Strapi.
 */
export interface ContentTypeSchema {
  kind: string;
  collectionName: string;
  info: {
    singularName: string;
    pluralName: string;
    displayName: string;
    description?: string;
  };
  options?: Record<string, unknown>;
  pluginOptions?: Record<string, unknown>;
  attributes: Record<string, unknown>;
}

const contentTypes: Record<string, { schema: ContentTypeSchema }> = {
  comment: { schema: commentSchema as ContentTypeSchema },
  'user-category': { schema: userCategorySchema as ContentTypeSchema },
  report: { schema: reportSchema as ContentTypeSchema },
};

export default contentTypes;
