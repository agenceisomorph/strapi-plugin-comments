/**
 * Tests unitaires — Vérification de licence EN LIGNE (V2)
 *
 * Couvre le cœur sécuritaire du modèle payant :
 *   - Clé valide côté serveur (achat réel) → tier Pro
 *   - Clé inconnue / révoquée / expirée (valid:false) → repli immédiat Community
 *   - Clé de format invalide → Community sans appel réseau
 *   - Panne serveur DANS la fenêtre de grâce → maintien du Pro (client non pénalisé)
 *   - Panne serveur HORS fenêtre de grâce → repli Community (fail-safe révocation)
 *   - testKey (endpoint admin) : valide / inconnue / serveur injoignable
 *
 * `fetch` est mocké ; un faux `strapi` fournit config + store en mémoire.
 * NB : l'état de licence est au niveau module → chaque test pilote explicitement
 * l'état via refreshNow() avec un mock déterministe.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLicenseService } from '../services/license';

const VALID_KEY = 'ISOMORPH-COMMENTS-ABCD-EFAB-0000-0000'; // checksum pair

/** Fabrique un faux strapi avec config licence + store mémoire. */
function makeStrapi(opts: { licenseKey?: string; graceDays?: number } = {}) {
  const storeData = new Map<string, unknown>();
  return {
    config: {
      get: (key: string) => {
        if (key === 'plugin::comments') {
          return {
            licenseKey: opts.licenseKey,
            license: {
              verifyUrl: 'https://isomorph.dev/api/licenses/verify',
              verifyIntervalHours: 12,
              graceDays: opts.graceDays ?? 7,
              timeoutMs: 5000,
            },
          };
        }
        if (key === 'server.url') return 'https://client-site.example';
        return undefined;
      },
    },
    store: () => ({
      get: async ({ key }: { key: string }) => storeData.get(key) ?? null,
      set: async ({ key, value }: { key: string; value: unknown }) => {
        storeData.set(key, value);
      },
    }),
    log: { warn: () => undefined },
  } as never;
}

/** Mock d'une réponse fetch JSON. */
function mockFetchJson(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

describe('license — vérification en ligne', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clé valide côté serveur → tier Pro', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchJson(200, { valid: true, plan: 'pro', plugin: 'comments', expiresAt: '2027-01-01T00:00:00.000Z' })
    );
    const svc = createLicenseService(makeStrapi({ licenseKey: VALID_KEY }));
    const tier = await svc.refreshNow();
    expect(tier).toBe('pro');
    expect(svc.isProLicense()).toBe(true);
    expect(svc.getExpiresAt()).toBe('2027-01-01T00:00:00.000Z');
    vi.unstubAllGlobals();
  });

  it('clé inconnue (valid:false) → repli Community immédiat', async () => {
    vi.stubGlobal('fetch', mockFetchJson(200, { valid: false, reason: 'not_found' }));
    const svc = createLicenseService(makeStrapi({ licenseKey: VALID_KEY }));
    const tier = await svc.refreshNow();
    expect(tier).toBe('community');
    expect(svc.isProLicense()).toBe(false);
    vi.unstubAllGlobals();
  });

  it('pas de clé configurée → Community sans appel réseau', async () => {
    const fetchMock = mockFetchJson(200, { valid: true, plan: 'pro' });
    vi.stubGlobal('fetch', fetchMock);
    const svc = createLicenseService(makeStrapi({ licenseKey: undefined }));
    const tier = await svc.refreshNow();
    expect(tier).toBe('community');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('clé de format invalide → Community sans appel réseau', async () => {
    const fetchMock = mockFetchJson(200, { valid: true, plan: 'pro' });
    vi.stubGlobal('fetch', fetchMock);
    const svc = createLicenseService(makeStrapi({ licenseKey: 'PAS-UNE-CLE' }));
    const tier = await svc.refreshNow();
    expect(tier).toBe('community');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('panne serveur DANS la fenêtre de grâce → maintien du Pro', async () => {
    const strapi = makeStrapi({ licenseKey: VALID_KEY, graceDays: 7 });
    const svc = createLicenseService(strapi);

    // 1) Vérif réussie → Pro, lastGoodAt = maintenant
    vi.stubGlobal('fetch', mockFetchJson(200, { valid: true, plan: 'pro', plugin: 'comments' }));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();

    // 2) Le serveur tombe → fetch rejette. lastGoodAt est récent → on garde Pro.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();
  });

  it('panne serveur HORS fenêtre de grâce → repli Community', async () => {
    // graceDays = 0 → toute panne dépasse immédiatement la grâce.
    const strapi = makeStrapi({ licenseKey: VALID_KEY, graceDays: 0 });
    const svc = createLicenseService(strapi);

    vi.stubGlobal('fetch', mockFetchJson(200, { valid: true, plan: 'pro', plugin: 'comments' }));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    expect(await svc.refreshNow()).toBe('community');
    vi.unstubAllGlobals();
  });

  it('statut 5xx traité comme panne (pas comme invalidité)', async () => {
    const strapi = makeStrapi({ licenseKey: VALID_KEY, graceDays: 7 });
    const svc = createLicenseService(strapi);

    vi.stubGlobal('fetch', mockFetchJson(200, { valid: true, plan: 'pro', plugin: 'comments' }));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();

    // 503 → doit être traité comme transitoire → grâce → Pro maintenu
    vi.stubGlobal('fetch', mockFetchJson(503, { error: 'down' }));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();
  });

  it('plan enterprise → Pro (mappé sur les mêmes fonctions)', async () => {
    vi.stubGlobal('fetch', mockFetchJson(200, { valid: true, plan: 'enterprise', plugin: 'comments' }));
    const svc = createLicenseService(makeStrapi({ licenseKey: VALID_KEY }));
    expect(await svc.refreshNow()).toBe('pro');
    vi.unstubAllGlobals();
  });

  describe('testKey (endpoint admin « tester une clé »)', () => {
    it('clé valide → { valid:true, tier:pro }', async () => {
      vi.stubGlobal('fetch', mockFetchJson(200, { valid: true, plan: 'pro', plugin: 'comments' }));
      const svc = createLicenseService(makeStrapi());
      const r = await svc.testKey(VALID_KEY);
      expect(r).toMatchObject({ valid: true, tier: 'pro' });
      vi.unstubAllGlobals();
    });

    it('clé inconnue → { valid:false, tier:community }', async () => {
      vi.stubGlobal('fetch', mockFetchJson(200, { valid: false, reason: 'not_found' }));
      const svc = createLicenseService(makeStrapi());
      const r = await svc.testKey(VALID_KEY);
      expect(r).toMatchObject({ valid: false, tier: 'community', reason: 'not_found' });
      vi.unstubAllGlobals();
    });

    it('format invalide → sans appel réseau', async () => {
      const fetchMock = mockFetchJson(200, { valid: true });
      vi.stubGlobal('fetch', fetchMock);
      const svc = createLicenseService(makeStrapi());
      const r = await svc.testKey('nope');
      expect(r).toMatchObject({ valid: false, reason: 'invalid_format' });
      expect(fetchMock).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    });

    it('serveur injoignable → serverUnreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
      const svc = createLicenseService(makeStrapi());
      const r = await svc.testKey(VALID_KEY);
      expect(r).toMatchObject({ valid: false, serverUnreachable: true });
      vi.unstubAllGlobals();
    });
  });

  it('getMaskedKey masque tout sauf le dernier groupe', () => {
    const svc = createLicenseService(makeStrapi({ licenseKey: VALID_KEY }));
    expect(svc.getMaskedKey()).toBe('ISOMORPH-COMMENTS-****-****-****-0000');
  });

  beforeEach(() => {
    // Rien : chaque test pilote son propre état via refreshNow().
  });
});
