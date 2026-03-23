/**
 * Hook useStats — récupère les statistiques du tableau de bord admin.
 *
 * Utilisé par la page Dashboard et l'Initializer pour le badge.
 * Éco-conception : pas de refetch automatique (polling désactivé par défaut).
 */

import { useState, useEffect, useCallback } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

export interface AdminStats {
  totalComments: number;
  pendingApproval: number;
  approvedComments: number;
  blockedComments: number;
  reports: {
    total: number;
    pending: number;
  };
}

interface UseStatsReturn {
  stats: AdminStats | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

const DEFAULT_STATS: AdminStats = {
  totalComments: 0,
  pendingApproval: 0,
  approvedComments: 0,
  blockedComments: 0,
  reports: { total: 0, pending: 0 },
};

export function useStats(): UseStatsReturn {
  const { get } = useFetchClient();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await get<{ data: AdminStats }>(`/${pluginId}/admin/stats`);
      setStats(response?.data?.data ?? DEFAULT_STATS);
    } catch {
      setError('Impossible de charger les statistiques.');
    } finally {
      setIsLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return { stats, isLoading, error, refetch: fetchStats };
}
