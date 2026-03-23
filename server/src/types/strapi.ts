/**
 * Types partagés pour l'intégration Strapi V5.
 *
 * Ces types encapsulent les structures Strapi sans dépendre directement
 * des types internes de @strapi/strapi pour limiter le couplage.
 *
 * Pilier TypeScript strict ISOMORPH : aucun `any` autorisé.
 */

/**
 * Contexte de requête Koa enrichi par Strapi.
 * Sous-ensemble des propriétés utilisées par le plugin.
 */
export interface StrapiContext {
  request: {
    body: Record<string, unknown>;
    ip: string;
    headers: Record<string, string | string[] | undefined>;
  };
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  state: {
    user?: StrapiAdminUser | StrapiUser;
    auth?: {
      credentials?: StrapiAdminUser;
      strategy?: { name: string };
    };
  };
  response: {
    status: number;
    body: unknown;
  };
  status: number;
  body: unknown;
  throw(status: number, message?: string): never;
  send(body: unknown): void;
}

/**
 * Utilisateur admin Strapi (accès tableau de bord).
 */
export interface StrapiAdminUser {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  roles: Array<{ code: string; name: string }>;
}

/**
 * Utilisateur Strapi (plugin users-permissions).
 */
export interface StrapiUser {
  id: number;
  documentId: string;
  email: string;
  username: string;
  firstname?: string;
  blocked: boolean;
  confirmed: boolean;
  provider?: string;
}

/**
 * Commentaire tel que retourné par le Document Service Strapi.
 */
export interface CommentEntity {
  id: number;
  documentId: string;
  firstname: string;
  email: string;
  content: string;
  /** HTML sanitisé pour les réponses admin (WYSIWYG). Null pour les commentaires standards. */
  contentHtml?: string | null;
  /** true si créé depuis le panneau admin. */
  isAdminReply?: boolean;
  blocked: boolean;
  approved: boolean;
  avatarColor?: string;
  relatedDocumentId: string;
  relatedCollection: string;
  parent?: CommentEntity | null;
  children?: CommentEntity[];
  author?: StrapiUser | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Raison d'un signalement de commentaire.
 */
export type ReportReason = 'offensive' | 'spam' | 'harassment' | 'misinformation' | 'other';

/**
 * Statut d'un signalement.
 */
export type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

/**
 * Signalement tel que retourné par le Document Service Strapi.
 */
export interface ReportEntity {
  id: number;
  documentId: string;
  reason: ReportReason;
  description?: string | null;
  reporterEmail: string;
  comment?: CommentEntity | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Statistiques du tableau de bord admin.
 */
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

/**
 * Commentaire structuré en arbre (N-1 niveaux).
 */
export interface CommentTree extends CommentEntity {
  children: CommentTree[];
  avatar?: {
    initial: string;
    color: string;
  };
}

/**
 * Catégorie utilisateur telle que retournée par le Document Service.
 */
export interface UserCategoryEntity {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
}

/**
 * Configuration d'une route Strapi V5.
 */
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: string;
  config?: {
    auth?: boolean | { scope: string[] };
    policies?: string[];
    middlewares?: string[];
    description?: string;
  };
}

/**
 * Objet de configuration des routes exporté par le plugin.
 */
export interface RouteConfig {
  type?: 'content-api' | 'admin';
  routes: RouteDefinition[];
}

/**
 * Options de pagination pour les requêtes admin.
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  start?: number;
  limit?: number;
}

/**
 * Réponse paginée standard.
 */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    pagination: {
      page: number;
      pageSize: number;
      pageCount: number;
      total: number;
    };
  };
}

/**
 * Options de requête du Document Service Strapi V5.
 */
export interface DocumentServiceFindParams {
  filters?: Record<string, unknown>;
  populate?: string[] | Record<string, unknown>;
  sort?: string | string[] | Record<string, 'asc' | 'desc'>;
  pagination?: {
    page?: number;
    pageSize?: number;
    start?: number;
    limit?: number;
  };
  fields?: string[];
}
