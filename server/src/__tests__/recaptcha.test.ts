/**
 * Tests unitaires — Service recaptcha
 *
 * Couverture :
 *   - isConfigured : détection de la variable d'environnement
 *   - verify : token vide, score insuffisant
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { isConfigured, verify } from '../services/recaptcha';

// ─── isConfigured ─────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  const ORIGINAL_ENV = process.env['RECAPTCHA_SECRET_KEY'];

  afterEach(() => {
    if (ORIGINAL_ENV !== undefined) {
      process.env['RECAPTCHA_SECRET_KEY'] = ORIGINAL_ENV;
    } else {
      delete process.env['RECAPTCHA_SECRET_KEY'];
    }
  });

  it('retourne false si RECAPTCHA_SECRET_KEY est absente', () => {
    delete process.env['RECAPTCHA_SECRET_KEY'];
    expect(isConfigured()).toBe(false);
  });

  it('retourne false si RECAPTCHA_SECRET_KEY est vide', () => {
    process.env['RECAPTCHA_SECRET_KEY'] = '';
    expect(isConfigured()).toBe(false);
  });

  it('retourne true si RECAPTCHA_SECRET_KEY est définie', () => {
    process.env['RECAPTCHA_SECRET_KEY'] = 'secret_test_key';
    expect(isConfigured()).toBe(true);
  });
});

// ─── verify ───────────────────────────────────────────────────────────────────

describe('verify', () => {
  it('retourne success=false si le token est vide', async () => {
    const result = await verify('', 'secret', 0.5);
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-response');
  });

  it('retourne success=false si le token est uniquement des espaces', async () => {
    const result = await verify('   ', 'secret', 0.5);
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain('missing-input-response');
  });

  it('retourne success=false (fail-open) en cas d\'erreur réseau si failClosed=false', async () => {
    // Mock fetch pour simuler une erreur réseau
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await verify('valid-token', 'secret', 0.5, undefined, false);
    expect(result.success).toBe(true); // fail-open = autorisé malgré l'erreur

    global.fetch = originalFetch;
  });

  it('retourne success=false (fail-closed) en cas d\'erreur réseau si failClosed=true', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await verify('valid-token', 'secret', 0.5, undefined, true);
    expect(result.success).toBe(false); // fail-closed = bloqué en cas d'erreur

    global.fetch = originalFetch;
  });

  it('retourne success=false si le score est inférieur au seuil', async () => {
    // Mock d'une réponse Google avec un score de 0.3 (inférieur au seuil 0.5)
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, score: 0.3 }),
    } as Response);

    const result = await verify('valid-token', 'secret', 0.5);
    expect(result.success).toBe(false);
    expect(result.score).toBe(0.3);
    expect(result.errorCodes).toContain('score-below-threshold');

    global.fetch = originalFetch;
  });

  it('retourne success=true si le score dépasse le seuil', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, score: 0.8 }),
    } as Response);

    const result = await verify('valid-token', 'secret', 0.5);
    expect(result.success).toBe(true);
    expect(result.score).toBe(0.8);

    global.fetch = originalFetch;
  });
});
