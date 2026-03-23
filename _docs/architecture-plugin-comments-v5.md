# Architecture technique — strapi-plugin-comments (Strapi V5)

**Agent** : BLUEPRINT — Architecte technique ISOMORPH
**Date** : 2026-03-22
**Version** : 1.0
**Statut** : Document de référence — transmis à FORGE pour implémentation

---

## Sommaire

1. [Vue d'ensemble et contraintes](#1-vue-densemble-et-contraintes)
2. [Structure du plugin Strapi V5](#2-structure-du-plugin-strapi-v5)
3. [Modèle de données](#3-modèle-de-données)
4. [Architecture API](#4-architecture-api)
5. [Configuration du plugin](#5-configuration-du-plugin)
6. [Points d'intégration](#6-points-dintégration)
7. [Décisions techniques (ADR)](#7-décisions-techniques-adr)
8. [Évaluation complexité et risques](#8-évaluation-complexité-et-risques)

---

## 1. Vue d'ensemble et contraintes

### 1.1 Identité du livrable

| Propriété | Valeur |
|-----------|--------|
| Nom NPM | `strapi-plugin-comments` |
| Scope | Sans scope (plugin Strapi Marketplace) |
| Cible | Strapi V5 uniquement |
| Langage | TypeScript strict (pas de `any`) |
| Base de données | PostgreSQL (via Knex, abstraction Strapi) |
| Visibilité | Open source, publication NPM publique |

### 1.2 Périmètre fonctionnel

Le plugin expose un système de commentaires embarquable dans toute collection Strapi V5. Il gère :

- La collecte de commentaires (email, prénom, texte) sur une collection cible configurable
- La modération via interface admin Strapi
- Les réponses à un niveau de profondeur (N-1), sans récursivité infinie
- La génération d'avatar par initiale (logique API, rendu client)
- L'inscription automatique du commentateur comme utilisateur "Abonné"
- Le filtre anti-injures FR/EN (`leo-profanity`, MIT)
- La vérification Google reCAPTCHA V3
- La protection rate limiting, sanitisation XSS, sécurité OWASP

### 1.3 Contraintes non-négociables (piliers ISOMORPH)

| Pilier | Application dans ce plugin |
|--------|---------------------------|
| RGAA 4.1 | Pas d'interface admin imposée côté plugin (le rendu frontend est délégué) |
| RGESN 2024 | Pas de dépendances lourdes inutiles — uniquement `leo-profanity` (< 10 Ko) |
| Core Web Vitals | API performante : index DB sur `documentId` + `parentId` + `blocked` |
| OWASP 2025 | Rate limiting, Zod validation, sanitisation XSS, tokens minimaux, fail-closed |

### 1.4 Schéma des couches applicatives

```
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION HÔTE (projet Strapi V5 du client)              │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PLUGIN strapi-plugin-comments                        │  │
│  │                                                       │  │
│  │  ┌─────────────┐   ┌──────────────┐   ┌───────────┐  │  │
│  │  │  Middlewares │   │  Controllers │   │ Services  │  │  │
│  │  │  - RateLimit │──▶│  - comment   │──▶│ - comment │  │  │
│  │  │  - reCAPTCHA │   │  - moderation│   │ - avatar  │  │  │
│  │  │  - Sanitize  │   │              │   │ - filter  │  │  │
│  │  └─────────────┘   └──────────────┘   └─────┬─────┘  │  │
│  │                                             │         │  │
│  │  ┌─────────────────────────────────────────▼──────┐  │  │
│  │  │  Content-Types (déclarés par le plugin)        │  │  │
│  │  │  - plugin::comments.comment                    │  │  │
│  │  │  - plugin::comments.user-category              │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  ┌────────────────────────────────────────────────┐  │  │
│  │  │  Relations avec l'application hôte             │  │  │
│  │  │  - plugin::users-permissions.user              │  │  │
│  │  │  - [collection cible configurable]             │  │  │
│  │  └────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  PostgreSQL — Tables générées par Strapi              │  │
│  │  comments  |  user_categories  |  users (existant)    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

           ▲ REST API (/api/comments/*)
           │
┌──────────┴───────────────┐
│  FRONTEND (agnostique)   │
│  React / Vue / Vanilla   │
│  Next.js / Nuxt / etc.   │
└──────────────────────────┘
```

---

## 2. Structure du plugin Strapi V5

### 2.1 Arborescence complète

La structure respecte l'API plugin Strapi V5 (SDK plugin officiel). Le plugin est développé en TypeScript strict et ne possède pas d'interface admin (le panneau d'administration Strapi natif suffit pour la modération).

```
strapi-plugin-comments-v5/
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.ts                  # Schéma de configuration + valeurs par défaut
│   │   │
│   │   ├── content-types/
│   │   │   ├── index.ts                  # Export de tous les content-types
│   │   │   ├── comment/
│   │   │   │   └── schema.json           # Schéma du content-type "comment"
│   │   │   └── user-category/
│   │   │       └── schema.json           # Schéma du content-type "user-category"
│   │   │
│   │   ├── controllers/
│   │   │   ├── index.ts                  # Export des controllers
│   │   │   ├── comment.ts                # CRUD commentaires (routes publiques)
│   │   │   └── moderation.ts             # Modération admin
│   │   │
│   │   ├── services/
│   │   │   ├── index.ts                  # Export des services
│   │   │   ├── comment.ts                # Logique métier commentaires
│   │   │   ├── avatar.ts                 # Génération données avatar
│   │   │   ├── profanity.ts              # Filtre anti-injures (wrapper leo-profanity)
│   │   │   ├── recaptcha.ts              # Vérification reCAPTCHA V3
│   │   │   └── subscriber.ts             # Inscription commentateur comme Abonné
│   │   │
│   │   ├── routes/
│   │   │   ├── index.ts                  # Export des routes (content-api + admin)
│   │   │   ├── content-api/
│   │   │   │   └── comment.ts            # Routes publiques
│   │   │   └── admin/
│   │   │       └── moderation.ts         # Routes admin protégées
│   │   │
│   │   ├── middlewares/
│   │   │   ├── index.ts                  # Export des middlewares
│   │   │   ├── rate-limit.ts             # Rate limiting par IP
│   │   │   ├── recaptcha-verify.ts       # Vérification token reCAPTCHA
│   │   │   └── sanitize-input.ts         # Sanitisation XSS des inputs
│   │   │
│   │   ├── policies/
│   │   │   ├── index.ts                  # Export des policies
│   │   │   ├── is-admin.ts               # Réservé aux rôles admin Strapi
│   │   │   └── comment-owner.ts          # Seul l'auteur peut modifier (optionnel)
│   │   │
│   │   ├── register.ts                   # Hooks pre-bootstrap
│   │   ├── bootstrap.ts                  # Initialisation post-chargement
│   │   ├── destroy.ts                    # Nettoyage (timers rate-limit, etc.)
│   │   └── index.ts                      # Point d'entrée server
│   │
│   ├── tsconfig.json
│   └── tsconfig.build.json
│
├── dist/                                 # Généré à la compilation — ne pas versionner
│
├── package.json
├── tsconfig.json
├── .eslintrc.js
├── .prettierrc
├── .gitignore
└── README.md
```

### 2.2 Point d'entrée `server/src/index.ts`

Le fichier exporte une fonction (forme recommandée Strapi V5) retournant l'objet de configuration du plugin :

```
Exports :
  register    → server/src/register.ts
  bootstrap   → server/src/bootstrap.ts
  destroy     → server/src/destroy.ts
  config      → server/src/config/index.ts
  contentTypes → server/src/content-types/index.ts
  routes      → server/src/routes/index.ts
  controllers → server/src/controllers/index.ts
  services    → server/src/services/index.ts
  policies    → server/src/policies/index.ts
  middlewares → server/src/middlewares/index.ts
```

### 2.3 Rôle de chaque cycle de vie

| Fichier | Timing | Responsabilité |
|---------|--------|----------------|
| `register.ts` | Avant init DB | Enregistrement custom fields, extension schéma User si nécessaire |
| `bootstrap.ts` | Après chargement plugins | Création de la catégorie "Abonné" si absente, init rate-limit store |
| `destroy.ts` | Arrêt Strapi | Libération du store rate-limit en mémoire |

---

## 3. Modèle de données

### 3.1 Content-type `comment`

**UID Strapi** : `plugin::comments.comment`
**Table PostgreSQL** : `comments_comments`
**Kind** : `collectionType`

#### Schéma JSON (`content-types/comment/schema.json`)

```json
{
  "kind": "collectionType",
  "collectionName": "comments_comments",
  "info": {
    "singularName": "comment",
    "pluralName": "comments",
    "displayName": "Comment",
    "description": "Commentaire utilisateur attaché à une entité de contenu"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {
    "content-manager": { "visible": true },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "firstname": {
      "type": "string",
      "required": true,
      "minLength": 1,
      "maxLength": 100
    },
    "email": {
      "type": "email",
      "required": true
    },
    "content": {
      "type": "text",
      "required": true,
      "minLength": 1,
      "maxLength": 2000
    },
    "blocked": {
      "type": "boolean",
      "default": false,
      "required": true
    },
    "approved": {
      "type": "boolean",
      "default": true,
      "required": true,
      "description": "false si modération manuelle activée dans config"
    },
    "avatarColor": {
      "type": "string",
      "description": "Code couleur hexadécimal pastel généré à la création (ex: #B5EAD7)"
    },
    "relatedDocumentId": {
      "type": "string",
      "required": true,
      "description": "documentId de l'entité cible (ex: article) — non-relation Strapi, string brute"
    },
    "relatedCollection": {
      "type": "string",
      "required": true,
      "description": "UID de la collection cible (ex: api::article.article) — permet multi-collection"
    },
    "parent": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::comments.comment",
      "inversedBy": "children"
    },
    "children": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "plugin::comments.comment",
      "mappedBy": "parent"
    },
    "author": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "plugin::users-permissions.user",
      "inversedBy": "comments"
    }
  }
}
```

#### Notes sur les champs clés

**`relatedDocumentId` et `relatedCollection` (string, pas de relation Strapi)**
La liaison à la collection cible est intentionnellement stockée en string plutôt qu'en relation Strapi. Cette décision permet au plugin de fonctionner avec n'importe quelle collection sans dépendance au contenu-type de l'hôte, et d'éviter les contraintes d'intégrité référentielle qui rendraient la suppression d'articles problématique. Le service charge les données de l'entité liée à la demande via `strapi.documents(relatedCollection).findOne({ documentId })`.

**`parent` / `children` (relation auto-référentielle)**
Relation `manyToOne` / `oneToMany` sur le même content-type. La profondeur est limitée à N-1 par enforcement applicatif dans le service (voir ADR section 7.1), non par contrainte de schéma.

**`approved`**
Permet l'activation optionnelle d'un workflow de modération manuelle. Par défaut `true` (publication immédiate). Configurable dans les options du plugin.

**`author`**
Relation optionnelle vers `plugin::users-permissions.user`. Null pour les commentaires anonymes. Renseigné automatiquement lors de la création si le commentateur est enregistré comme Abonné.

**`avatarColor`**
Persisté en base à la création pour garantir la cohérence entre les rechargements. Généré par le service `avatar.ts` depuis le prénom.

#### Index PostgreSQL recommandés

```
INDEX ON comments_comments (related_document_id, related_collection, blocked, approved)
INDEX ON comments_comments (parent_id)
INDEX ON comments_comments (author_id)
INDEX ON comments_comments (email)
```

---

### 3.2 Content-type `user-category`

**UID Strapi** : `plugin::comments.user-category`
**Table PostgreSQL** : `comments_user_categories`
**Kind** : `collectionType`

#### Schéma JSON (`content-types/user-category/schema.json`)

```json
{
  "kind": "collectionType",
  "collectionName": "comments_user_categories",
  "info": {
    "singularName": "user-category",
    "pluralName": "user-categories",
    "displayName": "User Category",
    "description": "Catégories assignables aux utilisateurs (ex: Abonné, Contributeur)"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {
    "content-manager": { "visible": true },
    "content-type-builder": { "visible": false }
  },
  "attributes": {
    "name": {
      "type": "string",
      "required": true,
      "unique": true,
      "maxLength": 100
    },
    "slug": {
      "type": "uid",
      "targetField": "name",
      "required": true
    },
    "description": {
      "type": "text",
      "maxLength": 500
    },
    "color": {
      "type": "string",
      "description": "Couleur hexadécimale pour l'affichage admin (ex: #FFD700)"
    },
    "users": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user",
      "inversedBy": "userCategories"
    }
  }
}
```

#### Note sur l'extension du modèle User

Le plugin doit étendre le modèle `plugin::users-permissions.user` pour ajouter la relation `userCategories`. Cette extension est réalisée dans `register.ts` via l'API d'extension de contenu-type de Strapi V5 :

```
Dans register.ts :
  strapi.getModel('plugin::users-permissions.user')
    → ajouter la relation userCategories → manyToMany → plugin::comments.user-category

Mécanisme : extension via strapi.plugin('users-permissions').contentTypes.user.attributes
```

L'extension doit être fail-safe : si le plugin `users-permissions` n'est pas présent, le plugin fonctionne en mode dégradé (pas d'inscription automatique Abonné, commentaires purement anonymes).

---

### 3.3 Diagramme entité-relation

```
plugin::users-permissions.user
│
│  manyToMany
├──────────────────────── plugin::comments.user-category
│                         (name, slug, color)
│
│  oneToMany (author)
└──────────────────────── plugin::comments.comment
                          (firstname, email, content,
                           blocked, approved, avatarColor,
                           relatedDocumentId, relatedCollection)
                               │
                               │  manyToOne (parent)
                               │  oneToMany (children)
                               └──────── plugin::comments.comment
                                         [réponses niveau N-1 uniquement,
                                          enforced par service]


[Collection cible : ex. api::article.article]
    documentId ◄── relatedDocumentId (string, lookup applicatif)
```

---

## 4. Architecture API

### 4.1 Routes Content-API (publiques / semi-publiques)

Fichier : `routes/content-api/comment.ts`

| Méthode | Path | Handler | Auth | Description |
|---------|------|---------|------|-------------|
| `GET` | `/comments` | `comment.find` | `false` | Liste des commentaires pour un document (filtre par `relatedDocumentId` + `relatedCollection`) |
| `GET` | `/comments/:id` | `comment.findOne` | `false` | Détail d'un commentaire |
| `POST` | `/comments` | `comment.create` | `false` | Soumettre un nouveau commentaire |
| `POST` | `/comments/:id/reply` | `comment.reply` | `false` | Répondre à un commentaire existant (N-1) |
| `DELETE` | `/comments/:id` | `comment.delete` | `true` | Supprimer son propre commentaire (optionnel, voir ADR) |

**Remarque sur la route `find`** : L'endpoint `GET /comments` n'expose que les commentaires `approved: true` et `blocked: false` par défaut. Le filtrage par `relatedDocumentId` est obligatoire (Zod validation dans le controller). Sans ce paramètre, la requête est rejetée avec 400.

**Middlewares appliqués sur les routes publiques d'écriture** (`POST /comments`, `POST /comments/:id/reply`) :
1. `sanitize-input` — nettoyage XSS avant traitement
2. `recaptcha-verify` — vérification token Google V3
3. `rate-limit` — fenêtre glissante par IP

### 4.2 Routes Admin

Fichier : `routes/admin/moderation.ts`

| Méthode | Path | Handler | Policy | Description |
|---------|------|---------|--------|-------------|
| `GET` | `/comments/admin/comments` | `moderation.findAll` | `is-admin` | Liste tous les commentaires (avec filtres, pagination) |
| `GET` | `/comments/admin/comments/:id` | `moderation.findOne` | `is-admin` | Détail admin d'un commentaire |
| `PUT` | `/comments/admin/comments/:id/approve` | `moderation.approve` | `is-admin` | Approuver un commentaire |
| `PUT` | `/comments/admin/comments/:id/block` | `moderation.block` | `is-admin` | Bloquer un commentaire |
| `PUT` | `/comments/admin/comments/:id/block-author` | `moderation.blockAuthor` | `is-admin` | Bloquer l'auteur (toggle `blocked` sur User) |
| `DELETE` | `/comments/admin/comments/:id` | `moderation.delete` | `is-admin` | Supprimer définitivement un commentaire |

**Format de la config routes (structure Strapi V5)** :

```
{
  routes: [
    {
      method: 'GET',
      path: '/comments',
      handler: 'comment.find',
      config: {
        auth: false,
        policies: [],
        middlewares: ['plugin::comments.rate-limit'],
      },
    },
    ...
  ]
}
```

### 4.3 Controllers — Responsabilités

#### `controllers/comment.ts`

| Action | Responsabilité |
|--------|---------------|
| `find` | Valider les query params (Zod : `relatedDocumentId` requis), déléguer au service, formater la réponse (avatar inclus) |
| `findOne` | Valider l'id, vérifier `approved + !blocked`, déléguer |
| `create` | Valider le body (Zod : firstname, email, content requis), déléguer au service `comment.create` |
| `reply` | Valider l'id parent + body, vérifier que le parent n'est pas lui-même une réponse (N-1), déléguer |
| `delete` | Optionnel — vérifier ownership si Plugin 2 Auth connecté |

**Principe** : Les controllers ne contiennent aucune logique métier. Validation Zod des inputs + appel service + formatage réponse HTTP uniquement.

#### `controllers/moderation.ts`

| Action | Responsabilité |
|--------|---------------|
| `findAll` | Pagination (offset + limit), filtres (approved, blocked, collection), tri (date) |
| `findOne` | Détail complet avec relations (author, parent, children) |
| `approve` | Toggle `approved: true` |
| `block` | Toggle `blocked: true` sur le commentaire |
| `blockAuthor` | Toggle `blocked: true` sur l'utilisateur lié (via service `subscriber`) |
| `delete` | Suppression avec cascade enfants (service) |

### 4.4 Services — Responsabilités

#### `services/comment.ts`

Service principal. Orchestre les autres services.

| Méthode | Responsabilité |
|---------|---------------|
| `findByDocument(relatedDocumentId, relatedCollection, options)` | Requête Document Service avec filtres approved+!blocked, construction arbre N-1 |
| `create(data)` | Pipeline : filtre injures → couleur avatar → enregistrement → inscription Abonné |
| `createReply(parentId, data)` | Vérification profondeur (parent.parent === null), puis create |
| `delete(id)` | Suppression commentaire + enfants en cascade |
| `buildTree(flatComments)` | Construit la structure parent → children depuis une liste plate |

#### `services/avatar.ts`

Service pur, sans dépendance Strapi.

| Méthode | Responsabilité |
|---------|---------------|
| `generateColor(firstname)` | Hash déterministe du prénom → sélection dans palette pastel (12 couleurs fixes) |
| `getAvatarData(firstname, color)` | Retourne `{ initial: string, color: string }` pour sérialisation JSON |

**Palette pastel définie** : 12 couleurs hardcodées conformes WCAG AA (contraste ≥ 4.5:1 sur fond blanc pour la lettre sombre). Pas de génération aléatoire — déterministe depuis le prénom.

#### `services/profanity.ts`

Wrapper injectable autour de `leo-profanity`.

| Méthode | Responsabilité |
|---------|---------------|
| `init()` | Charge les dictionnaires FR + EN au bootstrap |
| `check(text)` | Retourne `boolean` — texte contient une injure |
| `clean(text)` | Retourne le texte censuré (pour log/debug admin, pas exposé en API) |

**Stratégie** : fail-open configurable. Si `config.profanityFilter.failOpen = true` (défaut), une erreur du filtre ne bloque pas la soumission. Si `false`, fail-closed (rejet du commentaire).

#### `services/recaptcha.ts`

| Méthode | Responsabilité |
|---------|---------------|
| `verify(token, remoteIp?)` | Appel Google Siteverify API, vérification du score > seuil config |

**Sécurité** : La clé secrète reCAPTCHA ne transite jamais côté client. L'appel HTTP vers `https://www.google.com/recaptcha/api/siteverify` est réalisé serveur-side. Timeout de 3s, fail-closed si `config.recaptcha.failClosed = true`.

#### `services/subscriber.ts`

| Méthode | Responsabilité |
|---------|---------------|
| `ensureSubscriberCategory()` | Vérifie/crée la catégorie "Abonné" dans `user-category` (appelé au bootstrap) |
| `registerAsSubscriber(email, firstname)` | Cherche ou crée l'utilisateur, assigne la catégorie Abonné |

**Stratégie** : `findOrCreate` sur l'email. Si un utilisateur existe déjà (même email), on lui ajoute seulement la catégorie sans modifier son profil. Si l'utilisateur est bloqué (`blocked: true`), la soumission du commentaire est rejetée avant enregistrement.

### 4.5 Middlewares

#### `middlewares/rate-limit.ts`

**Mécanisme** : Store en mémoire (`Map<string, RateLimitEntry>`). Fenêtre glissante par IP.

| Paramètre | Valeur par défaut | Configurable |
|-----------|------------------|-------------|
| Fenêtre | 15 minutes | Oui (`config.rateLimit.windowMs`) |
| Max requêtes | 5 par fenêtre | Oui (`config.rateLimit.max`) |
| Clé | IP (`ctx.request.ip`) | Non |
| Réponse dépassement | 429 Too Many Requests | Non |

**Note architecture** : Un store en mémoire est suffisant pour un hébergement single-node. Pour multi-node/cluster, la documentation doit indiquer de remplacer par un store Redis partagé (interface injectable prévue, voir section 6.3).

#### `middlewares/recaptcha-verify.ts`

Appelle `services.recaptcha.verify(token)`. Attend le header `x-recaptcha-token` ou le champ `recaptchaToken` dans le body. Rejette avec 403 si absent ou score insuffisant.

#### `middlewares/sanitize-input.ts`

Sanitise les champs `firstname`, `email`, `content` du body avant traitement. Utilise une logique de nettoyage XSS whitelist (suppression des balises HTML, entités dangereuses). Pas de dépendance externe lourde — logique inline légère ou `xss` (npm, 1.5 Ko gzippé, MIT).

### 4.6 Policies

#### `policies/is-admin.ts`

Vérifie que le contexte d'authentification est un token admin Strapi (rôle `strapi-admin`). Utilisée exclusivement sur les routes admin. Retourne 403 si non satisfaite.

#### `policies/comment-owner.ts`

Optionnelle. Vérifie que l'utilisateur authentifié (via Plugin 2 Auth) est bien l'auteur du commentaire ciblé. Activée uniquement si `config.allowDelete = true` et Plugin 2 connecté.

---

## 5. Configuration du plugin

### 5.1 Schéma de configuration (`config/index.ts`)

```
CONFIG SCHEMA (valeurs par défaut + types) :

{
  // Collection cible par défaut
  targetCollection: string
    défaut : 'api::article.article'
    description : UID Strapi de la collection sur laquelle les commentaires s'appliquent.
                  Peut être surchargé par paramètre relatedCollection en body.

  // Modération
  requireApproval: boolean
    défaut : false
    description : Si true, tout nouveau commentaire a approved=false jusqu'à action admin.

  allowDelete: boolean
    défaut : false
    description : Permet aux auteurs de supprimer leurs propres commentaires.

  // Filtre anti-injures
  profanityFilter: {
    enabled: boolean   — défaut : true
    languages: string[]  — défaut : ['fr', 'en']
    failOpen: boolean   — défaut : true (erreur filtre = commentaire accepté)
    action: 'reject' | 'flag'
      — défaut : 'reject'
      — 'reject' : retourne 400 Bad Request
      — 'flag' : accepte le commentaire mais marque approved=false pour modération manuelle
  }

  // reCAPTCHA V3
  recaptcha: {
    enabled: boolean   — défaut : true
    scoreThreshold: number   — défaut : 0.5  (0.0 - 1.0)
    failClosed: boolean  — défaut : true (erreur appel Google = rejet)
  }

  // Rate limiting
  rateLimit: {
    enabled: boolean   — défaut : true
    windowMs: number   — défaut : 900000  (15 minutes en ms)
    max: number        — défaut : 5       (soumissions par fenêtre par IP)
  }

  // Avatar
  avatar: {
    enabled: boolean   — défaut : true
    palette: string[]  — défaut : palette pastel ISOMORPH (12 couleurs)
  }

  // Inscription Abonné
  subscriber: {
    enabled: boolean       — défaut : true
    categoryName: string   — défaut : 'Abonné'
    categorySlug: string   — défaut : 'abonne'
  }
}
```

### 5.2 Variables d'environnement

Ces variables doivent être définies dans le `.env` de l'application hôte Strapi :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `RECAPTCHA_SECRET_KEY` | Oui (si recaptcha.enabled) | Clé secrète Google reCAPTCHA V3 |
| `RECAPTCHA_SITE_KEY` | Non (info client) | Clé publique, non lue côté plugin server |

**Rappel OWASP / ISOMORPH** : Aucune variable de configuration sensible ne doit être préfixée `NEXT_PUBLIC_*` (contexte Next.js) ou exposée dans les réponses API.

### 5.3 Exemple de configuration dans l'application hôte

```
// config/plugins.ts de l'application Strapi hôte

module.exports = {
  comments: {
    enabled: true,
    config: {
      targetCollection: 'api::article.article',
      requireApproval: false,
      profanityFilter: {
        enabled: true,
        action: 'reject',
      },
      recaptcha: {
        enabled: true,
        scoreThreshold: 0.5,
        failClosed: true,
      },
      rateLimit: {
        enabled: true,
        max: 5,
        windowMs: 900000,
      },
      subscriber: {
        enabled: true,
        categoryName: 'Abonné',
      },
    },
  },
};
```

---

## 6. Points d'intégration

### 6.1 Interface Plugin 2 (Auth) — Contrat d'interface

Le Plugin 2 (authentification avancée) n'est pas implémenté dans ce plugin. Cependant, les points d'extension sont définis dès maintenant pour garantir la compatibilité future.

#### Interface attendue du Plugin 2

```typescript
// Interface attendue — plugin::auth.auth-service
// Plugin 2 doit exposer ce service pour que Plugin 1 puisse l'utiliser

interface AuthPluginService {
  // Récupère l'utilisateur authentifié depuis le contexte Koa (JWT, session, etc.)
  getCurrentUser(ctx: Strapi.Context): Promise<AuthUser | null>;

  // Vérifie si un utilisateur est authentifié dans la requête en cours
  isAuthenticated(ctx: Strapi.Context): boolean;
}

interface AuthUser {
  id: number;
  documentId: string;
  email: string;
  firstname: string;
  blocked: boolean;
  userCategories: Array<{ slug: string }>;
}
```

#### Stratégie de détection (fail-safe)

Dans le controller et les services, la présence du Plugin 2 est vérifiée dynamiquement :

```
if (strapi.plugin('auth')) {
  // Plugin 2 présent : utiliser l'utilisateur authentifié pour pré-remplir les champs
  const authService = strapi.plugin('auth').service('auth');
  const currentUser = await authService.getCurrentUser(ctx);
  // → pré-remplir email, firstname, associer author à la création
} else {
  // Mode anonyme : commentaire sans author, email/firstname saisis manuellement
}
```

**Principe** : Le Plugin 1 est 100% standalone. Le Plugin 2 est une amélioration optionnelle, jamais une dépendance requise.

### 6.2 Compatibilité i18n / traduction

Le plugin est compatible avec les plugins de traduction Strapi (Deepl, Translate, etc.) par conception :

**Content-type `comment`** :
- `draftAndPublish: false` — les commentaires ne sont pas localisables (une discussion est liée à un document dans une locale donnée)
- La locale est déterminée par `relatedDocumentId` — c'est l'article parent qui porte la locale
- Le plugin n'active PAS `i18n: true` sur le content-type `comment` (un commentaire n'est pas traduit)

**Champ `content`** :
- Type `text` standard, sans directive i18n
- Les plugins de traduction automatique de Strapi n'interfèrent pas avec le content-type comment (non activé pour la localisation)

**Interface admin** :
- Le plugin ne possède pas d'interface admin custom (pas de dossier `admin/`)
- La modération se fait via le Content Manager Strapi natif, qui supporte nativement l'i18n

**Compatibilité confirmée avec** :
- `strapi-plugin-translate` (Deepl)
- `@strapi/plugin-i18n` (natif Strapi)

### 6.3 Hooks et événements lifecycle

Le plugin expose des lifecycle hooks pour permettre à l'application hôte de se brancher sur les événements commentaires.

#### Événements émis (via `strapi.eventHub`)

| Événement | Payload | Description |
|-----------|---------|-------------|
| `comment.created` | `{ comment, document }` | Nouveau commentaire approuvé créé |
| `comment.replied` | `{ reply, parentComment, document }` | Réponse créée |
| `comment.blocked` | `{ comment, blockedBy }` | Commentaire bloqué par admin |
| `comment.approved` | `{ comment }` | Commentaire approuvé (si `requireApproval: true`) |
| `comment.author.blocked` | `{ user }` | Auteur bloqué |

**Usage par l'application hôte** :

```
// Dans le bootstrap de l'application hôte
strapi.eventHub.on('comment.created', async ({ comment, document }) => {
  // Envoyer une notification email, mettre à jour un cache, etc.
});
```

#### Lifecycle hooks internes (Document Service)

Le plugin souscrit au lifecycle `beforeCreate` sur son propre content-type pour appliquer le pipeline de validation (profanity, recaptcha, blocked user check) en complément des middlewares de route.

---

## 7. Décisions techniques (ADR)

### ADR-01 — Limitation à N-1 niveaux de réponse

**Contexte** : Les systèmes de commentaires imbriqués (Reddit, Hacker News) permettent une récursivité théoriquement illimitée. Ce modèle est techniquement complexe à implémenter, à modérer et à afficher.

**Décision** : Limiter à un seul niveau de réponse (réponse à un commentaire racine uniquement). Un commentaire qui est lui-même une réponse (`parent !== null`) ne peut pas recevoir de réponse.

**Justification** :
- UX : La majorité des sections commentaires web modernes (YouTube, Facebook, LinkedIn) limitent à 1-2 niveaux. Au-delà, la lisibilité se dégrade.
- Performance : Les arbres récursifs profonds nécessitent des requêtes récursives (WITH RECURSIVE en SQL) ou plusieurs allers-retours API. N-1 permet une jointure simple `parent + children`.
- Modération : Un thread plat à 2 niveaux est plus facile à modérer et à bloquer.
- Implémentation : `children` se charge en une seule requête avec `populate: ['children']`. Pas de récursivité infinie dans le service.

**Enforcement** : Dans `services/comment.ts → createReply()`, vérification que `parentComment.parent === null`. Si un `parentId` pointe vers une réponse existante, l'API retourne 400 avec le message `"Les réponses ne peuvent pas être imbriquées au-delà d'un niveau"`.

**Compromis nommé** : Certains cas d'usage avancés (forums, Q&A) nécessitent une récursivité profonde. Pour ces cas, un plugin dédié type forum serait plus adapté. Ce plugin cible les sections commentaires de blogs et sites éditoriaux.

---

### ADR-02 — Logique avatar côté API, rendu côté client

**Contexte** : Les avatars de commentaires peuvent être générés de plusieurs façons : image uploadée, Gravatar, génération serveur-side (PNG/SVG), ou données brutes (initiale + couleur) rendues côté client.

**Décision** : Le plugin génère et persiste uniquement `{ initial: string, color: string }` via `services/avatar.ts`. Le rendu visuel (SVG, CSS, canvas) est entièrement délégué au frontend.

**Justification** :
- RGESN 2024 : Pas de génération d'image serveur-side (pas de `canvas`, `sharp`, `puppeteer`). Zero octet d'image transféré pour les avatars.
- Performance : Les avatars textuels CSS sont renderés instantanément sans requête réseau.
- Framework-agnostic : Un développeur Next.js, Vue, ou vanilla JS reçoit les mêmes données et les rend selon son propre design system.
- Maintenabilité : Pas de dépendance à une librairie de génération d'image dans le plugin.

**Format de réponse API** :
```json
{
  "avatar": {
    "initial": "F",
    "color": "#B5EAD7"
  }
}
```

**Compromis nommé** : Si l'application hôte ne gère pas le rendu d'avatar, les initiales ne s'affichent pas. La documentation du plugin doit fournir des exemples de rendu CSS/HTML pour les cas les plus courants.

---

### ADR-03 — Stratégie rate limiting : mémoire vs Redis

**Contexte** : Le rate limiting peut être implémenté en mémoire (Map JavaScript) ou via un store externe (Redis, Memcached).

**Décision** : Implémentation en mémoire par défaut, avec interface injectable pour store externe.

**Justification** :
- Zéro dépendance additionnelle pour les cas d'usage standard (site single-node).
- Un hébergement Strapi typique (EC2 single instance, Docker single container) n'a pas besoin de Redis pour le rate limiting.
- La fenêtre de 15 minutes / 5 soumissions est adaptée aux attaques de spam simples.

**Interface injectable** : `config.rateLimit.store` accepte un objet implémentant l'interface `RateLimitStore` :

```typescript
interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<number>;
  reset(key: string): Promise<void>;
}
```

L'implémentation mémoire par défaut implémente cette interface. Un utilisateur avancé peut injecter une implémentation Redis dans la config du plugin.

**Compromis nommé** : Sur un déploiement multi-instances (load balancer), le rate limiting en mémoire n'est pas partagé entre les nœuds. La documentation doit explicitement mentionner cette limitation et recommander l'injection d'un store Redis partagé dans ce cas.

---

### ADR-04 — Filtre anti-injures : service injectable, fail-open par défaut

**Contexte** : `leo-profanity` est une librairie légère (MIT), mais son dictionnaire peut avoir des faux positifs. La stratégie en cas d'erreur (ou faux positif) doit être définie.

**Décision** :
- `leo-profanity` comme implémentation par défaut
- Service wrapper injectable (`profanityFilter` dans config)
- Fail-open par défaut (`failOpen: true`) — une erreur du filtre ne bloque pas la soumission
- Option `action: 'flag'` pour modération manuelle plutôt que rejet

**Justification** :
- UX : Un faux positif (mot innocent détecté comme injure) bloque la soumission d'un utilisateur légitime, ce qui est plus néfaste qu'un commentaire légèrement problématique qui sera modéré manuellement.
- Extensibilité : Un client peut vouloir un dictionnaire custom (termes métier sectoriels, langue régionale). L'interface injectable permet de brancher n'importe quelle logique de filtre.

**Interface injectable** :
```typescript
interface ProfanityFilterService {
  check(text: string): boolean;
}

// Dans config du plugin :
// profanityFilter.customFilter = (text: string) => boolean
```

**Compromis nommé** : `leo-profanity` en français a une couverture moins exhaustive qu'en anglais. Les injures argotiques récentes ou les contournements orthographiques (leetspeak) peuvent passer. Pour les sites à modération stricte, activer `requireApproval: true` en complément.

---

## 8. Évaluation complexité et risques

### 8.1 Complexité globale : **L** (Large — 3 à 5 jours de développement)

| Composant | Complexité | Justification |
|-----------|-----------|---------------|
| Structure plugin + content-types | XS | Scaffolding standard Strapi V5 |
| Service comment (CRUD + arbre N-1) | S | Logique arbre simple, Document Service API |
| Service profanity (leo-profanity) | XS | Wrapper simple |
| Service reCAPTCHA | XS | Appel HTTP + score check |
| Service avatar | XS | Hash déterministe + palette |
| Service subscriber (findOrCreate User) | S | Interaction users-permissions, edge cases |
| Middlewares (rate-limit, sanitize) | S | Rate limit en mémoire, sanitize XSS |
| Extension modèle User (register.ts) | M | API extension Strapi V5 — documentation sparse |
| Routes admin modération | S | Policy is-admin + CRUD basique |
| Tests unitaires (services purs) | S | Services avatar, profanity facilement testables |
| Publication NPM + CI | XS | Standard ISOMORPH |

### 8.2 Risques techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|------------|--------|-----------|
| Extension du modèle User (`users-permissions`) instable entre versions Strapi V5 | Moyenne | Haut | Isoler dans `register.ts`, fail-safe si extension impossible, tests sur V5 LTS |
| Faux positifs `leo-profanity` FR bloquant des utilisateurs légitimes | Haute | Moyen | Action `flag` par défaut, documentation claire, interface injectable |
| Rate limiting contournable par rotation IP | Moyenne | Faible | Compléter avec reCAPTCHA V3, acceptable pour un plugin généraliste |
| Dépendance `xss` (sanitisation) si choisie — maintenabilité | Faible | Faible | Implémentation inline légère en alternative |
| Performance `strapi.documents()` sur volumes > 10K commentaires | Faible | Haut | Index PostgreSQL dès la conception (listés section 3.1) |
| Compatibilité rompue lors de futures mises à jour Strapi V5.x | Moyenne | Haut | Peer dependency `@strapi/strapi: ^5.0.0`, tests CI sur plusieurs versions |

### 8.3 Dépendances npm

| Package | Rôle | Licence | Poids |
|---------|------|---------|-------|
| `leo-profanity` | Filtre anti-injures FR/EN | MIT | ~8 Ko |
| `xss` (optionnel) | Sanitisation XSS | MIT | ~15 Ko gzippé |
| `zod` | Validation inputs (déjà présent dans Strapi V5) | MIT | Pas de surcoût |

**Pas de dépendances lourdes**. `sharp`, `canvas`, `puppeteer`, `redis` ne sont pas des dépendances directes — ils sont optionnellement injectables via la configuration.

---

## Annexes

### Annexe A — Checklist sécurité OWASP avant publication NPM

- [ ] A01 Broken Access Control : routes admin protégées par policy `is-admin`, jamais auth false
- [ ] A02 Cryptographic Failures : aucun secret stocké en clair, clé reCAPTCHA uniquement en variable d'environnement
- [ ] A03 Injection : Zod validation sur tous les inputs, sanitisation XSS avant persistance, Document Service API (pas de SQL brut)
- [ ] A04 Insecure Design : rate limiting activé par défaut, reCAPTCHA activé par défaut
- [ ] A05 Security Misconfiguration : config fail-closed pour reCAPTCHA en production, pas de endpoints de debug exposés
- [ ] A06 Vulnerable Components : `leo-profanity` audité, pas de dépendances transitives avec CVE connues
- [ ] A07 Auth Failures : `is-admin` policy sur toutes les routes de modération, pas de bypass possible
- [ ] A08 Software Integrity : publication NPM depuis pipeline CI uniquement, pas de publication manuelle
- [ ] A09 Logging : événements lifecycle loggés, erreurs rate-limit loggées sans PII
- [ ] A10 SSRF : l'appel vers Google Siteverify est le seul appel externe sortant, URL hardcodée (pas configurable)

### Annexe B — Payload de réponse API public (format attendu)

```json
GET /api/comments?relatedDocumentId=abc123&relatedCollection=api::article.article

{
  "data": [
    {
      "id": 1,
      "documentId": "xyz789",
      "firstname": "Florent",
      "content": "Super article !",
      "createdAt": "2026-03-22T10:00:00.000Z",
      "avatar": {
        "initial": "F",
        "color": "#B5EAD7"
      },
      "children": [
        {
          "id": 2,
          "documentId": "abc456",
          "firstname": "Marie",
          "content": "Tout à fait d'accord.",
          "createdAt": "2026-03-22T11:00:00.000Z",
          "avatar": {
            "initial": "M",
            "color": "#FFD7A8"
          },
          "children": []
        }
      ]
    }
  ],
  "meta": {
    "pagination": {
      "page": 1,
      "pageSize": 25,
      "total": 1
    }
  }
}
```

**Champs JAMAIS exposés dans les réponses API publiques** : `email`, `author.id`, `author.email`, `blocked`, `approved`, `relatedDocumentId` brut (déjà connu du client).

---

*Document produit par BLUEPRINT — ISOMORPH. Transmis à FORGE pour implémentation.*
*Prochain livrable attendu : code source complet du plugin sur branche `feature/strapi-plugin-comments-v5`.*
