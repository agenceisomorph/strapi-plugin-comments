/**
 * Point d'entrée server du plugin strapi-plugin-comments.
 *
 * Ce fichier assemble tous les composants du plugin et les exporte
 * sous la forme attendue par l'API plugin Strapi V5.
 *
 * Structure Strapi V5 : la fonction exportée reçoit { strapi } et retourne
 * un objet contenant register, bootstrap, destroy, config, contentTypes,
 * routes, controllers, services, policies, middlewares.
 *
 * Documentation : https://docs.strapi.io/dev-docs/plugins/development/create-a-plugin
 */

import { type Core } from '@strapi/strapi';

import register from './register';
import bootstrap from './bootstrap';
import destroy from './destroy';
import config from './config';
import contentTypes from './content-types';
import routes from './routes';
import controllers from './controllers';
import services from './services';
import policies from './policies';
import middlewares from './middlewares';

/**
 * Export du plugin Strapi V5.
 *
 * Chaque propriété correspond à un composant du plugin :
 *   - register    : hooks pre-bootstrap (extension modèle User)
 *   - bootstrap   : initialisation post-chargement (catégorie Abonné, dictionnaires)
 *   - destroy     : nettoyage à l'arrêt (libération store rate-limit)
 *   - config      : schéma de configuration + valeurs par défaut
 *   - contentTypes: comment + user-category (schémas JSON)
 *   - routes      : content-api (publiques) + admin (protégées)
 *   - controllers : comment + moderation
 *   - services    : comment + avatar + profanity + recaptcha + subscriber
 *   - policies    : is-admin + comment-owner
 *   - middlewares : rate-limit + recaptcha-verify + sanitize-input
 */
export default () => ({
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  routes,
  controllers,
  services,
  policies,
  middlewares,
});
