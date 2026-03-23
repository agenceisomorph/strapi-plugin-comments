/**
 * Point d'entrée admin du plugin Comments.
 *
 * Enregistre le plugin dans le panneau admin Strapi :
 *   - register(app)  : ajout du lien dans la sidebar + enregistrement du plugin
 *   - bootstrap(app) : montage de l'Initializer pour le fetch initial des stats
 *   - registerTrads  : chargement des traductions FR et EN
 *
 * Conforme à l'API Plugin Admin Strapi V5 documentée :
 * https://docs.strapi.io/cms/plugins-development/admin-navigation-settings
 * https://docs.strapi.io/cms/plugins-development/admin-localization
 *
 * Éco-conception : le composant App est chargé en dynamic import (lazy)
 * — aucun JS admin n'est chargé si l'utilisateur ne visite pas le plugin.
 */

import pluginId from './pluginId';
import PluginIcon from './components/PluginIcon';

/**
 * Préfixe les clés de traduction avec l'ID du plugin.
 */
function prefixPluginTranslations(
  translations: Record<string, string>,
  prefix: string
): Record<string, string> {
  return Object.entries(translations).reduce<Record<string, string>>(
    (acc, [key, value]) => {
      acc[`${prefix}.${key}`] = value;
      return acc;
    },
    {}
  );
}

export default {
  register(app: any) {
    app.addMenuLink({
      to: `plugins/${pluginId}`,
      icon: PluginIcon,
      intlLabel: {
        id: `${pluginId}.plugin.name`,
        defaultMessage: 'Commentaires',
      },
      Component: async () => {
        return import('./pages/App');
      },
      permissions: [],
      badgeContent: '!',
    });

    app.registerPlugin({
      id: pluginId,
      name: 'Comments',
      isReady: true,
    });
  },

  async bootstrap(app: any) {
    // Fetch du nombre de commentaires en attente pour le badge sidebar
    try {
      const response = await fetch('/comments/admin/stats', {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${JSON.parse(sessionStorage.getItem('jwtToken') || '""')}`,
        },
      });
      if (response.ok) {
        const result = await response.json();
        const pending = result?.data?.pendingApproval ?? 0;
        if (pending > 0) {
          // Mise à jour du badge via l'API menu si disponible
          // Strapi V5 ne supporte pas nativement le badge dynamique sur les liens menu
          // Le Dashboard affiche le compteur directement
          console.info(`[strapi-plugin-comments] ${pending} commentaire(s) en attente de modération.`);
        }
      }
    } catch {
      // Fail-open : pas de badge si le fetch échoue
    }
  },

  async registerTrads({ locales }: { locales: string[] }) {
    return Promise.all(
      locales.map((locale) =>
        import(`./translations/${locale}.json`)
          .then(({ default: data }: { default: Record<string, string> }) => ({
            data: prefixPluginTranslations(data, pluginId),
            locale,
          }))
          .catch(() => ({
            data: {} as Record<string, string>,
            locale,
          }))
      )
    );
  },
};
