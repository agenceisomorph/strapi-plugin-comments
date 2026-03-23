'use strict';

/**
 * Fichier passerelle admin — conforme au pattern BUG-009 du journal d'installation.
 *
 * Dereference le `export default` TypeScript compilé en CommonJS.
 * Le build admin est géré par le SDK Strapi (pas par notre tsconfig).
 * Ce fichier est utilisé pour le chargement en mode non-buildé (dev).
 */
const mod = require('./dist/admin/index');
module.exports = mod.default || mod;
