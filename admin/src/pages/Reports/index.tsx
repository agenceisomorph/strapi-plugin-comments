/**
 * Page Reports — liste et traitement des signalements de commentaires.
 *
 * Fonctionnalités :
 *   - Tableau paginé des signalements avec filtre par statut
 *   - Actions : Marquer comme examiné, Rejeter
 *   - Affichage du commentaire signalé (tronqué)
 *   - Badge coloré selon la raison et le statut
 *
 * RGAA 4.1 :
 *   - Critère 5.4 : tableau avec en-têtes <th scope="col">
 *   - Critère 9.1 : régions identifiées (<main> fourni par le layout Strapi)
 *   - Critère 11.1 : labels associés aux filtres
 */

import React from 'react';
import { useIntl } from 'react-intl';
import {
  Box,
  Flex,
  Typography,
  Button,
  Badge,
  Loader,
  Table,
  Thead,
  Tbody,
  Tr,
  Td,
  Th,
  SingleSelect,
  SingleSelectOption,
  Pagination,
  PreviousLink,
  NextLink,
  PageLink,
} from '@strapi/design-system';
import { useReports, type Report, type ReportReason, type ReportStatus } from '../../hooks/useReports';
import pluginId from '../../pluginId';

/** Libellé lisible pour la raison du signalement */
const REASON_LABELS: Record<ReportReason, string> = {
  offensive: 'Contenu offensant',
  spam: 'Spam',
  harassment: 'Harcèlement',
  misinformation: 'Désinformation',
  other: 'Autre',
};

/** Libellé lisible pour le statut du signalement */
const STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'En attente',
  reviewed: 'Examiné',
  dismissed: 'Rejeté',
};

/** Couleur du badge selon le statut */
function getStatusColors(status: ReportStatus): {
  background: string;
  text: string;
} {
  switch (status) {
    case 'pending':
      return { background: 'warning100', text: 'warning600' };
    case 'reviewed':
      return { background: 'success100', text: 'success600' };
    case 'dismissed':
      return { background: 'neutral100', text: 'neutral600' };
  }
}

/** Couleur du badge selon la raison */
function getReasonColors(reason: ReportReason): {
  background: string;
  text: string;
} {
  switch (reason) {
    case 'offensive':
    case 'harassment':
      return { background: 'danger100', text: 'danger600' };
    case 'spam':
      return { background: 'warning100', text: 'warning600' };
    default:
      return { background: 'neutral100', text: 'neutral600' };
  }
}

/** Tronque un texte à N caractères */
function truncate(text: string, maxLength = 60): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

const Reports: React.FC = () => {
  const { formatMessage } = useIntl();
  const {
    reports,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    markReviewed,
    dismiss,
    refetch,
  } = useReports();

  // Gestion des actions inline
  const handleMarkReviewed = async (report: Report) => {
    await markReviewed(report.documentId);
  };

  const handleDismiss = async (report: Report) => {
    await dismiss(report.documentId);
  };

  if (isLoading && reports.length === 0) {
    return (
      <Flex justifyContent="center" padding={10}>
        <Loader>
          {formatMessage({
            id: `${pluginId}.reports.loading`,
            defaultMessage: 'Chargement des signalements...',
          })}
        </Loader>
      </Flex>
    );
  }

  return (
    <Box padding={8}>
      {/* En-tête */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={6}>
        <Box>
          <Typography variant="alpha" tag="h2">
            {formatMessage({
              id: `${pluginId}.reports.title`,
              defaultMessage: 'Signalements',
            })}
          </Typography>
          <Typography variant="omega" textColor="neutral600" tag="p">
            {formatMessage({
              id: `${pluginId}.reports.subtitle`,
              defaultMessage: 'Signalements soumis par les utilisateurs',
            })}
          </Typography>
        </Box>
        <Button onClick={refetch} variant="secondary" size="S">
          {formatMessage({
            id: `${pluginId}.reports.refresh`,
            defaultMessage: 'Actualiser',
          })}
        </Button>
      </Flex>

      {/* Filtre par statut */}
      <Flex gap={4} marginBottom={6} wrap="wrap">
        <Box style={{ minWidth: '200px' }}>
          <SingleSelect
            label={formatMessage({
              id: `${pluginId}.reports.filter.status`,
              defaultMessage: 'Statut',
            })}
            value={filters.status ?? ''}
            onChange={(value: string) =>
              setFilters({ status: value ? (value as ReportStatus) : undefined })
            }
            id="filter-report-status"
          >
            <SingleSelectOption value="">Tous</SingleSelectOption>
            <SingleSelectOption value="pending">En attente</SingleSelectOption>
            <SingleSelectOption value="reviewed">Examinés</SingleSelectOption>
            <SingleSelectOption value="dismissed">Rejetés</SingleSelectOption>
          </SingleSelect>
        </Box>
      </Flex>

      {/* Message d'erreur */}
      {error && (
        <Box marginBottom={4}>
          <Typography textColor="danger600" tag="p">
            {error}
          </Typography>
        </Box>
      )}

      {/* Tableau des signalements */}
      <Table colCount={6} rowCount={reports.length + 1}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma" tag="span">
                Raison
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Commentaire signalé
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Description
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Date
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Statut
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Actions
              </Typography>
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {reports.length === 0 ? (
            <Tr>
              <Td colSpan={6}>
                <Box padding={4}>
                  <Typography textColor="neutral600" tag="p">
                    Aucun signalement trouvé.
                  </Typography>
                </Box>
              </Td>
            </Tr>
          ) : (
            reports.map((report) => {
              const reasonColors = getReasonColors(report.reason);
              const statusColors = getStatusColors(report.status);

              return (
                <Tr key={report.documentId}>
                  {/* Raison — badge coloré */}
                  <Td>
                    <Badge
                      backgroundColor={reasonColors.background}
                    >
                      <Typography
                        variant="pi"
                        textColor={reasonColors.text}
                        tag="span"
                      >
                        {REASON_LABELS[report.reason]}
                      </Typography>
                    </Badge>
                  </Td>

                  {/* Commentaire signalé — extrait */}
                  <Td>
                    {report.comment ? (
                      <Box>
                        <Typography
                          variant="omega"
                          tag="span"
                          fontWeight="semiBold"
                        >
                          {report.comment.firstname}
                        </Typography>
                        <Typography
                          variant="pi"
                          textColor="neutral600"
                          tag="p"
                          title={report.comment.content}
                        >
                          {truncate(report.comment.content)}
                        </Typography>
                        {report.comment.blocked && (
                          <Badge backgroundColor="danger100">
                            <Typography variant="pi" textColor="danger600" tag="span">
                              Déjà bloqué
                            </Typography>
                          </Badge>
                        )}
                      </Box>
                    ) : (
                      <Typography
                        variant="pi"
                        textColor="neutral400"
                        tag="span"
                      >
                        Commentaire supprimé
                      </Typography>
                    )}
                  </Td>

                  {/* Description optionnelle du signalement */}
                  <Td>
                    <Typography
                      variant="pi"
                      textColor="neutral600"
                      tag="span"
                      title={report.description ?? ''}
                    >
                      {report.description
                        ? truncate(report.description, 40)
                        : '—'}
                    </Typography>
                  </Td>

                  {/* Date */}
                  <Td>
                    <Typography variant="pi" textColor="neutral600" tag="span">
                      {new Date(report.createdAt).toLocaleDateString('fr-FR')}
                    </Typography>
                  </Td>

                  {/* Statut — badge */}
                  <Td>
                    <Badge backgroundColor={statusColors.background}>
                      <Typography
                        variant="pi"
                        textColor={statusColors.text}
                        tag="span"
                      >
                        {STATUS_LABELS[report.status]}
                      </Typography>
                    </Badge>
                  </Td>

                  {/* Actions — visibles uniquement si statut pending */}
                  <Td>
                    {report.status === 'pending' ? (
                      <Flex gap={2}>
                        <Button
                          size="S"
                          variant="success-light"
                          onClick={() => handleMarkReviewed(report)}
                          aria-label={`Marquer le signalement ${report.documentId} comme examiné`}
                        >
                          Examiné
                        </Button>
                        <Button
                          size="S"
                          variant="tertiary"
                          onClick={() => handleDismiss(report)}
                          aria-label={`Rejeter le signalement ${report.documentId}`}
                        >
                          Rejeter
                        </Button>
                      </Flex>
                    ) : (
                      <Typography variant="pi" textColor="neutral400" tag="span">
                        —
                      </Typography>
                    )}
                  </Td>
                </Tr>
              );
            })
          )}
        </Tbody>
      </Table>

      {/* Pagination */}
      {pagination && pagination.pageCount > 1 && (
        <Box marginTop={6}>
          <Pagination
            activePage={pagination.page}
            pageCount={pagination.pageCount}
          >
            <PreviousLink
              onClick={() =>
                pagination.page > 1 && setFilters({ page: pagination.page - 1 })
              }
            >
              Page précédente
            </PreviousLink>
            {Array.from({ length: pagination.pageCount }, (_, i) => i + 1).map(
              (pageNum) => (
                <PageLink
                  key={pageNum}
                  number={pageNum}
                  onClick={() => setFilters({ page: pageNum })}
                >
                  {String(pageNum)}
                </PageLink>
              )
            )}
            <NextLink
              onClick={() =>
                pagination.page < pagination.pageCount &&
                setFilters({ page: pagination.page + 1 })
              }
            >
              Page suivante
            </NextLink>
          </Pagination>
        </Box>
      )}
    </Box>
  );
};

export default Reports;
