/**
 * Tests unitaires — Middleware sanitize-input
 *
 * Couverture :
 *   - sanitizeString : suppression XSS, scripts, balises HTML
 *   - sanitizeFields : traitement sélectif des champs
 */

import { describe, it, expect } from 'vitest';
import { sanitizeString, sanitizeFields } from '../middlewares/sanitize-input';

// ─── sanitizeString ───────────────────────────────────────────────────────────

describe('sanitizeString', () => {
  it('supprime les balises script', () => {
    const result = sanitizeString('<script>alert("xss")</script>Hello');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
    expect(result).toBe('Hello');
  });

  it('supprime les balises HTML courantes', () => {
    const result = sanitizeString('<b>Jean</b>');
    expect(result).toBe('Jean');
  });

  it('supprime les balises avec attributs malveillants', () => {
    const result = sanitizeString('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('<img');
    expect(result).not.toContain('onerror');
  });

  it('supprime les balises iframe', () => {
    const result = sanitizeString('<iframe src="evil.com"></iframe>Texte');
    expect(result).not.toContain('<iframe');
    expect(result).toContain('Texte');
  });

  it('conserve le texte brut sans modification', () => {
    const texte = 'Bonjour, je suis très content de ce produit ! 5/5';
    expect(sanitizeString(texte)).toBe(texte);
  });

  it('conserve les apostrophes et caractères spéciaux légitimes', () => {
    const texte = "L'article est excellent — vraiment bien écrit.";
    const result = sanitizeString(texte);
    expect(result).toContain("L'article");
    expect(result).toContain('excellent');
  });

  it('trim les espaces en début et fin de chaîne', () => {
    expect(sanitizeString('  hello  ')).toBe('hello');
  });
});

// ─── sanitizeFields ───────────────────────────────────────────────────────────

describe('sanitizeFields', () => {
  it('sanitise uniquement les champs spécifiés', () => {
    const body = {
      firstname: '<b>Jean</b>',
      email: 'jean@test.com',
      content: '<script>evil()</script>Bonjour',
      autres: '<b>ne pas toucher</b>',
    };

    const result = sanitizeFields(body, ['firstname', 'content']);

    expect(result['firstname']).toBe('Jean');
    expect(result['content']).toBe('Bonjour');
    // Les champs non listés ne sont pas sanitisés
    expect(result['autres']).toBe('<b>ne pas toucher</b>');
    // Les champs non-string sont ignorés
    expect(result['email']).toBe('jean@test.com');
  });

  it('ne modifie pas les champs non-string (nombres, booléens)', () => {
    const body = {
      firstname: 'Jean',
      count: 42,
      active: true,
    };

    const result = sanitizeFields(body, ['firstname', 'count', 'active']);

    expect(result['count']).toBe(42);
    expect(result['active']).toBe(true);
  });

  it('retourne un nouvel objet sans muter l\'original', () => {
    const original = { firstname: '<b>Jean</b>' };
    const result = sanitizeFields(original, ['firstname']);

    expect(original['firstname']).toBe('<b>Jean</b>');
    expect(result['firstname']).toBe('Jean');
  });

  it('gère un body vide sans erreur', () => {
    expect(() => sanitizeFields({}, ['firstname'])).not.toThrow();
  });
});
