/**
 * Configuration du plugin strapi-plugin-comments.
 *
 * Toutes les valeurs sont surchargées dans config/plugins.ts de l'application hôte :
 *
 * ```ts
 * // config/plugins.ts
 * export default {
 *   comments: {
 *     enabled: true,
 *     config: {
 *       targetCollection: 'api::article.article',
 *       requireApproval: true,
 *     },
 *   },
 * };
 * ```
 *
 * Variables d'environnement requises dans le .env de l'application hôte :
 *   - RECAPTCHA_SECRET_KEY : clé secrète Google reCAPTCHA V3 (si recaptcha.enabled = true)
 *
 * OWASP : aucune variable sensible n'est exposée dans les réponses API.
 */

/**
 * Interface du store de rate limiting injectable.
 * Implémenter cette interface pour remplacer le store mémoire par défaut (ex: Redis).
 * Recommandé pour les déploiements multi-instances / load balancer.
 */
export interface RateLimitStore {
  /** Incrémente le compteur pour une clé (IP), retourne le nouveau total. */
  increment(key: string, windowMs: number): Promise<number>;
  /** Remet à zéro le compteur pour une clé. */
  reset(key: string): Promise<void>;
}

/**
 * Interface du filtre anti-injures injectable.
 * Remplace leo-profanity par une implémentation personnalisée si nécessaire.
 */
export interface ProfanityFilterService {
  check(text: string): boolean;
}

/**
 * Configuration complète du plugin avec toutes les valeurs par défaut.
 */
export interface PluginConfig {
  /** UID Strapi de la collection cible par défaut. */
  targetCollection: string;
  /** Si true, tout nouveau commentaire a approved=false jusqu'à action admin. */
  requireApproval: boolean;
  /** Permet aux auteurs de supprimer leurs propres commentaires. */
  allowDelete: boolean;

  profanityFilter: {
    /** Active le filtre anti-injures. */
    enabled: boolean;
    /** Langues du dictionnaire (fr et en supportés par leo-profanity). */
    languages: string[];
    /** Si true, une erreur du filtre ne bloque pas la soumission (fail-open). */
    failOpen: boolean;
    /**
     * Action en cas de détection d'injure :
     * - 'reject' : retourne 400 Bad Request
     * - 'flag'   : approuve=false pour modération manuelle
     */
    action: 'reject' | 'flag';
    /** Implémentation personnalisée injectable (optionnel). */
    customFilter?: ProfanityFilterService;
  };

  recaptcha: {
    /** Active la vérification reCAPTCHA V3. */
    enabled: boolean;
    /** Score minimum Google (0.0 à 1.0) — en dessous = rejet. */
    scoreThreshold: number;
    /** Si true, une erreur d'appel Google bloque la soumission (fail-closed). */
    failClosed: boolean;
  };

  rateLimit: {
    /** Active le rate limiting par IP. */
    enabled: boolean;
    /** Durée de la fenêtre glissante en millisecondes. Défaut : 15 minutes. */
    windowMs: number;
    /** Nombre maximum de soumissions par fenêtre par IP. */
    max: number;
    /** Store injectable pour déploiements multi-instances (ex: Redis). */
    store?: RateLimitStore;
    /** IPs autorisées en plus de localhost (exclues du rate limiting). */
    whitelist?: string[];
  };

  avatar: {
    /** Active la génération de couleur d'avatar. */
    enabled: boolean;
    /** Palette pastel ISOMORPH (12 couleurs conformes WCAG AA). */
    palette: string[];
  };

  subscriber: {
    /** Active l'inscription automatique du commentateur comme Abonné. */
    enabled: boolean;
    /** Nom de la catégorie Abonné créée au bootstrap. */
    categoryName: string;
    /** Slug de la catégorie Abonné. */
    categorySlug: string;
  };

  moderation: {
    /**
     * Si true, les commentaires nécessitent une approbation admin avant d'être visibles.
     * Identique à requireApproval — ce champ étend la config pour l'interface admin.
     */
    enabled: boolean;
  };

  reportThreshold: {
    /** Active le mécanisme d'auto-masquage par accumulation de signalements. */
    enabled: boolean;
    /**
     * Nombre de signalements « pending » sur un même commentaire
     * déclenchant le blocage automatique.
     */
    count: number;
  };

  /**
   * Clé de licence Pro. Vide/absente = tier Community (limite 500 commentaires).
   * À renseigner via `config.plugins.ts` depuis l'environnement :
   * `comments: { config: { licenseKey: env('COMMENTS_LICENSE_KEY') } }`.
   * La clé est VÉRIFIÉE EN LIGNE (cf. service license) — un simple format valide
   * ne suffit pas à débloquer le Pro.
   */
  licenseKey?: string;

  /** Paramètres de la vérification de licence en ligne. */
  license: {
    /** URL du service de vérification ISOMORPH. */
    verifyUrl: string;
    /** Intervalle de revérification (heures). */
    verifyIntervalHours: number;
    /** Fenêtre de grâce (jours) : tolère une panne du serveur sans rétrograder un client payant. */
    graceDays: number;
    /** Timeout réseau (ms) de l'appel de vérification. */
    timeoutMs: number;
  };
}

/**
 * Palette pastel ISOMORPH — 12 couleurs.
 * Conformes WCAG AA : contraste ≥ 4.5:1 sur fond blanc pour une lettre sombre (#333).
 * Générées de façon déterministe depuis le prénom du commentateur.
 */
const PALETTE_PASTEL_ISOMORPH: string[] = [
  '#B5EAD7', // vert menthe
  '#C7CEEA', // lavande
  '#FFDAC1', // pêche
  '#FFB7B2', // rose saumon
  '#FF9AA2', // rose corail
  '#E2F0CB', // vert pomme
  '#B5D5F5', // bleu ciel
  '#FFF1BA', // jaune crème
  '#D4B8E0', // mauve
  '#B8E0D4', // vert sauge
  '#FAD4C0', // abricot
  '#C8E6C9', // vert tilleul
];

/**
 * Schéma de configuration Strapi V5.
 * La fonction `default` retourne les valeurs par défaut.
 * La validation est assurée par Strapi via le schéma Yup si fourni,
 * mais ici on utilise des valeurs typées TypeScript strict.
 */
const config = {
  default: (): PluginConfig => ({
    targetCollection: 'api::article.article',
    requireApproval: false,
    allowDelete: false,

    profanityFilter: {
      enabled: true,
      languages: ['fr', 'en'],
      failOpen: true,
      action: 'reject',
    },

    recaptcha: {
      enabled: true,
      scoreThreshold: 0.5,
      failClosed: true,
    },

    rateLimit: {
      enabled: true,
      windowMs: 900_000, // 15 minutes
      max: 5,
    },

    avatar: {
      enabled: true,
      palette: PALETTE_PASTEL_ISOMORPH,
    },

    subscriber: {
      enabled: true,
      categoryName: 'Abonné',
      categorySlug: 'abonne',
    },

    moderation: {
      enabled: false,
    },

    reportThreshold: {
      enabled: true,
      count: 3,
    },

    license: {
      verifyUrl: 'https://isomorph.dev/api/licenses/verify',
      verifyIntervalHours: 12,
      graceDays: 7,
      timeoutMs: 5000,
    },
  }),

  /**
   * Validateur optionnel — vérifie que la config fournie par l'hôte est cohérente.
   * Strapi V5 appelle cette fonction avant le bootstrap du plugin.
   */
  validator(config: PluginConfig): void {
    // Vérification de la clé reCAPTCHA si le module est activé
    if (config.recaptcha.enabled && !process.env['RECAPTCHA_SECRET_KEY']) {
      // Avertissement non bloquant — le middleware recaptcha-verify gérera le cas
      console.warn(
        '[strapi-plugin-comments] AVERTISSEMENT : recaptcha.enabled=true mais RECAPTCHA_SECRET_KEY non définie. ' +
          'La vérification reCAPTCHA sera ignorée.'
      );
    }

    // Vérification du seuil reCAPTCHA
    if (config.recaptcha.scoreThreshold < 0 || config.recaptcha.scoreThreshold > 1) {
      throw new Error(
        '[strapi-plugin-comments] recaptcha.scoreThreshold doit être compris entre 0.0 et 1.0'
      );
    }

    // Vérification de la palette avatar
    if (config.avatar.palette.length === 0) {
      throw new Error('[strapi-plugin-comments] avatar.palette ne peut pas être vide');
    }
  },
};

export default config;
export { PALETTE_PASTEL_ISOMORPH };
