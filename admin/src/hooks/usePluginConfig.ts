/**
 * Hook usePluginConfig — récupère la configuration courante du plugin.
 * Lecture seule en V1 (la config est gérée dans le projet hôte).
 */

import { useState, useEffect } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

export interface PluginConfig {
  targetCollection: string;
  requireApproval: boolean;
  allowDelete: boolean;
  profanityFilter: {
    enabled: boolean;
    languages: string[];
    action: string;
  };
  rateLimit: {
    enabled: boolean;
    windowMs: number;
    max: number;
  };
  avatar: {
    enabled: boolean;
  };
  subscriber: {
    enabled: boolean;
    categoryName: string;
  };
  moderation: {
    enabled: boolean;
  };
  reportThreshold: {
    enabled: boolean;
    count: number;
  };
}

interface UsePluginConfigReturn {
  config: PluginConfig | null;
  isLoading: boolean;
  error: string | null;
}

export function usePluginConfig(): UsePluginConfigReturn {
  const { get } = useFetchClient();
  const [config, setConfig] = useState<PluginConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);

    get<{ data: PluginConfig }>(`/${pluginId}/admin/config`)
      .then((response) => {
        setConfig(response?.data?.data ?? null);
      })
      .catch(() => {
        setError('Impossible de charger la configuration du plugin.');
      })
      .finally(() => {
        setIsLoading(false);
      });
    // Exécuté une seule fois au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { config, isLoading, error };
}
