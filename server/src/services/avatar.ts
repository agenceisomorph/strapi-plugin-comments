/**
 * Service avatar — génération de données d'avatar par initiale + couleur pastel.
 *
 * ADR-02 : Le plugin génère uniquement des données brutes { initial, color }.
 * Le rendu visuel (SVG, CSS, canvas) est délégué au frontend.
 *
 * Avantages RGESN : zéro octet d'image transféré, zéro dépendance de génération d'image.
 * La couleur est déterministe depuis le prénom — cohérente entre les rechargements.
 *
 * Palette pastel ISOMORPH : 12 couleurs conformes WCAG AA (contraste ≥ 4.5:1
 * sur fond blanc avec une lettre sombre #333).
 */

/**
 * Données d'avatar retournées par l'API.
 * Format : { initial: "F", color: "#B5EAD7" }
 */
export interface AvatarData {
  /** Première lettre du prénom, en majuscule. */
  initial: string;
  /** Code couleur hexadécimal pastel (ex: #B5EAD7). */
  color: string;
}

/**
 * Génère un index de couleur déterministe depuis une chaîne.
 *
 * Algorithme : somme des codes de caractères modulo la taille de la palette.
 * Garantit la même couleur pour le même prénom à chaque appel.
 *
 * @param input - La chaîne d'entrée (prénom du commentateur)
 * @param paletteSize - Nombre de couleurs dans la palette
 * @returns Index dans la palette (0 à paletteSize - 1)
 */
export function hashToIndex(input: string, paletteSize: number): number {
  if (paletteSize <= 0) {
    throw new Error('La taille de la palette doit être supérieure à 0');
  }

  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash += input.charCodeAt(i);
  }

  return hash % paletteSize;
}

/**
 * Génère la couleur pastel associée à un prénom.
 *
 * @param firstname - Prénom du commentateur
 * @param palette - Palette de couleurs hexadécimales
 * @returns Code couleur hexadécimal (ex: "#B5EAD7")
 */
export function generateColor(firstname: string, palette: string[]): string {
  if (!firstname || firstname.trim().length === 0) {
    // Couleur par défaut si le prénom est absent
    return palette[0] ?? '#B5EAD7';
  }

  const normalizedFirstname = firstname.trim().toLowerCase();
  const index = hashToIndex(normalizedFirstname, palette.length);

  return palette[index] ?? palette[0] ?? '#B5EAD7';
}

/**
 * Retourne les données d'avatar complètes pour un commentateur.
 *
 * @param firstname - Prénom du commentateur
 * @param palette - Palette de couleurs (issue de la config du plugin)
 * @returns Données d'avatar { initial, color }
 *
 * @example
 * ```ts
 * const avatar = getAvatarData('Florent', config.avatar.palette);
 * // { initial: 'F', color: '#B5EAD7' }
 * ```
 */
export function getAvatarData(firstname: string, palette: string[]): AvatarData {
  const trimmed = firstname?.trim() ?? '';
  const initial = trimmed.length > 0 ? trimmed[0]!.toUpperCase() : '?';
  const color = generateColor(trimmed, palette);

  return { initial, color };
}

/**
 * Crée une instance du service avatar avec la palette injectée depuis la config.
 * Exposé en tant que factory pour l'injection dans le registre de services Strapi.
 */
export function createAvatarService(palette: string[]): {
  generateColor: (firstname: string) => string;
  getAvatarData: (firstname: string) => AvatarData;
} {
  return {
    generateColor: (firstname: string) => generateColor(firstname, palette),
    getAvatarData: (firstname: string) => getAvatarData(firstname, palette),
  };
}

// ─── Tests unitaires ─────────────────────────────────────────────────────────
// Exécuter avec : vitest run server/src/services/avatar.ts
// (si vitest est configuré pour exécuter les inline tests)
//
// Test minimal recommandé (voir avatar.test.ts) :
//   hashToIndex('florent', 12) → valeur stable à travers les exécutions
//   generateColor('Florent', palette) → même couleur pour le même prénom
//   getAvatarData('Florent', palette) → { initial: 'F', color: string }
