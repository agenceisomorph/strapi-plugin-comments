/**
 * Déclarations TypeScript pour les modules sans types natifs.
 * Utilisé par la partie admin du plugin (composants React).
 */

// Déclaration pour les imports de fichiers JSON (traductions)
declare module '*.json' {
  const value: Record<string, string>;
  export default value;
}
