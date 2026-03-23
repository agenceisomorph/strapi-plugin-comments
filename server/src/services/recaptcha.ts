/**
 * Service de vérification Google reCAPTCHA V3.
 *
 * OWASP : La clé secrète ne transite jamais côté client.
 * L'appel HTTP vers l'API Google est réalisé serveur-side uniquement.
 *
 * Comportement :
 *   - Timeout de 3 secondes (AbortController)
 *   - failClosed = true : une erreur d'appel Google bloque la soumission
 *   - failClosed = false : une erreur d'appel Google autorise la soumission (fail-open)
 *   - Si RECAPTCHA_SECRET_KEY non définie, retourne true (mode désactivé)
 */

/** Réponse de l'API Google reCAPTCHA siteverify */
interface RecaptchaVerifyResponse {
  success: boolean;
  score?: number;
  action?: string;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/** Résultat de la vérification */
export interface RecaptchaVerifyResult {
  success: boolean;
  score?: number;
  errorCodes?: string[];
}

const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const TIMEOUT_MS = 3_000;

/**
 * Vérifie un token reCAPTCHA V3 auprès de l'API Google.
 *
 * @param token - Token reCAPTCHA reçu du frontend
 * @param secretKey - Clé secrète Google (issue de process.env.RECAPTCHA_SECRET_KEY)
 * @param scoreThreshold - Score minimum accepté (0.0 à 1.0)
 * @param remoteIp - IP du client (optionnel, recommandé par Google)
 * @param failClosed - Si true, une erreur réseau bloque la soumission
 * @returns Résultat de la vérification
 */
export async function verify(
  token: string,
  secretKey: string,
  scoreThreshold: number,
  remoteIp?: string,
  failClosed = true
): Promise<RecaptchaVerifyResult> {
  // Si le token est vide, rejet immédiat
  if (!token || token.trim().length === 0) {
    return { success: false, errorCodes: ['missing-input-response'] };
  }

  // Construction du corps de la requête
  const params = new URLSearchParams({
    secret: secretKey,
    response: token,
  });

  if (remoteIp && remoteIp.trim().length > 0) {
    params.append('remoteip', remoteIp);
  }

  // Timeout via AbortController (pilier performance / sécu : pas de requête infinie)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Réponse HTTP inattendue de Google reCAPTCHA : ${response.status}`);
    }

    const data = (await response.json()) as RecaptchaVerifyResponse;

    // Vérification du score si disponible (reCAPTCHA V3)
    if (data.success && data.score !== undefined) {
      if (data.score < scoreThreshold) {
        return {
          success: false,
          score: data.score,
          errorCodes: ['score-below-threshold'],
        };
      }
    }

    return {
      success: data.success,
      score: data.score,
      errorCodes: data['error-codes'],
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    const errorMessage = isTimeout
      ? 'Timeout dépassé lors de la vérification reCAPTCHA'
      : `Erreur lors de la vérification reCAPTCHA : ${String(err)}`;

    console.error(`[strapi-plugin-comments] ${errorMessage}`);

    // fail-closed : en cas d'erreur réseau, on bloque si failClosed=true
    return {
      success: !failClosed,
      errorCodes: [isTimeout ? 'timeout' : 'network-error'],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Vérifie si reCAPTCHA est correctement configuré dans l'environnement.
 * Retourne false si RECAPTCHA_SECRET_KEY n'est pas définie.
 */
export function isConfigured(): boolean {
  const secretKey = process.env['RECAPTCHA_SECRET_KEY'];
  return typeof secretKey === 'string' && secretKey.length > 0;
}

// ─── Test unitaire minimal ────────────────────────────────────────────────────
// isConfigured() → false si RECAPTCHA_SECRET_KEY non définie
// verify('', 'secret', 0.5) → { success: false, errorCodes: ['missing-input-response'] }
