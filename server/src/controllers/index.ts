/**
 * Export des controllers du plugin comments.
 * Strapi V5 enregistre ces controllers sous le namespace plugin::comments.*
 *
 * Accès depuis les routes :
 *   handler: 'comment.find'          → plugin::comments.comment.find
 *   handler: 'moderation.findAll'    → plugin::comments.moderation.findAll
 *   handler: 'moderation.stats'      → plugin::comments.moderation.stats
 *   handler: 'moderation.adminReply' → plugin::comments.moderation.adminReply
 *   handler: 'moderation.getConfig'  → plugin::comments.moderation.getConfig
 *   handler: 'report.create'         → plugin::comments.report.create
 *   handler: 'report.findAll'        → plugin::comments.report.findAll
 *   handler: 'report.markReviewed'   → plugin::comments.report.markReviewed
 *   handler: 'report.dismiss'        → plugin::comments.report.dismiss
 */

import comment from './comment';
import moderation from './moderation';
import report from './report';

export default { comment, moderation, report };
