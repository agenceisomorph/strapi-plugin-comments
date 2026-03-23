/**
 * Hook useLicense — récupère l'état de la licence du plugin.
 *
 * Retourne le tier actuel (community/pro), le nombre de commentaires,
 * la limite Community et la liste des fonctionnalités disponibles.
 *
 * Fail-open : en cas d'erreur réseau, on retourne un état Community par défaut
 * pour ne pas bloquer l'interface admin.
 *
 * Éco-conception : pas de polling — fetch unique au montage.
 * Le hook est léger (aucune dépendance externe).
 */

import { useState, useEffect, useCallback } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

export type LicenseTier = 'community' | 'pro';

export interface LicenseFeatures {
  crud: boolean;
  profanityFilter: boolean;
  avatar: boolean;
  likes: boolean;
  adminBasic: boolean;
  unlimitedComments: boolean;
  bulkActions: boolean;
  pinning: boolean;
  reports: boolean;
  adminReply: boolean;
  advancedSearch: boolean;
  rateLimit: boolean;
  recaptcha: boolean;
  notificationBadge: boolean;
}

export interface LicenseInfo {
  tier: LicenseTier;
  maskedKey: string | null;
  commentCount: number;
  commentLimit: number | null;
  upgradeUrl: string | null;
  features: LicenseFeatures;
}

interface UseLicenseReturn {
  license: LicenseInfo | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/** État Community par défaut — retourné en cas d'erreur (fail-open) */
const DEFAULT_LICENSE: LicenseInfo = {
  tier: 'community',
  maskedKey: null,
  commentCount: 0,
  commentLimit: 500,
  upgradeUrl: 'https://isomorph.fr/plugins/comments',
  features: {
    crud: true,
    profanityFilter: true,
    avatar: true,
    likes: true,
    adminBasic: true,
    unlimitedComments: false,
    bulkActions: false,
    pinning: false,
    reports: false,
    adminReply: false,
    advancedSearch: false,
    rateLimit: false,
    recaptcha: false,
    notificationBadge: false,
  },
};

export function useLicense(): UseLicenseReturn {
  const { get } = useFetchClient();
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLicense = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await get<{ data: LicenseInfo }>(`/${pluginId}/admin/license`);
      setLicense(response?.data?.data ?? DEFAULT_LICENSE);
    } catch {
      // Fail-open : on utilise le tier Community par défaut sans bloquer l'admin
      setLicense(DEFAULT_LICENSE);
      setError('Impossible de charger les informations de licence.');
    } finally {
      setIsLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchLicense();
  }, [fetchLicense]);

  return { license, isLoading, error, refetch: fetchLicense };
}
