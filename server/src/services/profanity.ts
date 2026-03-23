/**
 * Service anti-injures — wrapper autour de leo-profanity.
 *
 * ADR-04 : fail-open par défaut (failOpen: true) — une erreur du filtre
 * ne bloque pas la soumission. Option 'flag' pour modération manuelle
 * plutôt que rejet direct.
 *
 * Dépendance : leo-profanity (MIT, < 10 Ko) — conforme RGESN.
 *
 * Interface injectable : ProfanityFilterService (définie dans config/index.ts)
 * permet de remplacer leo-profanity par une implémentation personnalisée.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// leo-profanity ne fournit pas d'export ESM — import commonjs nécessaire
const leoProfanity = require('leo-profanity') as {
  loadDictionary: (lang: string) => void;
  add: (words: string[]) => void;
  check: (text: string) => boolean;
  clean: (text: string, replacementChar?: string) => string;
  list: () => string[];
};
/* eslint-enable @typescript-eslint/no-require-imports */

/** Langues supportées par leo-profanity */
type SupportedLanguage = 'fr' | 'en';

/**
 * État d'initialisation du service (singleton par instance Strapi).
 */
let isInitialized = false;

/**
 * Initialise les dictionnaires FR et EN de leo-profanity.
 * Appelé une seule fois au bootstrap du plugin.
 *
 * @param languages - Langues à charger (fr et/ou en)
 */
export function init(languages: string[]): void {
  if (isInitialized) {
    return;
  }

  const supportedLanguages: SupportedLanguage[] = ['fr', 'en'];

  // leo-profanity.loadDictionary() REMPLACE le dictionnaire actif.
  // Pour supporter FR + EN, on charge chaque langue et on accumule les mots.
  const allWords: string[] = [];

  for (const lang of languages) {
    if (supportedLanguages.includes(lang as SupportedLanguage)) {
      try {
        leoProfanity.loadDictionary(lang as SupportedLanguage);
        allWords.push(...leoProfanity.list());
      } catch (err) {
        console.warn(
          `[strapi-plugin-comments] Avertissement : impossible de charger le dictionnaire '${lang}' pour leo-profanity.`,
          err
        );
      }
    } else {
      console.warn(
        `[strapi-plugin-comments] Langue '${lang}' non supportée par leo-profanity. Langues disponibles : fr, en.`
      );
    }
  }

  // Recharger tous les mots accumulés dans le dictionnaire actif
  if (allWords.length > 0) {
    leoProfanity.loadDictionary('en'); // Reset avec un dictionnaire de base
    leoProfanity.add(allWords);        // Ajouter tous les mots FR + EN
  }

  isInitialized = true;
}

/**
 * Vérifie si un texte contient une injure.
 *
 * @param text - Texte à vérifier
 * @param failOpen - Si true et qu'une erreur survient, retourne false (pas de blocage)
 * @returns true si le texte contient une injure
 */
export function check(text: string, failOpen = true): boolean {
  try {
    return leoProfanity.check(text);
  } catch (err) {
    console.error('[strapi-plugin-comments] Erreur du filtre anti-injures (check) :', err);
    // fail-open : en cas d'erreur, on n'empêche pas la soumission
    return failOpen ? false : true;
  }
}

/**
 * Remplace les injures par des astérisques dans un texte.
 * Utilisé pour le log/debug admin — jamais exposé en réponse API publique.
 *
 * @param text - Texte à nettoyer
 * @returns Texte censuré (ex: "putain" → "******")
 */
export function clean(text: string): string {
  try {
    return leoProfanity.clean(text, '*');
  } catch (err) {
    console.error('[strapi-plugin-comments] Erreur du filtre anti-injures (clean) :', err);
    // En cas d'erreur, on retourne le texte original plutôt que de crasher
    return text;
  }
}

/**
 * Réinitialise l'état d'initialisation.
 * Utilisé uniquement dans les tests.
 */
export function resetForTesting(): void {
  isInitialized = false;
}

/**
 * Retourne le nombre de mots dans le dictionnaire chargé.
 * Utile pour vérifier que l'initialisation s'est bien passée.
 */
export function getDictionarySize(): number {
  try {
    return leoProfanity.list().length;
  } catch {
    return 0;
  }
}

// ─── Test unitaire minimal ────────────────────────────────────────────────────
// init(['fr', 'en']) → isInitialized = true
// check('hello world') → false
// clean('hello world') → 'hello world' (inchangé si pas d'injure)
