/**
 * Hook useReports — fetch et mutations sur les signalements admin.
 *
 * Expose :
 *   - reports      : liste paginée des signalements
 *   - pagination   : métadonnées de pagination
 *   - filters      : état des filtres actifs
 *   - setFilters   : mise à jour des filtres (déclenche un refetch)
 *   - markReviewed : marquer un signalement comme examiné
 *   - dismiss      : rejeter un signalement
 *   - refetch      : recharger la liste
 */

import { useState, useEffect, useCallback } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

export type ReportReason = 'offensive' | 'spam' | 'harassment' | 'misinformation' | 'other';
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

export interface Report {
  id: number;
  documentId: string;
  reason: ReportReason;
  description?: string | null;
  reporterEmail: string;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
  comment?: {
    documentId: string;
    firstname: string;
    content: string;
    blocked: boolean;
    approved: boolean;
  } | null;
}

export interface ReportFilters {
  status?: ReportStatus;
  commentDocumentId?: string;
  page: number;
  pageSize: number;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

interface UseReportsReturn {
  reports: Report[];
  pagination: PaginationMeta | null;
  filters: ReportFilters;
  isLoading: boolean;
  error: string | null;
  setFilters: (filters: Partial<ReportFilters>) => void;
  markReviewed: (documentId: string) => Promise<void>;
  dismiss: (documentId: string) => Promise<void>;
  refetch: () => void;
}

const DEFAULT_FILTERS: ReportFilters = {
  page: 1,
  pageSize: 25,
};

export function useReports(): UseReportsReturn {
  const { get, put } = useFetchClient();
  const [reports, setReports] = useState<Report[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [filters, setFiltersState] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Silencieux = pas de loader (pour les refetch après action) */
  const fetchReports = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      const params: Record<string, string> = {
        page: String(filters.page),
        pageSize: String(filters.pageSize),
      };

      if (filters.status) {
        params['status'] = filters.status;
      }

      if (filters.commentDocumentId) {
        params['commentDocumentId'] = filters.commentDocumentId;
      }

      const queryString = new URLSearchParams(params).toString();
      const response = await get<{
        data: Report[];
        meta: { pagination: PaginationMeta };
      }>(`/${pluginId}/admin/reports?${queryString}`);

      setReports(response?.data?.data ?? []);
      setPagination(response?.data?.meta?.pagination ?? null);
    } catch {
      setError('Impossible de charger les signalements.');
    } finally {
      setIsLoading(false);
    }
  }, [get, filters]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const setFilters = useCallback((newFilters: Partial<ReportFilters>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page ?? (Object.keys(newFilters).some((k) => k !== 'page') ? 1 : prev.page),
    }));
  }, []);

  const markReviewed = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/reports/${documentId}/review`, {});
      await fetchReports(true);
    },
    [put, fetchReports]
  );

  const dismiss = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/reports/${documentId}/dismiss`, {});
      await fetchReports(true);
    },
    [put, fetchReports]
  );

  return {
    reports,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    markReviewed,
    dismiss,
    refetch: fetchReports,
  };
}
