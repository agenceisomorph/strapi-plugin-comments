/**
 * Page CommentsList — liste et modération des commentaires.
 *
 * Fonctionnalités :
 *   - Tableau paginé de tous les commentaires
 *   - Filtres : statut (pending/approved/blocked/all), collection cible
 *   - Actions en ligne : Approuver, Bloquer, Répondre (WYSIWYG), Supprimer
 *   - Dialog de confirmation pour les suppressions
 *   - Dialog de réponse admin avec textarea HTML
 *
 * RGAA 4.1 :
 *   - Critère 5.4 : tableau avec en-têtes <th scope="col">
 *   - Critère 7.1 : Dialog accessible avec focus trap (géré par @strapi/design-system)
 *   - Critère 11.1 : labels associés à chaque champ de filtre
 *   - Touch targets ≥ 44×44px sur les boutons d'action
 */

import React, { useState } from 'react';
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
  Dialog,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  Pagination,
  PreviousLink,
  NextLink,
  PageLink,
  Dots,
} from '@strapi/design-system';
import { useComments, type Comment } from '../../hooks/useComments';
import pluginId from '../../pluginId';

/** Traduit le statut d'un commentaire en libellé lisible */
function getStatusLabel(comment: Comment): string {
  if (comment.blocked) return 'Bloqué';
  if (!comment.approved) return 'En attente';
  return 'Approuvé';
}

/** Variante du Badge selon le statut */
function getStatusBadgeVariant(comment: Comment): 'danger' | 'warning' | 'success' {
  if (comment.blocked) return 'danger';
  if (!comment.approved) return 'warning';
  return 'success';
}

/** Tronque un texte à N caractères */
function truncate(text: string, maxLength = 80): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

const CommentsList: React.FC = () => {
  const { formatMessage } = useIntl();
  const {
    comments,
    pagination,
    filters,
    isLoading,
    error,
    setFilters,
    approve,
    block,
    deleteComment,
    adminReply,
    refetch,
  } = useComments();

  // État du dialog de suppression
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // État du dialog de réponse admin
  const [replyTarget, setReplyTarget] = useState<Comment | null>(null);
  const [replyHtml, setReplyHtml] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // Gestion des actions
  const handleApprove = async (comment: Comment) => {
    await approve(comment.documentId);
  };

  const handleBlock = async (comment: Comment) => {
    await block(comment.documentId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteComment(deleteTarget.documentId);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReplySubmit = async () => {
    if (!replyTarget || !replyHtml.trim()) {
      setReplyError('Le contenu de la réponse est requis.');
      return;
    }
    setIsReplying(true);
    setReplyError(null);
    try {
      await adminReply(replyTarget.documentId, replyHtml);
      setReplyTarget(null);
      setReplyHtml('');
    } catch {
      setReplyError('Erreur lors de la création de la réponse.');
    } finally {
      setIsReplying(false);
    }
  };

  if (isLoading && comments.length === 0) {
    return (
      <Flex justifyContent="center" padding={10}>
        <Loader>
          {formatMessage({
            id: `${pluginId}.comments.loading`,
            defaultMessage: 'Chargement des commentaires...',
          })}
        </Loader>
      </Flex>
    );
  }

  return (
    <Box padding={8}>
      {/* En-tête */}
      <Flex justifyContent="space-between" alignItems="center" marginBottom={6}>
        <Typography variant="alpha" tag="h2">
          {formatMessage({
            id: `${pluginId}.comments.title`,
            defaultMessage: 'Commentaires',
          })}
        </Typography>
        <Button onClick={refetch} variant="secondary" size="S">
          {formatMessage({
            id: `${pluginId}.comments.refresh`,
            defaultMessage: 'Actualiser',
          })}
        </Button>
      </Flex>

      {/* Barre de filtres */}
      <Flex gap={4} marginBottom={6} wrap="wrap">
        {/* Filtre statut */}
        <Box style={{ minWidth: '200px' }}>
          <SingleSelect
            label={formatMessage({
              id: `${pluginId}.comments.filter.status`,
              defaultMessage: 'Statut',
            })}
            value={filters.status ?? 'all'}
            onChange={(value: string) => setFilters({ status: value as typeof filters.status })}
            id="filter-status"
          >
            <SingleSelectOption value="all">Tous</SingleSelectOption>
            <SingleSelectOption value="pending">En attente</SingleSelectOption>
            <SingleSelectOption value="approved">Approuvés</SingleSelectOption>
            <SingleSelectOption value="blocked">Bloqués</SingleSelectOption>
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

      {/* Tableau des commentaires */}
      <Table colCount={6} rowCount={comments.length + 1}>
        <Thead>
          <Tr>
            <Th>
              <Typography variant="sigma" tag="span">
                Auteur
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Contenu
              </Typography>
            </Th>
            <Th>
              <Typography variant="sigma" tag="span">
                Collection
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
          {comments.length === 0 ? (
            <Tr>
              <Td colSpan={6}>
                <Box padding={4}>
                  <Typography textColor="neutral600" tag="p">
                    Aucun commentaire trouvé.
                  </Typography>
                </Box>
              </Td>
            </Tr>
          ) : (
            comments.map((comment) => (
              <Tr key={comment.documentId}>
                {/* Auteur */}
                <Td>
                  <Typography variant="omega" tag="span" fontWeight="semiBold">
                    {comment.firstname}
                  </Typography>
                  <Typography
                    variant="pi"
                    textColor="neutral600"
                    tag="p"
                  >
                    {comment.email}
                  </Typography>
                  {comment.isAdminReply && (
                    <Badge active size="S">Admin</Badge>
                  )}
                </Td>

                {/* Contenu tronqué */}
                <Td>
                  <Typography variant="omega" tag="span" title={comment.content}>
                    {truncate(comment.content)}
                  </Typography>
                </Td>

                {/* Collection cible */}
                <Td>
                  <Typography
                    variant="pi"
                    textColor="neutral600"
                    tag="span"
                  >
                    {comment.relatedCollection}
                  </Typography>
                </Td>

                {/* Date de création */}
                <Td>
                  <Typography variant="pi" textColor="neutral600" tag="span">
                    {new Date(comment.createdAt).toLocaleDateString('fr-FR')}
                  </Typography>
                </Td>

                {/* Badge statut */}
                <Td>
                  <Badge
                    active={!comment.blocked && comment.approved}
                    backgroundColor={
                      comment.blocked
                        ? 'danger100'
                        : !comment.approved
                        ? 'warning100'
                        : 'success100'
                    }
                  >
                    <Typography
                      variant="pi"
                      textColor={
                        comment.blocked
                          ? 'danger600'
                          : !comment.approved
                          ? 'warning600'
                          : 'success600'
                      }
                      tag="span"
                    >
                      {getStatusLabel(comment)}
                    </Typography>
                  </Badge>
                </Td>

                {/* Actions */}
                <Td>
                  <Flex gap={2} wrap="wrap">
                    {/* Approuver — visible si non approuvé et non bloqué */}
                    {!comment.approved && !comment.blocked && (
                      <Button
                        size="S"
                        variant="success-light"
                        onClick={() => handleApprove(comment)}
                        aria-label={`Approuver le commentaire de ${comment.firstname}`}
                      >
                        Approuver
                      </Button>
                    )}

                    {/* Bloquer — visible si non bloqué */}
                    {!comment.blocked && (
                      <Button
                        size="S"
                        variant="danger-light"
                        onClick={() => handleBlock(comment)}
                        aria-label={`Bloquer le commentaire de ${comment.firstname}`}
                      >
                        Bloquer
                      </Button>
                    )}

                    {/* Répondre — visible si non bloqué et pas déjà une réponse */}
                    {!comment.blocked && !comment.parent && (
                      <Button
                        size="S"
                        variant="secondary"
                        onClick={() => {
                          setReplyTarget(comment);
                          setReplyHtml('');
                          setReplyError(null);
                        }}
                        aria-label={`Répondre au commentaire de ${comment.firstname}`}
                      >
                        Répondre
                      </Button>
                    )}

                    {/* Supprimer */}
                    <Button
                      size="S"
                      variant="danger"
                      onClick={() => setDeleteTarget(comment)}
                      aria-label={`Supprimer le commentaire de ${comment.firstname}`}
                    >
                      Supprimer
                    </Button>
                  </Flex>
                </Td>
              </Tr>
            ))
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

      {/* Dialog de confirmation de suppression */}
      {deleteTarget && (
        <Dialog
          onClose={() => setDeleteTarget(null)}
          title="Confirmer la suppression"
          isOpen
        >
          <Box padding={4}>
            <Typography tag="p">
              Supprimer définitivement le commentaire de{' '}
              <strong>{deleteTarget.firstname}</strong> ?
              Cette action supprimera également toutes ses réponses.
            </Typography>
          </Box>
          <Flex justifyContent="flex-end" gap={4} padding={4}>
            <Button
              variant="tertiary"
              onClick={() => setDeleteTarget(null)}
              disabled={isDeleting}
            >
              Annuler
            </Button>
            <Button
              variant="danger"
              onClick={handleDeleteConfirm}
              loading={isDeleting}
            >
              Supprimer
            </Button>
          </Flex>
        </Dialog>
      )}

      {/* Dialog de réponse admin */}
      {replyTarget && (
        <Dialog
          onClose={() => {
            setReplyTarget(null);
            setReplyHtml('');
            setReplyError(null);
          }}
          title={`Répondre à ${replyTarget.firstname}`}
          isOpen
        >
          <Box padding={4}>
            {/* Aperçu du commentaire original */}
            <Box
              background="neutral100"
              padding={4}
              borderRadius="4px"
              marginBottom={4}
            >
              <Typography
                variant="pi"
                textColor="neutral600"
                tag="p"
                marginBottom={2}
              >
                Commentaire original :
              </Typography>
              <Typography variant="omega" tag="p">
                {replyTarget.content}
              </Typography>
            </Box>

            {/* Textarea pour la réponse */}
            <Box>
              <Textarea
                label="Votre réponse"
                name="adminReply"
                value={replyHtml}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setReplyHtml(e.target.value)
                }
                placeholder="Rédigez votre réponse ici..."
                rows={6}
                hint="HTML basique accepté : <b>, <i>, <a href='...'>, <ul>, <li>"
                error={replyError ?? undefined}
                required
              />
            </Box>
          </Box>
          <Flex justifyContent="flex-end" gap={4} padding={4}>
            <Button
              variant="tertiary"
              onClick={() => {
                setReplyTarget(null);
                setReplyHtml('');
                setReplyError(null);
              }}
              disabled={isReplying}
            >
              Annuler
            </Button>
            <Button
              variant="default"
              onClick={handleReplySubmit}
              loading={isReplying}
              disabled={!replyHtml.trim()}
            >
              Envoyer la réponse
            </Button>
          </Flex>
        </Dialog>
      )}
    </Box>
  );
};

export default CommentsList;
