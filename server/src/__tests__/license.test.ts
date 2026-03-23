/**
 * Tests unitaires — Service de licence
 *
 * Couverture :
 *   - validateLicenseKey : format valide, format invalide, checksum pair/impair
 *   - Cas limites : clé vide, null, undefined, préfixe incorrect, groupes hex incorrects
 *
 * Pattern AAA (Arrange / Act / Assert) — un concept par test.
 */

import { describe, it, expect } from 'vitest';
import { validateLicenseKey } from '../services/license';

// ── Clés de test avec checksum calculé ────────────────────────────────────────

/**
 * Génère une clé ISOMORPH-COMMENTS avec un checksum connu.
 *
 * Calcul manuel :
 *   ABCD-EFAB-0000-0000 → A+B+C+D+E+F+A+B = 10+11+12+13+14+15+10+11 = 86 (pair → valide)
 */
const VALID_KEY = 'ISOMORPH-COMMENTS-ABCD-EFAB-0000-0000';

/**
 * Clé avec checksum impair (invalide).
 *
 * Calcul : AAAA-AAAA-AAAA-AAAB
 * A×15 + B = 10×15 + 11 = 150 + 11 = 161 (impair → invalide)
 */
const INVALID_CHECKSUM_KEY = 'ISOMORPH-COMMENTS-AAAA-AAAA-AAAA-AAAB';

describe('validateLicenseKey', () => {
  // ── Clés valides ──────────────────────────────────────────────────────────

  it('accepte une clé avec checksum pair', () => {
    // Arrange
    const key = VALID_KEY;
    // Act
    const result = validateLicenseKey(key);
    // Assert
    expect(result).toBe(true);
  });

  it('accepte une clé dont tous les nibbles hex sont nuls (somme = 0 → pair)', () => {
    // Arrange : 0000-0000-0000-0000 → somme = 0 (pair)
    const key = 'ISOMORPH-COMMENTS-0000-0000-0000-0000';
    // Act
    const result = validateLicenseKey(key);
    // Assert
    expect(result).toBe(true);
  });

  it('accepte une clé avec uniquement des caractères A majuscules (somme 16×10 = 160 → pair)', () => {
    // Arrange : AAAA-AAAA-AAAA-AAAA → 16 × 10 = 160 (pair)
    const key = 'ISOMORPH-COMMENTS-AAAA-AAAA-AAAA-AAAA';
    // Act
    const result = validateLicenseKey(key);
    // Assert
    expect(result).toBe(true);
  });

  // ── Clés invalides — format ───────────────────────────────────────────────

  it('rejette une chaîne vide', () => {
    expect(validateLicenseKey('')).toBe(false);
  });

  it('rejette undefined casté en string vide', () => {
    // @ts-expect-error : test volontaire d'un type incorrect
    expect(validateLicenseKey(undefined)).toBe(false);
  });

  it('rejette null casté', () => {
    // @ts-expect-error : test volontaire d'un type incorrect
    expect(validateLicenseKey(null)).toBe(false);
  });

  it('rejette un préfixe incorrect (minuscules)', () => {
    const key = 'isomorph-comments-ABCD-EFAB-0000-0000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette un préfixe ISOMORPH-PLUGIN- incorrect', () => {
    const key = 'ISOMORPH-PLUGIN-ABCD-EFAB-0000-0000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette une clé avec des groupes de 3 caractères au lieu de 4', () => {
    const key = 'ISOMORPH-COMMENTS-ABC-DEF-000-000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette une clé avec des groupes de 5 caractères', () => {
    const key = 'ISOMORPH-COMMENTS-ABCDE-FABCD-00000-00000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette des caractères hex en minuscules dans les groupes', () => {
    const key = 'ISOMORPH-COMMENTS-abcd-efab-0000-0000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette des caractères non-hex (G-Z) dans les groupes', () => {
    const key = 'ISOMORPH-COMMENTS-GHIJ-KLMN-OPQR-STUV';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette une clé avec seulement 3 groupes', () => {
    const key = 'ISOMORPH-COMMENTS-ABCD-EFAB-0000';
    expect(validateLicenseKey(key)).toBe(false);
  });

  it('rejette une clé avec 5 groupes', () => {
    const key = 'ISOMORPH-COMMENTS-ABCD-EFAB-0000-0000-1111';
    expect(validateLicenseKey(key)).toBe(false);
  });

  // ── Clés invalides — checksum ─────────────────────────────────────────────

  it('rejette une clé avec checksum impair', () => {
    // Arrange
    const key = INVALID_CHECKSUM_KEY;
    // Act
    const result = validateLicenseKey(key);
    // Assert
    expect(result).toBe(false);
  });

  it('rejette FFFF-FFFF-FFFF-FFFF (somme 16×15 = 240 → pair → VALIDE, test de non-régression)', () => {
    // Note : cette clé EST valide (240 est pair)
    const key = 'ISOMORPH-COMMENTS-FFFF-FFFF-FFFF-FFFF';
    expect(validateLicenseKey(key)).toBe(true);
  });

  it('rejette FFFF-FFFF-FFFF-FFFE (somme = 240-1+14 = 253 → impair → invalide)', () => {
    // F×15 + E = 15×15 + 14 = 225 + 14 = 239 (impair)
    const key = 'ISOMORPH-COMMENTS-FFFF-FFFF-FFFF-FFFE';
    expect(validateLicenseKey(key)).toBe(false);
  });
});
