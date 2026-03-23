'use strict';

/**
 * Point d'entrée racine du plugin pour Strapi V5.
 * Ce fichier est référencé dans l'export "strapi-server" de package.json.
 * Il redirige vers le code compilé dans dist/.
 *
 * Strapi résout automatiquement ce fichier lors du chargement du plugin.
 */
const mod = require('./dist/server/src/index');
module.exports = mod.default || mod;
