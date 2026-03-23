/**
 * Tests unitaires — Service avatar
 *
 * Couverture :
 *   - hashToIndex : déterminisme, valeurs limites
 *   - generateColor : cohérence, prénom vide, prénom avec casse
 *   - getAvatarData : initiale, couleur, prénom vide
 */

import { describe, it, expect } from 'vitest';
import { hashToIndex, generateColor, getAvatarData } from '../services/avatar';

/** Palette de test (sous-ensemble de la palette ISOMORPH) */
const TEST_PALETTE = [
  '#B5EAD7',
  '#C7CEEA',
  '#FFDAC1',
  '#FFB7B2',
  '#FF9AA2',
  '#E2F0CB',
  '#B5D5F5',
  '#FFF1BA',
  '#D4B8E0',
  '#B8E0D4',
  '#FAD4C0',
  '#C8E6C9',
];

// ─── hashToIndex ──────────────────────────────────────────────────────────────

describe('hashToIndex', () => {
  it('retourne toujours le même index pour la même entrée (déterminisme)', () => {
    const result1 = hashToIndex('florent', 12);
    const result2 = hashToIndex('florent', 12);
    expect(result1).toBe(result2);
  });

  it('retourne un index dans les bornes [0, paletteSize - 1]', () => {
    const paletteSize = 12;
    const inputs = ['florent', 'marie', 'jean', 'alice', 'bob', 'z', 'a'];

    for (const input of inputs) {
      const index = hashToIndex(input, paletteSize);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(paletteSize);
    }
  });

  it('retourne des index différents pour des prénoms différents (diversité)', () => {
    const indices = new Set<number>();
    const prénoms = ['alice', 'bob', 'charlie', 'diana', 'emile', 'francoise', 'gilles'];

    for (const prénom of prénoms) {
      indices.add(hashToIndex(prénom, 12));
    }

    // Avec 7 prénoms distincts et une palette de 12, on attend au moins 4 couleurs différentes
    expect(indices.size).toBeGreaterThan(3);
  });

  it('lance une erreur si paletteSize est 0 ou négatif', () => {
    expect(() => hashToIndex('florent', 0)).toThrow();
    expect(() => hashToIndex('florent', -1)).toThrow();
  });
});

// ─── generateColor ────────────────────────────────────────────────────────────

describe('generateColor', () => {
  it('retourne la même couleur pour le même prénom (déterminisme)', () => {
    const color1 = generateColor('Florent', TEST_PALETTE);
    const color2 = generateColor('Florent', TEST_PALETTE);
    expect(color1).toBe(color2);
  });

  it('retourne une couleur de la palette pour un prénom valide', () => {
    const color = generateColor('Marie', TEST_PALETTE);
    expect(TEST_PALETTE).toContain(color);
  });

  it('retourne la première couleur de la palette pour un prénom vide', () => {
    const color = generateColor('', TEST_PALETTE);
    expect(color).toBe(TEST_PALETTE[0]);
  });

  it('normalise la casse avant de calculer (Florent et florent → même couleur)', () => {
    const color1 = generateColor('Florent', TEST_PALETTE);
    const color2 = generateColor('florent', TEST_PALETTE);
    const color3 = generateColor('FLORENT', TEST_PALETTE);
    expect(color1).toBe(color2);
    expect(color2).toBe(color3);
  });

  it('retourne un code hexadécimal valide', () => {
    const color = generateColor('Jean', TEST_PALETTE);
    expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ─── getAvatarData ────────────────────────────────────────────────────────────

describe('getAvatarData', () => {
  it('retourne la première lettre du prénom en majuscule', () => {
    const avatar = getAvatarData('florent', TEST_PALETTE);
    expect(avatar.initial).toBe('F');
  });

  it('retourne une initiale majuscule même si le prénom commence par une minuscule', () => {
    const avatar = getAvatarData('alice', TEST_PALETTE);
    expect(avatar.initial).toBe('A');
  });

  it('retourne "?" comme initiale pour un prénom vide', () => {
    const avatar = getAvatarData('', TEST_PALETTE);
    expect(avatar.initial).toBe('?');
  });

  it('retourne une couleur de la palette', () => {
    const avatar = getAvatarData('Marie', TEST_PALETTE);
    expect(TEST_PALETTE).toContain(avatar.color);
  });

  it('retourne un objet avec les propriétés initial et color', () => {
    const avatar = getAvatarData('Pierre', TEST_PALETTE);
    expect(avatar).toHaveProperty('initial');
    expect(avatar).toHaveProperty('color');
    expect(typeof avatar.initial).toBe('string');
    expect(typeof avatar.color).toBe('string');
  });

  it('est déterministe — même résultat pour le même prénom', () => {
    const avatar1 = getAvatarData('Jean', TEST_PALETTE);
    const avatar2 = getAvatarData('Jean', TEST_PALETTE);
    expect(avatar1.initial).toBe(avatar2.initial);
    expect(avatar1.color).toBe(avatar2.color);
  });
});
