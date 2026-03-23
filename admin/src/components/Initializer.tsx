/**
 * Composant Initializer — monté une seule fois au bootstrap admin.
 *
 * Rôle : effectuer la requête initiale vers /admin/stats et stocker
 * le compteur de signalements en attente dans un état global minimal.
 *
 * Ce composant est invisible (retourne null). Il sert uniquement à
 * déclencher le fetch initial au montage du panel admin.
 *
 * Éco-conception : une seule requête au montage, pas de polling.
 * Fail-open : toute erreur réseau ou 403 est absorbée silencieusement
 * pour ne pas bloquer l'interface admin.
 */

import React, { useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

/** Données de stats retournées par GET /admin/stats */
interface AdminStats {
  totalComments: number;
  pendingApproval: number;
  approvedComments: number;
  blockedComments: number;
  reports: {
    total: number;
    pending: number;
  };
}

interface StatsResponse {
  data: AdminStats;
}

/** Callback appelé avec les stats au montage */
interface InitializerProps {
  onStats?: (stats: AdminStats) => void;
}

const Initializer: React.FC<InitializerProps> = ({ onStats }) => {
  const { get } = useFetchClient();

  useEffect(() => {
    // Fetch initial des stats — fail-open si erreur
    get<StatsResponse>(`/${pluginId}/admin/stats`)
      .then((response) => {
        if (response?.data?.data && onStats) {
          onStats(response.data.data);
        }
      })
      .catch(() => {
        // Erreur réseau ou 403 : absorption silencieuse
        // L'admin reste fonctionnel, le badge ne s'affiche simplement pas
      });
    // Exécuté une seule fois au montage — pas de dépendances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Composant invisible — rendu nul
  return null;
};

export default Initializer;
