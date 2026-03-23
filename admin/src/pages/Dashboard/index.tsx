/**
 * Page Dashboard — page principale du plugin Comments.
 *
 * UX alignée sur le Content Manager Strapi :
 *   - KPIs compacts en barre supérieure
 *   - Recherche rapide (filtre côté client avec debounce 300ms)
 *   - Tabs pour filtrer par statut
 *   - Table native Strapi avec colonnes triables (Auteur, Statut, Date)
 *   - Pagination native Strapi
 *   - Lien vers le profil utilisateur si l'auteur a un documentId
 *
 * RGAA 4.1 :
 *   - Critère 5.7 : aria-sort sur les colonnes triables
 *   - Critère 10.7 : focus visible sur tous les éléments interactifs
 *   - Critère 6.1 : liens avec intitulé explicite (texte + aria-label)
 */

import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Box,
  Flex,
  Typography,
  Button,
  Loader,
  Dialog,
  Textarea,
  Badge,
  IconButton,
  Tabs,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Searchbar,
  Pagination,
  PreviousLink,
  PageLink,
  NextLink,
  Checkbox,
  SingleSelect,
  SingleSelectOption,
} from '@strapi/design-system';
import { Trash, Check, Cross, ArrowRight, ArrowsCounterClockwise, Cog, CaretDown, CaretUp, Eye, EyeStriked, Pin } from '@strapi/icons';
import { Link } from 'react-router-dom';
import { useStats } from '../../hooks/useStats';
import { useComments, type Comment } from '../../hooks/useComments';
import { useReports, type Report } from '../../hooks/useReports';
import { useLicense, type LicenseInfo } from '../../hooks/useLicense';
import pluginId from '../../pluginId';

/* ─── Bandeau licence ────────────────────────────────────────────────────────
 * Affiche le tier actuel et la progression de la limite Community.
 * Community : barre de progression + lien vers la page d'achat.
 * Pro : badge discret confirmatif.
 *
 * RGAA 4.1 — critère 10.1 : l'information n'est pas portée uniquement par la couleur.
 * Le texte décrit explicitement le statut. role="status" pour les lecteurs d'écran.
 */

const LicenseBanner: React.FC<{ license: LicenseInfo }> = ({ license }) => {
  const { tier, commentCount, commentLimit, upgradeUrl, maskedKey } = license;

  if (tier === 'pro') {
    return (
      <Box
        role="status"
        aria-label="Licence Pro active"
        padding={3}
        hasRadius
        style={{
          background: 'var(--colors-primary100)',
          border: '1px solid var(--colors-primary200)',
          marginBottom: '16px',
        }}
      >
        <Flex gap={2} alignItems="center">
          <Typography variant="pi" textColor="primary700" fontWeight="semiBold">
            Pro Edition
          </Typography>
          <Typography variant="pi" textColor="primary600">
            — Licence active
            {maskedKey && (
              <span style={{ marginLeft: '8px', opacity: 0.7 }}>({maskedKey})</span>
            )}
          </Typography>
        </Flex>
      </Box>
    );
  }

  // Calcul de la progression Community
  const limit = commentLimit ?? 500;
  const progressPct = Math.min(100, Math.round((commentCount / limit) * 100));
  const isNearLimit = progressPct >= 80;
  const isAtLimit = commentCount >= limit;

  return (
    <Box
      role="status"
      aria-label={`Community Edition — ${commentCount} sur ${limit} commentaires utilisés`}
      padding={3}
      hasRadius
      style={{
        background: isAtLimit
          ? 'var(--colors-danger100)'
          : isNearLimit
            ? 'var(--colors-warning100)'
            : 'var(--colors-neutral100)',
        border: `1px solid ${
          isAtLimit
            ? 'var(--colors-danger200)'
            : isNearLimit
              ? 'var(--colors-warning200)'
              : 'var(--colors-neutral200)'
        }`,
        marginBottom: '16px',
      }}
    >
      <Flex gap={4} alignItems="center" style={{ flexWrap: 'wrap' }}>
        <Flex gap={2} alignItems="center" style={{ flex: 1, minWidth: '200px' }}>
          <Typography
            variant="pi"
            fontWeight="semiBold"
            textColor={isAtLimit ? 'danger700' : isNearLimit ? 'warning700' : 'neutral700'}
          >
            Community Edition
          </Typography>
          <Typography
            variant="pi"
            textColor={isAtLimit ? 'danger600' : isNearLimit ? 'warning600' : 'neutral600'}
          >
            — {commentCount}/{limit} commentaires utilisés
          </Typography>
        </Flex>

        {/* Barre de progression — RGAA : aria-valuenow/min/max communiquent l'état */}
        <Box
          role="progressbar"
          aria-valuenow={commentCount}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-label={`${progressPct}% de la limite Community atteinte`}
          style={{ flex: 1, minWidth: '120px', height: '6px', background: 'var(--colors-neutral200)', borderRadius: '3px' }}
        >
          <Box
            style={{
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: '3px',
              background: isAtLimit
                ? 'var(--colors-danger600)'
                : isNearLimit
                  ? 'var(--colors-warning600)'
                  : 'var(--colors-primary600)',
              transition: 'width 0.3s ease',
            }}
          />
        </Box>

        {upgradeUrl && (
          <a
            href={upgradeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', flexShrink: 0 }}
            aria-label="Passer à la licence Pro pour débloquer toutes les fonctionnalités (ouvre un nouvel onglet)"
          >
            <Typography
              variant="pi"
              fontWeight="semiBold"
              textColor="primary600"
              style={{ textDecoration: 'underline' }}
            >
              Passer a Pro
            </Typography>
          </a>
        )}
      </Flex>
    </Box>
  );
};

/* ─── KPI compact ───────────────────────────────────────────────────────────── */

const KpiBar: React.FC<{
  total: number;
  pending: number;
  approved: number;
  blocked: number;
  reports: number;
}> = ({ total, pending, approved, blocked, reports }) => (
  <Flex gap={5} padding={4} background="neutral0" hasRadius style={{ border: '1px solid var(--colors-neutral200)' }}>
    <Flex gap={2} alignItems="baseline">
      <Typography variant="alpha" textColor="neutral800">{total}</Typography>
      <Typography variant="pi" textColor="neutral600">commentaires</Typography>
    </Flex>
    <Box style={{ width: '1px', height: '32px', background: 'var(--colors-neutral200)' }} />
    <Flex gap={2} alignItems="baseline">
      <Typography variant="delta" textColor={pending > 0 ? 'warning600' : 'neutral400'}>{pending}</Typography>
      <Typography variant="pi" textColor="neutral600">en attente</Typography>
    </Flex>
    <Flex gap={2} alignItems="baseline">
      <Typography variant="delta" textColor="success600">{approved}</Typography>
      <Typography variant="pi" textColor="neutral600">approuvés</Typography>
    </Flex>
    <Flex gap={2} alignItems="baseline">
      <Typography variant="delta" textColor={blocked > 0 ? 'danger600' : 'neutral400'}>{blocked}</Typography>
      <Typography variant="pi" textColor="neutral600">bloqués</Typography>
    </Flex>
    {reports > 0 && (
      <>
        <Box style={{ width: '1px', height: '32px', background: 'var(--colors-neutral200)' }} />
        <Flex gap={2} alignItems="baseline">
          <Typography variant="delta" textColor="danger600">{reports}</Typography>
          <Typography variant="pi" textColor="danger600">signalements</Typography>
        </Flex>
      </>
    )}
  </Flex>
);

/* ─── Badge statut ──────────────────────────────────────────────────────────── */

const StatusBadge: React.FC<{ approved: boolean; blocked: boolean; isAdminReply?: boolean }> = ({
  approved,
  blocked,
  isAdminReply,
}) => {
  if (isAdminReply) return <Badge backgroundColor="primary100" textColor="primary700">Admin</Badge>;
  if (blocked) return <Badge backgroundColor="danger100" textColor="danger700">Bloqué</Badge>;
  if (approved) return <Badge backgroundColor="success100" textColor="success700">Approuvé</Badge>;
  return <Badge backgroundColor="warning100" textColor="warning700">En attente</Badge>;
};

/* ─── Avatar ────────────────────────────────────────────────────────────────── */

/** Palette pastel déterministe — la couleur est calculée à partir du prénom, pas stockée en base */
const AVATAR_PALETTE = [
  '#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7',
  '#C7CEEA', '#F0E6EF', '#D4A5A5', '#A8D8EA', '#AA96DA',
  '#FCBAD3', '#FFE5B4',
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <Box
    style={{
      width: '28px',
      height: '28px',
      borderRadius: '50%',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      backgroundColor: getAvatarColor(name || '?'),
    }}
  >
    <Typography variant="pi" fontWeight="bold" textColor="neutral0" style={{ fontSize: '11px' }}>
      {(name || '?')[0].toUpperCase()}
    </Typography>
  </Box>
);

/* ─── Formatage date ────────────────────────────────────────────────────────── */

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/* ─── Troncature texte ──────────────────────────────────────────────────────── */

const truncate = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) + '…' : text;

/* ─── Icône de tri ──────────────────────────────────────────────────────────── */

/**
 * Affiche l'indicateur visuel de tri pour une colonne.
 * RGAA 4.1 — critère 5.7 : l'état de tri est aussi communiqué via aria-sort sur Th.
 */
const SortIcon: React.FC<{
  column: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}> = ({ column, sortBy, sortOrder }) => {
  if (sortBy !== column) {
    return <CaretDown width={12} height={12} aria-hidden style={{ opacity: 0.3 }} />;
  }
  return sortOrder === 'asc'
    ? <CaretUp width={12} height={12} aria-hidden style={{ color: 'var(--colors-primary600)' }} />
    : <CaretDown width={12} height={12} aria-hidden style={{ color: 'var(--colors-primary600)' }} />;
};

/* ─── Types ─────────────────────────────────────────────────────────────────── */

type TabValue = 'all' | 'pending' | 'approved' | 'blocked' | 'reports';

/* ─── Labels motifs signalement ─────────────────────────────────────────────── */

const REASON_LABELS: Record<string, string> = {
  offensive: 'Contenu offensant',
  spam: 'Spam',
  harassment: 'Harcèlement',
  misinformation: 'Info trompeuse',
  other: 'Autre',
};

const STATUS_LABELS: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'En attente', bg: 'warning100', color: 'warning700' },
  reviewed: { label: 'Examiné', bg: 'success100', color: 'success700' },
  dismissed: { label: 'Rejeté', bg: 'neutral200', color: 'neutral700' },
};

/* ─── Page principale ───────────────────────────────────────────────────────── */

const Dashboard: React.FC = () => {
  const { stats, isLoading: statsLoading } = useStats();
  const { license } = useLicense();
  const {
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
    refetch,
  } = useComments();

  const {
    reports,
    isLoading: reportsLoading,
    error: reportsError,
    markReviewed,
    dismiss,
    refetch: refetchReports,
  } = useReports();

  /* ── État local ─────────────────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [replyTarget, setReplyTarget] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  /**
   * Ensemble des documentId sélectionnés pour les actions groupées.
   * Utilise un Set pour des opérations O(1) en ajout/suppression/vérification.
   */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Dernier index cliqué pour la sélection shift+clic */
  const [lastCheckedIndex, setLastCheckedIndex] = useState<number | null>(null);
  /** documentId du commentaire dont le texte est déplié */
  const [expandedComment, setExpandedComment] = useState<string | null>(null);

  /** Texte brut saisi dans le champ de recherche */
  const [searchRaw, setSearchRaw] = useState('');
  /** Valeur debounced (300ms) utilisée pour le filtrage côté client */
  const [searchValue, setSearchValue] = useState('');

  /** Colonne de tri active (envoyée au serveur via setFilters) */
  const [sortBy, setSortBy] = useState<string>('createdAt');
  /** Ordre de tri actif */
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  /* ── Debounce recherche ─────────────────────────────────────────────────── */
  /** Référence du timer de debounce — évite d'installer une dépendance externe */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((value: string) => {
    setSearchRaw(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchValue(value);
    }, 300);
  }, []);

  const handleSearchClear = useCallback(() => {
    setSearchRaw('');
    setSearchValue('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  /* ── Filtre côté client (sur la page en cours) ──────────────────────────── */
  const filteredComments = useMemo(() => {
    if (!searchValue.trim()) return comments;
    const needle = searchValue.trim().toLowerCase();
    return comments.filter((c) =>
      [c.firstname, c.email, c.content, c.relatedCollection]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle))
    );
  }, [comments, searchValue]);

  /* ── Tri par colonne ────────────────────────────────────────────────────── */
  /**
   * Au clic sur une colonne triable :
   *   - Si la colonne est déjà sélectionnée, on inverse l'ordre.
   *   - Sinon, on change la colonne et on repart en 'asc'.
   * On passe le nouveau tri au hook pour déclencher un refetch serveur.
   */
  const handleSort = useCallback(
    (column: string) => {
      const newOrder: 'asc' | 'desc' =
        sortBy === column && sortOrder === 'asc' ? 'desc' : 'asc';
      setSortBy(column);
      setSortOrder(newOrder);
      setFilters({ sortBy: column, sortOrder: newOrder, page: 1 });
    },
    [sortBy, sortOrder, setFilters]
  );

  /* ── Handlers actions groupées ─────────────────────────────────────────── */

  /** Coche ou décoche tous les commentaires visibles sur la page en cours */
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filteredComments.length && filteredComments.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredComments.map((c) => c.documentId)));
    }
  }, [selectedIds.size, filteredComments]);

  /**
   * Bascule la sélection d'un commentaire individuel.
   * Supporte le shift+clic pour sélectionner une plage de lignes.
   */
  const handleToggleSelect = useCallback(
    (documentId: string, index: number, event: React.MouseEvent) => {
      if (event.shiftKey && lastCheckedIndex !== null) {
        /* Sélection par plage : toutes les lignes entre lastCheckedIndex et index */
        const start = Math.min(lastCheckedIndex, index);
        const end = Math.max(lastCheckedIndex, index);
        const newSelected = new Set(selectedIds);
        for (let i = start; i <= end; i++) {
          const comment = filteredComments[i];
          if (comment) newSelected.add(comment.documentId);
        }
        setSelectedIds(newSelected);
      } else {
        /* Toggle simple */
        const newSelected = new Set(selectedIds);
        if (newSelected.has(documentId)) {
          newSelected.delete(documentId);
        } else {
          newSelected.add(documentId);
        }
        setSelectedIds(newSelected);
      }
      setLastCheckedIndex(index);
    },
    [lastCheckedIndex, selectedIds, filteredComments]
  );

  /**
   * Approuve tous les commentaires sélectionnés.
   * Les appels sont séquentiels pour respecter le rate limiting éventuel de l'API.
   */
  const handleBulkApprove = useCallback(async () => {
    for (const id of selectedIds) {
      await approve(id);
    }
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, approve, refetch]);

  /** Bloque tous les commentaires sélectionnés */
  const handleBulkBlock = useCallback(async () => {
    for (const id of selectedIds) {
      await block(id);
    }
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, block, refetch]);

  /** Supprime tous les commentaires sélectionnés */
  const handleBulkDelete = useCallback(async () => {
    for (const id of selectedIds) {
      await deleteComment(id);
    }
    setSelectedIds(new Set());
    refetch();
  }, [selectedIds, deleteComment, refetch]);

  /* ── Handlers ───────────────────────────────────────────────────────────── */
  const handleTabChange = (value: string) => {
    const tab = value as TabValue;
    setActiveTab(tab);
    setFilters({ status: tab, page: 1 });
    /* Réinitialiser la sélection au changement de tab — RGAA 4.1 critique 7.1 :
       l'état des composants interactifs doit rester cohérent avec le contenu affiché. */
    setSelectedIds(new Set());
  };

  /** Bloquer un commentaire depuis le tab signalements — rafraîchit les deux listes */
  const handleBlockFromReport = async (commentDocumentId: string) => {
    await block(commentDocumentId);
    refetchReports();
  };

  const handleDelete = async () => {
    if (deleteTarget) {
      await deleteComment(deleteTarget);
      setDeleteTarget(null);
    }
  };

  const handleReply = async () => {
    if (replyTarget && replyContent.trim()) {
      await adminReply(replyTarget, replyContent);
      setReplyTarget(null);
      setReplyContent('');
    }
  };

  /* ── Pagination ─────────────────────────────────────────────────────────── */
  /** Changement de page via le composant Pagination natif Strapi */
  const handlePageChange = useCallback(
    (page: number) => {
      setFilters({ page });
    },
    [setFilters]
  );

  /* ── Stats normalisées ──────────────────────────────────────────────────── */
  const s = stats ?? {
    totalComments: 0,
    pendingApproval: 0,
    approvedComments: 0,
    blockedComments: 0,
    reports: { total: 0, pending: 0 },
  };

  const tabLabel = (label: string, count: number) =>
    count > 0 ? `${label} (${count})` : label;

  /* ── Rendu de la table (partagé entre tous les tabs) ────────────────────── */
  const renderTableContent = () => {
    if (isLoading) {
      return (
        <Flex justifyContent="center" padding={10}>
          <Loader>Chargement des commentaires...</Loader>
        </Flex>
      );
    }

    if (error) {
      return (
        <Box padding={6}>
          <Typography textColor="danger600">{error}</Typography>
          <Button variant="tertiary" onClick={refetch} style={{ marginTop: '8px' }}>
            Réessayer
          </Button>
        </Box>
      );
    }

    if (filteredComments.length === 0) {
      return (
        <Box padding={10} style={{ textAlign: 'center' }}>
          <Typography variant="delta" textColor="neutral500">
            {searchValue ? `Aucun résultat pour "${searchValue}".` : 'Aucun commentaire.'}
          </Typography>
        </Box>
      );
    }

    /* Détermine si toutes les lignes visibles sont sélectionnées */
    const allSelected =
      filteredComments.length > 0 && selectedIds.size === filteredComments.length;
    const someSelected = selectedIds.size > 0 && !allSelected;

    return (
      <>
        {/* ── Barre d'actions groupées ──────────────────────────────────────────
         * Visible uniquement quand au moins 1 commentaire est sélectionné.
         * RGAA 4.1 critère 10.7 : focus visible sur tous les boutons.
         * Éco-conception : rendu conditionnel, pas de DOM inutile.
         */}
        {selectedIds.size > 0 && (
          <Flex
            gap={3}
            alignItems="center"
            padding={3}
            background="primary100"
            style={{
              borderBottom: '1px solid var(--colors-primary200)',
              borderRadius: 'var(--border-radius) var(--border-radius) 0 0',
              flexWrap: 'wrap',
            }}
          >
            <Typography variant="pi" textColor="primary700" fontWeight="semiBold">
              {selectedIds.size} commentaire{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </Typography>
            <Flex gap={2} style={{ marginLeft: 'auto', flexWrap: 'wrap' }}>
              <Button
                variant="success-light"
                size="S"
                onClick={handleBulkApprove}
              >
                Approuver
              </Button>
              <Button
                variant="danger-light"
                size="S"
                onClick={handleBulkBlock}
              >
                Bloquer
              </Button>
              <Button
                variant="danger"
                size="S"
                onClick={handleBulkDelete}
              >
                Supprimer
              </Button>
              <Button
                variant="tertiary"
                size="S"
                onClick={() => setSelectedIds(new Set())}
              >
                Désélectionner tout
              </Button>
            </Flex>
          </Flex>
        )}

        <Table colCount={7} rowCount={filteredComments.length}>
        <Thead>
          <Tr>
            {/*
             * Colonne checkbox "Tout sélectionner".
             * RGAA 4.1 critère 11.1 : aria-label explicite sur le Checkbox.
             * indeterminate indique visuellement une sélection partielle aux AT.
             */}
            <Th>
              <Checkbox
                aria-label="Tout sélectionner"
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={handleSelectAll}
              />
            </Th>
            {/*
             * Colonnes triables : Auteur, Statut, Date.
             * RGAA 4.1 critère 5.7 : aria-sort communique l'état de tri aux AT.
             * Le onClick déclenche handleSort qui passe le nouveau tri au serveur.
             */}
            <Th
              action={
                <IconButton
                  label={`Trier par auteur ${sortBy === 'firstname' && sortOrder === 'asc' ? '(descendant)' : '(ascendant)'}`}
                  variant="ghost"
                  onClick={() => handleSort('firstname')}
                  style={{ padding: '0 4px' }}
                >
                  <SortIcon column="firstname" sortBy={sortBy} sortOrder={sortOrder} />
                </IconButton>
              }
              aria-sort={
                sortBy === 'firstname'
                  ? sortOrder === 'asc' ? 'ascending' : 'descending'
                  : 'none'
              }
            >
              <Typography variant="sigma">Auteur</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Commentaire</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Article</Typography>
            </Th>
            <Th
              action={
                <IconButton
                  label={`Trier par statut ${sortBy === 'approved' && sortOrder === 'asc' ? '(descendant)' : '(ascendant)'}`}
                  variant="ghost"
                  onClick={() => handleSort('approved')}
                  style={{ padding: '0 4px' }}
                >
                  <SortIcon column="approved" sortBy={sortBy} sortOrder={sortOrder} />
                </IconButton>
              }
              aria-sort={
                sortBy === 'approved'
                  ? sortOrder === 'asc' ? 'ascending' : 'descending'
                  : 'none'
              }
            >
              <Typography variant="sigma">Statut</Typography>
            </Th>
            <Th
              action={
                <IconButton
                  label={`Trier par date ${sortBy === 'createdAt' && sortOrder === 'asc' ? '(descendant)' : '(ascendant)'}`}
                  variant="ghost"
                  onClick={() => handleSort('createdAt')}
                  style={{ padding: '0 4px' }}
                >
                  <SortIcon column="createdAt" sortBy={sortBy} sortOrder={sortOrder} />
                </IconButton>
              }
              aria-sort={
                sortBy === 'createdAt'
                  ? sortOrder === 'asc' ? 'ascending' : 'descending'
                  : 'none'
              }
            >
              <Typography variant="sigma">Date</Typography>
            </Th>
            <Th>
              <Typography variant="sigma">Actions</Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {filteredComments.map((c: Comment, rowIndex: number) => (
            <React.Fragment key={c.documentId}>
              <Tr>
                {/* ── Colonne Checkbox individuelle ─────────────────────────── */}
                {/*
                 * RGAA 4.1 critère 11.1 : aria-label identifie sans ambiguïté
                 * le commentaire ciblé par la case à cocher.
                 * Shift+clic : sélection par plage via handleToggleSelect.
                 */}
                <Td>
                  <Box
                    onClick={(e: React.MouseEvent) => handleToggleSelect(c.documentId, rowIndex, e)}
                    style={{ display: 'inline-flex' }}
                  >
                    <Checkbox
                      aria-label={`Sélectionner le commentaire de ${c.firstname || c.email || 'Anonyme'}`}
                      checked={selectedIds.has(c.documentId)}
                      onCheckedChange={() => {/* Géré par le onClick parent pour capturer shiftKey */}}
                    />
                  </Box>
                </Td>

                {/* ── Colonne Auteur ────────────────────────────────────────── */}
                <Td>
                  <Flex gap={2} alignItems="center">
                    <Avatar name={c.firstname || c.email} />
                    <Box>
                      {c.author?.documentId ? (
                        <Link
                          to={`/content-manager/collection-types/plugin::users-permissions.user/${c.author.documentId}`}
                          aria-label={`Voir le profil de ${c.firstname || 'cet utilisateur'}`}
                          style={{ textDecoration: 'none' }}
                        >
                          <Typography
                            variant="omega"
                            fontWeight="semiBold"
                            textColor="primary600"
                            style={{ textDecoration: 'underline' }}
                          >
                            {c.firstname || 'Anonyme'}
                          </Typography>
                        </Link>
                      ) : (
                        <Typography variant="omega" fontWeight="semiBold">
                          {c.firstname || 'Anonyme'}
                        </Typography>
                      )}
                      <Typography variant="pi" textColor="neutral500" tag="p">
                        {c.email}
                      </Typography>
                    </Box>
                  </Flex>
                </Td>

                {/* ── Colonne Commentaire ───────────────────────────────────── */}
                <Td style={{ maxWidth: '400px' }}>
                  {/* Message parent affiché en contexte si c'est une réponse */}
                  {c.parent && (
                    <Box
                      marginBottom={2}
                      padding={2}
                      hasRadius
                      background="neutral100"
                      style={{ borderLeft: '2px solid var(--colors-neutral300)' }}
                    >
                      <Typography variant="pi" textColor="neutral500" fontWeight="semiBold">
                        {c.parent.firstname || 'Anonyme'} :
                      </Typography>
                      <Typography variant="pi" textColor="neutral500" style={{ whiteSpace: 'pre-wrap' }}>
                        {truncate(c.parent.content || '', 100)}
                      </Typography>
                    </Box>
                  )}
                  <Box
                    as="button"
                    onClick={() => setExpandedComment(expandedComment === c.documentId ? null : c.documentId)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                    aria-expanded={expandedComment === c.documentId}
                    aria-label={expandedComment === c.documentId ? 'Réduire le commentaire' : 'Voir le commentaire en entier'}
                  >
                    {c.parent && (
                      <Flex gap={1} marginBottom={1} alignItems="center">
                        <ArrowRight width={10} height={10} aria-hidden />
                        <Typography variant="pi" textColor="neutral500" fontWeight="semiBold">
                          Réponse de {c.firstname || 'Anonyme'}
                        </Typography>
                      </Flex>
                    )}
                    <Typography variant="omega" textColor="neutral800" style={{ whiteSpace: 'pre-wrap' }}>
                      {expandedComment === c.documentId ? c.content : truncate(c.content, 120)}
                    </Typography>
                    {c.content.length > 120 && (
                      <Typography variant="pi" textColor="primary600" style={{ marginTop: '8px', display: 'block' }}>
                        {expandedComment === c.documentId ? 'Réduire' : 'Lire la suite'}
                      </Typography>
                    )}
                  </Box>
                </Td>

                {/* ── Colonne Article lié ───────────────────────────────────── */}
                <Td>
                  <Typography variant="pi" textColor="neutral600">
                    {c.relatedCollection
                      .replace('api::', '')
                      .replace(/\.\w+/, '')
                    }
                  </Typography>
                </Td>

                {/* ── Colonne Statut ────────────────────────────────────────── */}
                <Td>
                  <StatusBadge
                    approved={c.approved}
                    blocked={c.blocked}
                    isAdminReply={c.isAdminReply}
                  />
                </Td>

                {/* ── Colonne Date ──────────────────────────────────────────── */}
                <Td>
                  <Typography variant="pi" textColor="neutral500" tag="time" dateTime={c.createdAt}>
                    {formatDate(c.createdAt)}
                  </Typography>
                </Td>

                {/* ── Colonne Actions ───────────────────────────────────────── */}
                <Td>
                  <Flex gap={1}>
                    {!c.approved && !c.blocked && (
                      <IconButton
                        label="Approuver"
                        onClick={() => approve(c.documentId)}
                        variant="ghost"
                      >
                        <Check aria-hidden />
                      </IconButton>
                    )}
                    {!c.blocked && (
                      <IconButton
                        label="Bloquer"
                        onClick={() => block(c.documentId)}
                        variant="ghost"
                      >
                        <Cross aria-hidden />
                      </IconButton>
                    )}
                    {c.blocked && (
                      <IconButton
                        label="Débloquer"
                        onClick={() => unblock(c.documentId)}
                        variant="ghost"
                      >
                        <ArrowsCounterClockwise aria-hidden />
                      </IconButton>
                    )}
                    {!c.parent && !c.isAdminReply && (
                      <Button
                        variant="ghost"
                        size="S"
                        onClick={() => {
                          setReplyTarget(replyTarget === c.documentId ? null : c.documentId);
                          setReplyContent('');
                        }}
                      >
                        {replyTarget === c.documentId ? 'Annuler' : 'Répondre'}
                      </Button>
                    )}
                    {/* Bouton épingler/désépingler */}
                    <IconButton
                      label={c.pinned ? 'Désépingler' : 'Épingler'}
                      onClick={() => togglePin(c.documentId)}
                      variant="ghost"
                      style={c.pinned ? { color: '#eab308', fill: '#eab308' } : undefined}
                    >
                      <Pin aria-hidden style={c.pinned ? { fill: '#eab308' } : undefined} />
                    </IconButton>
                    <IconButton
                      label="Supprimer"
                      onClick={() => setDeleteTarget(c.documentId)}
                      variant="ghost"
                    >
                      <Trash aria-hidden />
                    </IconButton>
                  </Flex>
                </Td>
              </Tr>

              {/* ── Inline reply — s'affiche sous le commentaire ────────────── */}
              {replyTarget === c.documentId && (
                <Tr>
                  {/* colSpan=7 : inclut la colonne checkbox ajoutée */}
                  <Td colSpan={7}>
                    <Box
                      background="neutral100"
                      padding={4}
                      hasRadius
                      style={{ borderLeft: '3px solid var(--colors-primary600)' }}
                    >
                      <Flex gap={3} alignItems="flex-start">
                        <Avatar name="Admin" />
                        <Box style={{ flex: 1 }}>
                          <Typography variant="pi" textColor="neutral600" marginBottom={2} tag="p">
                            Répondre en tant qu'administrateur à {c.firstname || 'ce commentaire'}
                          </Typography>
                          <Textarea
                            aria-label="Votre réponse"
                            placeholder="Saisissez votre réponse..."
                            value={replyContent}
                            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyContent(e.target.value)}
                            style={{ minHeight: '80px' }}
                          />
                          <Flex gap={2} marginTop={2} justifyContent="flex-end">
                            <Button
                              variant="tertiary"
                              size="S"
                              onClick={() => { setReplyTarget(null); setReplyContent(''); }}
                            >
                              Annuler
                            </Button>
                            <Button
                              size="S"
                              onClick={handleReply}
                              disabled={!replyContent.trim()}
                            >
                              Envoyer
                            </Button>
                          </Flex>
                        </Box>
                      </Flex>
                    </Box>
                  </Td>
                </Tr>
              )}
            </React.Fragment>
          ))}
        </Tbody>
      </Table>
      </>
    );
  };

  /* ── Options de taille de page ──────────────────────────────────────────── */
  const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

  /** Changement du nombre de résultats par page */
  const handlePageSizeChange = useCallback(
    (value: string | number) => {
      const newSize = Number(value);
      setFilters({ pageSize: newSize, page: 1 });
    },
    [setFilters]
  );

  /* ── Rendu pagination native Strapi ─────────────────────────────────────── */
  const renderPagination = () => {
    if (!pagination) return null;

    /* Calcul des bornes d'affichage */
    const startItem = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
    const endItem = Math.min(pagination.page * pagination.pageSize, pagination.total);

    return (
      <Flex
        justifyContent="space-between"
        alignItems="center"
        padding={4}
        style={{ borderTop: '1px solid var(--colors-neutral200)', flexWrap: 'wrap', gap: '12px' }}
      >
        {/* Indicateur textuel — RGAA 4.1 critère 10.7 : information visible */}
        <Typography variant="pi" textColor="neutral600">
          Affichage de {startItem} à {endItem} sur {pagination.total} résultat{pagination.total > 1 ? 's' : ''}
        </Typography>

        {/* Navigation de pages — affiché uniquement si plus d'une page */}
        {pagination.pageCount > 1 && (
          <Pagination
            activePage={filters.page}
            pageCount={pagination.pageCount}
            label={`Pagination des commentaires, page ${filters.page} sur ${pagination.pageCount}`}
          >
            <PreviousLink onClick={() => handlePageChange(Math.max(1, filters.page - 1))}>
              Précédent
            </PreviousLink>
            {Array.from({ length: pagination.pageCount }, (_, i) => i + 1).map((page) => (
              <PageLink key={page} number={page} onClick={() => handlePageChange(page)}>
                {page}
              </PageLink>
            ))}
            <NextLink onClick={() => handlePageChange(Math.min(pagination.pageCount, filters.page + 1))}>
              Suivant
            </NextLink>
          </Pagination>
        )}

        {/* Sélecteur de taille de page — RGAA 4.1 critère 11.1 : label explicite */}
        <Flex gap={2} alignItems="center">
          <Typography variant="pi" textColor="neutral600" tag="label" htmlFor="pageSizeSelect">
            Résultats par page
          </Typography>
          <SingleSelect
            id="pageSizeSelect"
            aria-label="Résultats par page"
            value={String(filters.pageSize)}
            onChange={handlePageSizeChange}
            size="S"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <SingleSelectOption key={size} value={String(size)}>
                {size}
              </SingleSelectOption>
            ))}
          </SingleSelect>
        </Flex>
      </Flex>
    );
  };

  /* ── Rendu principal ────────────────────────────────────────────────────── */
  return (
    <Box padding={8} background="neutral100">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={4}>
        <Typography variant="alpha" tag="h1">Commentaires</Typography>
        <Flex gap={2}>
          <Link to={`/plugins/${pluginId}/settings`}>
            <IconButton label="Paramètres du plugin" variant="ghost">
              <Cog aria-hidden />
            </IconButton>
          </Link>
          <Button variant="tertiary" onClick={refetch}>Actualiser</Button>
        </Flex>
      </Flex>

      {/* ── Bandeau licence ─────────────────────────────────────────────────── */}
      {license && <LicenseBanner license={license} />}

      {/* ── KPIs ────────────────────────────────────────────────────────────── */}
      <Box marginBottom={4}>
        {statsLoading ? (
          <Loader small>Chargement des statistiques...</Loader>
        ) : (
          <KpiBar
            total={s.totalComments}
            pending={s.pendingApproval}
            approved={s.approvedComments}
            blocked={s.blockedComments}
            reports={s.reports.pending}
          />
        )}
      </Box>

      {/* ── Barre de recherche ──────────────────────────────────────────────── */}
      {/*
       * Recherche rapide côté client sur la page courante.
       * Filtre sur prénom, email, contenu et collection liée.
       * Debounce natif 300ms — sans dépendance externe (éco-conception).
       * RGAA 4.1 critère 11.1 : label associé via le prop name de Searchbar.
       */}
      <Box marginBottom={4}>
        <Searchbar
          name="searchComments"
          placeholder="Rechercher par auteur, email, contenu..."
          value={searchRaw}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleSearchChange(e.target.value)}
          onClear={handleSearchClear}
        >
          Rechercher dans les commentaires
        </Searchbar>
      </Box>

      {/* ── Tabs + Table ────────────────────────────────────────────────────── */}
      <Box background="neutral0" hasRadius style={{ border: '1px solid var(--colors-neutral200)' }}>
        <Tabs.Root value={activeTab} onValueChange={handleTabChange}>
          <Tabs.List aria-label="Filtrer les commentaires par statut">
            <Tabs.Trigger value="all">
              {tabLabel('Tous', s.totalComments)}
            </Tabs.Trigger>
            <Tabs.Trigger value="pending">
              {tabLabel('En attente', s.pendingApproval)}
            </Tabs.Trigger>
            <Tabs.Trigger value="approved">
              {tabLabel('Approuvés', s.approvedComments)}
            </Tabs.Trigger>
            <Tabs.Trigger value="blocked">
              {tabLabel('Bloqués', s.blockedComments)}
            </Tabs.Trigger>
            <Tabs.Trigger value="reports">
              {s.reports.pending > 0
                ? `Signalements (${s.reports.pending})`
                : `Signalements (${s.reports.total})`}
            </Tabs.Trigger>
          </Tabs.List>

          {/* Tabs commentaires */}
          {(['all', 'pending', 'approved', 'blocked'] as const).map((tab) => (
            <Tabs.Content key={tab} value={tab}>
              {renderTableContent()}
              {renderPagination()}
            </Tabs.Content>
          ))}

          {/* Tab signalements */}
          <Tabs.Content value="reports">
            {reportsLoading ? (
              <Flex justifyContent="center" padding={10}>
                <Loader>Chargement des signalements...</Loader>
              </Flex>
            ) : reportsError ? (
              <Box padding={6}>
                <Typography textColor="danger600">{reportsError}</Typography>
                <Button variant="tertiary" onClick={refetchReports} style={{ marginTop: '8px' }}>
                  Réessayer
                </Button>
              </Box>
            ) : reports.length === 0 ? (
              <Box padding={10} style={{ textAlign: 'center' }}>
                <Typography variant="delta" textColor="neutral500">
                  Aucun signalement.
                </Typography>
              </Box>
            ) : (
              <Table colCount={6} rowCount={reports.length}>
                <Thead>
                  <Tr>
                    <Th><Typography variant="sigma">Auteur</Typography></Th>
                    <Th><Typography variant="sigma">Commentaire signalé</Typography></Th>
                    <Th><Typography variant="sigma">Motif</Typography></Th>
                    <Th><Typography variant="sigma">Signalé par</Typography></Th>
                    <Th><Typography variant="sigma">Statut</Typography></Th>
                    <Th><Typography variant="sigma">Actions</Typography></Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {reports.map((r: Report) => {
                    const statusInfo = STATUS_LABELS[r.status] ?? STATUS_LABELS.pending;
                    return (
                      <Tr key={r.documentId}>
                        {/* Auteur — même style que tab commentaires */}
                        <Td>
                          {r.comment ? (
                            <Flex gap={2} alignItems="center">
                              <Avatar name={r.comment.firstname || '?'} />
                              <Box>
                                <Typography variant="omega" fontWeight="semiBold">
                                  {r.comment.firstname}
                                </Typography>
                              </Box>
                            </Flex>
                          ) : (
                            <Typography variant="pi" textColor="neutral400">Supprimé</Typography>
                          )}
                        </Td>
                        {/* Commentaire — même style expandable */}
                        <Td style={{ maxWidth: '400px' }}>
                          {r.comment ? (
                            <Box
                              as="button"
                              onClick={() => setExpandedComment(expandedComment === r.documentId ? null : r.documentId)}
                              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}
                              aria-expanded={expandedComment === r.documentId}
                            >
                              <Typography variant="omega" textColor="neutral800" style={{ whiteSpace: 'pre-wrap' }}>
                                {expandedComment === r.documentId ? r.comment.content : truncate(r.comment.content, 120)}
                              </Typography>
                              {r.comment.content.length > 120 && (
                                <Typography variant="pi" textColor="primary600" style={{ marginTop: '8px', display: 'block' }}>
                                  {expandedComment === r.documentId ? 'Réduire' : 'Lire la suite'}
                                </Typography>
                              )}
                            </Box>
                          ) : (
                            <Typography variant="pi" textColor="neutral400">—</Typography>
                          )}
                          {r.description && (
                            <Box marginTop={2} padding={2} hasRadius background="neutral100" style={{ borderLeft: '2px solid var(--colors-danger300)' }}>
                              <Typography variant="pi" textColor="neutral500" fontWeight="semiBold">
                                Détail du signalement :
                              </Typography>
                              <Typography variant="pi" textColor="neutral600" style={{ whiteSpace: 'pre-wrap' }}>
                                {r.description}
                              </Typography>
                            </Box>
                          )}
                        </Td>
                        {/* Motif */}
                        <Td>
                          <Badge backgroundColor="danger100" textColor="danger700">
                            {REASON_LABELS[r.reason] ?? r.reason}
                          </Badge>
                        </Td>
                        {/* Signalé par — même style que colonne Auteur/Date */}
                        <Td>
                          <Typography variant="omega" textColor="neutral600">
                            {r.reporterEmail}
                          </Typography>
                          <Typography variant="pi" textColor="neutral400" tag="time" dateTime={r.createdAt}>
                            {formatDate(r.createdAt)}
                          </Typography>
                        </Td>
                        {/* Statut */}
                        <Td>
                          <Badge backgroundColor={statusInfo.bg} textColor={statusInfo.color}>
                            {statusInfo.label}
                          </Badge>
                        </Td>
                        {/* Actions */}
                        <Td>
                          <Flex gap={1}>
                            {r.status === 'pending' && (
                              <>
                                <IconButton
                                  label="Marquer comme examiné"
                                  onClick={() => markReviewed(r.documentId)}
                                  variant="ghost"
                                >
                                  <Eye aria-hidden />
                                </IconButton>
                                <IconButton
                                  label="Rejeter le signalement"
                                  onClick={() => dismiss(r.documentId)}
                                  variant="ghost"
                                >
                                  <EyeStriked aria-hidden />
                                </IconButton>
                              </>
                            )}
                            {r.comment && !r.comment.blocked && r.status === 'pending' && (
                              <Button
                                variant="danger-light"
                                size="S"
                                onClick={() => handleBlockFromReport(r.comment!.documentId)}
                              >
                                Bloquer
                              </Button>
                            )}
                          </Flex>
                        </Td>
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
            )}
          </Tabs.Content>
        </Tabs.Root>
      </Box>

      {/* ── Dialog suppression ──────────────────────────────────────────────── */}
      {deleteTarget && (
        <Dialog.Root open onOpenChange={() => setDeleteTarget(null)}>
          <Dialog.Content>
            <Dialog.Header>Supprimer ce commentaire ?</Dialog.Header>
            <Dialog.Body>
              <Typography>
                Cette action est irréversible. Le commentaire et ses réponses seront définitivement supprimés.
              </Typography>
            </Dialog.Body>
            <Dialog.Footer>
              <Dialog.Cancel>
                <Button variant="tertiary">Annuler</Button>
              </Dialog.Cancel>
              <Dialog.Action>
                <Button variant="danger-light" onClick={handleDelete}>Supprimer</Button>
              </Dialog.Action>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Root>
      )}

      {/* Réponse admin — inline dans la table (plus de Dialog) */}
    </Box>
  );
};

export default Dashboard;
