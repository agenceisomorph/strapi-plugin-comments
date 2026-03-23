/**
 * Configuration Vitest pour les tests unitaires du plugin comments.
 * Exécuter : npm test
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['server/src/__tests__/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      include: ['server/src/**/*.ts'],
      exclude: ['server/src/__tests__/**', 'server/src/index.ts'],
      thresholds: {
        // Seuil ISOMORPH : 80% de couverture sur les fonctions métier critiques
        functions: 80,
        lines: 70,
      },
    },
  },
  resolve: {
    // Résolution des imports TypeScript
    extensions: ['.ts', '.js'],
  },
});
