/**
 * Export des middlewares du plugin comments.
 * Strapi V5 enregistre ces middlewares sous le namespace plugin::comments.*
 *
 * Référencement dans les routes :
 *   'plugin::comments.rate-limit'
 *   'plugin::comments.recaptcha-verify'
 *   'plugin::comments.sanitize-input'
 *   'plugin::comments.license-gate'
 */

import rateLimitMiddleware from './rate-limit';
import recaptchaVerifyMiddleware from './recaptcha-verify';
import sanitizeInputMiddleware from './sanitize-input';
import licenseGateMiddleware from './license-gate';

export default {
  'rate-limit': rateLimitMiddleware,
  'recaptcha-verify': recaptchaVerifyMiddleware,
  'sanitize-input': sanitizeInputMiddleware,
  'license-gate': licenseGateMiddleware,
};
