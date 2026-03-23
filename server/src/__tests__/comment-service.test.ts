/**
 * Tests unitaires — Service comment (fonctions pures)
 *
 * Couverture :
 *   - buildTree : construction de l'arbre N-1 depuis une liste plate
 *   - CommentServiceError : classe d'erreur métier
 */

import { describe, it, expect } from 'vitest';
import { buildTree, CommentServiceError } from '../services/comment';
import { type CommentEntity } from '../types/strapi';

// ─── Fixture de données de test ───────────────────────────────────────────────

/** Crée un commentaire de test minimal */
function makeComment(
  overrides: Partial<CommentEntity> & Pick<CommentEntity, 'documentId'>
): CommentEntity {
  return {
    id: 1,
    firstname: 'Test',
    email: 'test@test.com',
    content: 'Contenu de test',
    blocked: false,
    approved: true,
    relatedDocumentId: 'doc-001',
    relatedCollection: 'api::article.article',
    parent: null,
    children: [],
    author: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── buildTree ────────────────────────────────────────────────────────────────

describe('buildTree', () => {
  it('retourne une liste vide pour une entrée vide', () => {
    const result = buildTree([]);
    expect(result).toEqual([]);
  });

  it('retourne les commentaires racine sans réponses', () => {
    const comments = [
      makeComment({ documentId: 'c1', firstname: 'Alice' }),
      makeComment({ documentId: 'c2', firstname: 'Bob' }),
    ];

    const tree = buildTree(comments);

    expect(tree).toHaveLength(2);
    expect(tree[0]!.documentId).toBe('c1');
    expect(tree[1]!.documentId).toBe('c2');
    expect(tree[0]!.children).toHaveLength(0);
  });

  it('attache les réponses à leur commentaire parent', () => {
    const parent = makeComment({ documentId: 'parent-1', firstname: 'Alice', parent: null });
    const reply = makeComment({
      documentId: 'reply-1',
      firstname: 'Bob',
      parent: parent,
    });

    const tree = buildTree([parent, reply]);

    expect(tree).toHaveLength(1); // Un seul commentaire racine
    expect(tree[0]!.documentId).toBe('parent-1');
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children[0]!.documentId).toBe('reply-1');
  });

  it('gère plusieurs réponses pour un même commentaire parent', () => {
    const parent = makeComment({ documentId: 'parent-1', firstname: 'Alice', parent: null });
    const reply1 = makeComment({ documentId: 'reply-1', firstname: 'Bob', parent: parent });
    const reply2 = makeComment({ documentId: 'reply-2', firstname: 'Charlie', parent: parent });

    const tree = buildTree([parent, reply1, reply2]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(2);
  });

  it('gère les commentaires racine orphelins (parent introuvable dans la liste)', () => {
    const orphan = makeComment({
      documentId: 'orphan-1',
      parent: { documentId: 'missing-parent' } as CommentEntity,
    });

    const tree = buildTree([orphan]);

    // Un commentaire avec un parent introuvable est traité comme racine
    expect(tree).toHaveLength(1);
    expect(tree[0]!.documentId).toBe('orphan-1');
  });
});

// ─── CommentServiceError ──────────────────────────────────────────────────────

describe('CommentServiceError', () => {
  it('est une instance d\'Error', () => {
    const err = new CommentServiceError('Test');
    expect(err).toBeInstanceOf(Error);
  });

  it('a le nom "CommentServiceError"', () => {
    const err = new CommentServiceError('Test');
    expect(err.name).toBe('CommentServiceError');
  });

  it('utilise le statusCode par défaut de 400', () => {
    const err = new CommentServiceError('Test');
    expect(err.statusCode).toBe(400);
  });

  it('accepte un statusCode personnalisé', () => {
    const err = new CommentServiceError('Non trouvé', 404);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Non trouvé');
  });
});
