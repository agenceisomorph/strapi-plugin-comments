/**
 * Hook useComments — fetch et mutations sur les commentaires admin.
 *
 * Expose :
 *   - comments     : liste paginée
 *   - pagination   : métadonnées de pagination
 *   - filters      : état des filtres actifs
 *   - setFilters   : mise à jour des filtres (déclenche un refetch)
 *   - approve      : approuver un commentaire
 *   - block        : bloquer un commentaire
 *   - deleteComment: supprimer un commentaire
 *   - adminReply   : réponse WYSIWYG admin
 *   - refetch      : recharger la liste
 */

import { useState, useEffect, useCallback } from 'react';
import { useFetchClient } from '@strapi/strapi/admin';
import pluginId from '../pluginId';

export interface Comment {
  id: number;
  documentId: string;
  firstname: string;
  email: string;
  content: string;
  contentHtml?: string | null;
  isAdminReply?: boolean;
  blocked: boolean;
  approved: boolean;
  pinned?: boolean;
  avatarColor?: string;
  relatedDocumentId: string;
  relatedCollection: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    documentId: string;
    email: string;
    firstname?: string;
    username?: string;
    blocked: boolean;
  } | null;
  parent?: { documentId: string; firstname: string; content?: string } | null;
  children?: Comment[];
}

export interface CommentFilters {
  status?: 'pending' | 'approved' | 'blocked' | 'all';
  relatedCollection?: string;
  page: number;
  pageSize: number;
  /** Champ de tri côté serveur (ex: 'createdAt', 'firstname', 'approved') */
  sortBy?: string;
  /** Ordre de tri côté serveur */
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

interface UseCommentsReturn {
  comments: Comment[];
  pagination: PaginationMeta | null;
  filters: CommentFilters;
  isLoading: boolean;
  error: string | null;
  setFilters: (filters: Partial<CommentFilters>) => void;
  approve: (documentId: string) => Promise<void>;
  block: (documentId: string) => Promise<void>;
  unblock: (documentId: string) => Promise<void>;
  deleteComment: (documentId: string) => Promise<void>;
  adminReply: (documentId: string, contentHtml: string) => Promise<void>;
  togglePin: (documentId: string) => Promise<void>;
  refetch: () => void;
}

const DEFAULT_FILTERS: CommentFilters = {
  status: 'all',
  page: 1,
  pageSize: 10,
};

export function useComments(): UseCommentsReturn {
  const { get, put, post, del } = useFetchClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [filters, setFiltersState] = useState<CommentFilters>(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    setError(null);

    try {
      // Construction des query params selon les filtres actifs
      const params: Record<string, string> = {
        page: String(filters.page),
        pageSize: String(filters.pageSize),
        // Tri dynamique : utilise la valeur du filtre ou le défaut 'createdAt desc'
        sortBy: filters.sortBy ?? 'createdAt',
        sortOrder: filters.sortOrder ?? 'desc',
      };

      if (filters.status && filters.status !== 'all') {
        if (filters.status === 'pending') {
          params['approved'] = 'false';
          params['blocked'] = 'false';
        } else if (filters.status === 'approved') {
          params['approved'] = 'true';
          params['blocked'] = 'false';
        } else if (filters.status === 'blocked') {
          params['blocked'] = 'true';
        }
      }

      if (filters.relatedCollection) {
        params['relatedCollection'] = filters.relatedCollection;
      }

      const queryString = new URLSearchParams(params).toString();
      const response = await get<{
        data: Comment[];
        meta: { pagination: PaginationMeta };
      }>(`/${pluginId}/admin/comments?${queryString}`);

      setComments(response?.data?.data ?? []);
      setPagination(response?.data?.meta?.pagination ?? null);
    } catch {
      setError('Impossible de charger les commentaires.');
    } finally {
      setIsLoading(false);
    }
  }, [get, filters]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const setFilters = useCallback((newFilters: Partial<CommentFilters>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...newFilters,
      // Retour à la page 1 si les filtres changent (sauf changement de page)
      page: newFilters.page ?? (Object.keys(newFilters).some((k) => k !== 'page') ? 1 : prev.page),
    }));
  }, []);

  const approve = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/comments/${documentId}/approve`, {});
      await fetchComments(true);
    },
    [put, fetchComments]
  );

  const block = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/comments/${documentId}/block`, {});
      await fetchComments(true);
    },
    [put, fetchComments]
  );

  const unblock = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/comments/${documentId}/unblock`, {});
      await fetchComments(true);
    },
    [put, fetchComments]
  );

  const deleteComment = useCallback(
    async (documentId: string) => {
      await del(`/${pluginId}/admin/comments/${documentId}`);
      await fetchComments(true);
    },
    [del, fetchComments]
  );

  const adminReply = useCallback(
    async (documentId: string, contentHtml: string) => {
      await post(`/${pluginId}/admin/comments/${documentId}/reply`, { contentHtml });
      await fetchComments(true);
    },
    [post, fetchComments]
  );

  /** Épingle ou désépingle un commentaire */
  const togglePin = useCallback(
    async (documentId: string) => {
      await put(`/${pluginId}/admin/comments/${documentId}/pin`, {});
      await fetchComments(true);
    },
    [put, fetchComments]
  );

  return {
    comments,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    approve,
    block,
    unblock,
    deleteComment,
    adminReply,
    togglePin,
    refetch: fetchComments,
  };
}
