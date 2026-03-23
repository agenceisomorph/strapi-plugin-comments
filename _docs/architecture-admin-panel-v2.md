# Architecture technique — Panneau admin du plugin `strapi-plugin-comments`

**Agent** : BLUEPRINT — Architecte technique ISOMORPH
**Date** : 2026-03-22
**Version** : 2.0 — Extension admin panel
**Statut** : Document décisionnel — transmis à FORGE pour implémentation
**Document parent** : `architecture-plugin-comments-v5.md` (v1.0, server-only)

---

## Sommaire

1. [Analyse des exigences et contraintes architecturales](#1-analyse-des-exigences-et-contraintes-architecturales)
2. [Évolutions du schéma server](#2-évolutions-du-schéma-server)
3. [Architecture du panneau admin](#3-architecture-du-panneau-admin)
4. [Intégration dans la sidebar Strapi](#4-intégration-dans-la-sidebar-strapi)
5. [Stratégie API admin](#5-stratégie-api-admin)
6. [Schéma des couches applicatives mis à jour](#6-schéma-des-couches-applicatives-mis-à-jour)
7. [ADR — Décisions techniques](#7-adr--décisions-techniques)
8. [Évaluation complexité et risques](#8-évaluation-complexité-et-risques)
9. [Checklist pré-implémentation FORGE](#9-checklist-pré-implémentation-forge)

---

## 1. Analyse des exigences et contraintes architecturales

### 1.1 Contrainte fondamentale : optionnalité du panneau admin

Le panneau admin est un enrichissement optionnel. Le plugin doit rester pleinement fonctionnel en mode server-only (sans le dossier `admin/`). Cette contrainte impose :

- Aucune dépendance circulaire entre `server/` et `admin/`
- Le build de la partie server ne doit pas référencer les artefacts admin
- Les routes admin server (`/admin/comments`, `/admin/reports`) existent indépendamment de l'interface React

La convention Strapi V5 supporte nativement ce cas : un plugin peut n'avoir qu'un dossier `server/` si aucun fichier `strapi-admin.js` n'est déclaré dans les exports `package.json`.

### 1.2 Contraintes techniques identifiées

| Contrainte | Impact |
|------------|--------|
| Pilier RGAA 4.1 | Le Design System Strapi (`@strapi/design-system`) est RGAA-conforme nativement. Ne pas contourner ses composants avec des éléments HTML bruts. Rôles ARIA sur les tableaux de données. |
| Pilier RGESN 2024 | Pas de dépendances externes supplémentaires pour l'admin. Réutiliser le Design System et l'éditeur natif Strapi. Code-splitting obligatoire (dynamic import de chaque page). |
| Pilier Core Web Vitals | L'admin Strapi est un SPA interne. Les CWV s'appliquent au panel hôte, pas au plugin. Focus sur la performance des appels API (pagination, index DB). |
| Pilier OWASP 2025 | Toutes les routes admin server protégées par `plugin::comments.is-admin`. Validation Zod sur les inputs des formulaires admin. Le WYSIWYG produit du HTML : sanitisation XSS obligatoire avant stockage. |

### 1.3 Dépendances nouvelles requises

| Package | Version | Rôle | Périmètre |
|---------|---------|------|-----------|
| `@strapi/design-system` | `^2.0.0` | Composants UI admin | admin (peer) |
| `@strapi/icons` | `^2.0.0` | Icônes SVG Strapi | admin (peer) |
| `@strapi/admin` | `^5.0.0` | Hooks `useFetchClient`, `useStrapiApp` | admin (peer) |
| `react` | `^18.0.0` | Rendu UI | admin (peer) |
| `react-dom` | `^18.0.0` | Rendu UI | admin (peer) |
| `react-intl` | `^6.0.0` | Internationalisation | admin (peer) |
| `react-router-dom` | `^6.0.0` | Routing SPA admin | admin (peer) |

Toutes ces dépendances sont déclarées en `peerDependencies` dans `package.json` — elles sont déjà présentes dans l'application Strapi hôte. Ne pas les déclarer en `dependencies` pour ne pas les dupliquer dans le bundle.

---

## 2. Évolutions du schéma server

### 2.1 Modifications du content-type `comment`

Deux champs sont ajoutés au schéma existant (`server/src/content-types/comment/schema.json`) :

#### Champ `contentHtml` (réponse admin WYSIWYG)

```
"contentHtml": {
  "type": "richtext",
  "required": false,
  "description": "HTML sanitisé produit par le WYSIWYG admin pour les réponses admin.
                   Null pour les commentaires utilisateurs standards."
}
```

**Justification** : Le champ `content` existant est un `text` plain, limité à 2000 caractères, adapté aux commentaires utilisateurs. Les réponses admin peuvent contenir du formatage riche (gras, liens, listes). Séparer les deux formats évite toute ambiguïté de rendu côté frontend : si `contentHtml` est non-null, le frontend rend le HTML (après sanitisation côté client via DOMPurify) ; sinon il rend `content` en text brut.

#### Champ `isAdminReply` (flag de réponse admin)

```
"isAdminReply": {
  "type": "boolean",
  "default": false,
  "required": true,
  "description": "true si ce commentaire est une réponse créée depuis le panneau admin."
}
```

**Justification** : Permet au frontend d'afficher les réponses admin avec un style distinctif (badge "Équipe", avatar différent) sans requête supplémentaire. Le filtre `isAdminReply: false` sur les listes publiques reste optionnel — les réponses admin sont des commentaires valides, visibles publiquement.

#### Alerte sur la relation `author` dans le schéma actuel

Le schéma actuel (section 3.1 du document v1.0) déclare `"inversedBy": "comments"` sur la relation `author`. D'après BUG-004, cet `inversedBy` vers un modèle externe (`users-permissions.user`) est invalide en Strapi V5. Ce résidu doit être corrigé dans le schéma lors de la même passe d'implémentation.

### 2.2 Nouveau content-type `report`

**UID Strapi** : `plugin::comments.report`
**Table PostgreSQL** : `comments_reports`
**Kind** : `collectionType`

```
Fichier : server/src/content-types/report/schema.json

Champs :
  "reason" : enum
    Valeurs : ["offensive", "spam", "harassment", "misinformation", "other"]
    Requis : true

  "description" : text
    Requis : false
    maxLength : 500
    Description : "Précision optionnelle fournie par le signalant"

  "reporterEmail" : email
    Requis : true
    Description : "Email du signalant — non affiché publiquement"

  "comment" : relation manyToOne → plugin::comments.comment
    Requis : true
    Description : "Commentaire signalé"
    Note : PAS d'inversedBy (relation unidirectionnelle, conforme BUG-004)

  "status" : enum
    Valeurs : ["pending", "reviewed", "dismissed"]
    Default : "pending"
    Requis : true
    Description : "État de traitement du signalement"

Options :
  draftAndPublish : false
  pluginOptions :
    content-manager.visible : false   -- masqué du content-manager natif
    content-type-builder.visible : false
```

### 2.3 Nouvelles routes server

#### Routes admin (ajout au fichier `server/src/routes/admin/moderation.ts`)

Les routes existantes couvrent `findAll`, `findOne`, `approve`, `block`, `blockAuthor`, `delete`. À ajouter :

```
GET    /admin/stats
  handler : moderation.getStats
  description : "Compte total, en attente, approuvés, bloqués, signalements en attente"

POST   /admin/comments/:id/reply
  handler : moderation.adminReply
  description : "Crée une réponse admin avec contenu WYSIWYG"

GET    /admin/reports
  handler : report.findAll
  description : "Liste les signalements avec filtres (status, commentId)"

PUT    /admin/reports/:id/review
  handler : report.markReviewed
  description : "Marque un signalement comme examiné"

PUT    /admin/reports/:id/dismiss
  handler : report.dismiss
  description : "Rejette un signalement"

GET    /admin/config
  handler : moderation.getConfig
  description : "Lecture de la configuration courante du plugin"

PUT    /admin/config
  handler : moderation.updateConfig
  description : "Mise à jour des paramètres du plugin depuis l'interface admin"
```

Toutes protégées par `policies: ['plugin::comments.is-admin']`, conformément au pattern établi.

#### Route content-api publique (ajout)

```
POST   /reports
  handler : report.create
  config :
    type : 'content-api'
    auth : false   -- signalement anonyme autorisé
    middlewares :
      - plugin::comments.rate-limit   -- réutilisation du middleware existant
      - plugin::comments.sanitize-input
  description : "Soumet un signalement depuis le frontend"
```

### 2.4 Nouveaux services server

#### `server/src/services/report.ts`

```
Méthodes :
  create(data) → Report
    Valide les données (Zod)
    Crée l'entrée report
    Vérifie si le seuil d'auto-masquage est atteint
    Si seuil atteint : appelle comment.block(commentId)

  findAll(filters, pagination) → { data, pagination }
    Filtres : status, commentId
    Tri par défaut : createdAt DESC

  markReviewed(id) → Report
  dismiss(id) → Report

  countPending() → number
    Utilisé par le badge admin
```

#### `server/src/services/admin-stats.ts`

```
Méthodes :
  getStats() → AdminStats
    Retourne :
      totalComments    : number
      pendingApproval  : number  (approved=false, blocked=false)
      approvedComments : number
      blockedComments  : number
      pendingReports   : number
    Toutes les valeurs récupérées en une seule passe via COUNT GROUP BY
    (optimisation : une requête DB, pas cinq)
```

#### Extension `server/src/services/comment.ts`

```
Méthodes à ajouter :
  adminReply(commentId, { contentHtml, adminEmail }) → Comment
    Crée un commentaire enfant avec :
      parent : commentId
      contentHtml : sanitisé via xss (déjà dépendance)
      isAdminReply : true
      approved : true    -- toujours approuvé, même si modération activée
      blocked : false
      firstname : 'Admin'   -- ou valeur configurable
      email : adminEmail

  getConfig() → PluginConfig
    Proxy vers strapi.config.get('plugin::comments')

  updateConfig(data) → void
    Note : En Strapi V5, la config est lue depuis plugin-config.js/ts
    du projet hôte. Elle ne peut PAS être modifiée en runtime via l'API.
    Voir ADR-004 pour la décision sur ce point.
```

### 2.5 Nouveau contrôleur `server/src/controllers/report.ts`

```
Méthodes :
  create(ctx)      → appelle services.report.create
  findAll(ctx)     → appelle services.report.findAll
  markReviewed(ctx) → appelle services.report.markReviewed
  dismiss(ctx)     → appelle services.report.dismiss
```

---

## 3. Architecture du panneau admin

### 3.1 Arborescence complète `admin/`

```
admin/
├── src/
│   ├── index.ts                        # Point d'entrée admin — registration du plugin
│   ├── pluginId.ts                     # Constante du nom du plugin
│   │
│   ├── components/
│   │   ├── PluginIcon.tsx              # Icône MessageSquare (@strapi/icons)
│   │   └── Initializer.tsx             # Composant de bootstrap admin (fetch du badge)
│   │
│   ├── pages/
│   │   ├── App.tsx                     # Router racine du plugin (React Router)
│   │   ├── Dashboard/
│   │   │   └── index.tsx               # Page tableau de bord (stats)
│   │   ├── CommentsList/
│   │   │   └── index.tsx               # Page liste des commentaires
│   │   ├── Reports/
│   │   │   └── index.tsx               # Page liste des signalements
│   │   └── Settings/
│   │       └── index.tsx               # Page configuration du plugin
│   │
│   ├── hooks/
│   │   ├── useComments.ts              # Fetch + mutations sur /admin/comments
│   │   ├── useReports.ts               # Fetch + mutations sur /admin/reports
│   │   ├── useStats.ts                 # Fetch sur /admin/stats (badge + dashboard)
│   │   └── usePluginConfig.ts          # Fetch sur /admin/config
│   │
│   └── translations/
│       ├── en.json                     # Traductions anglaises
│       └── fr.json                     # Traductions françaises
│
├── custom.d.ts                         # Déclarations TypeScript pour les assets
├── tsconfig.json                       # Config TypeScript dev
└── tsconfig.build.json                 # Config TypeScript build production
```

### 3.2 Fichier `admin/src/index.ts` — Structure

Le point d'entrée respecte l'API Plugin Admin V5 documentée.

```
Exports :
  register(app) :
    - app.registerPlugin({ id: pluginId, name: 'Comments' })
    - app.addMenuLink({
        to: `/plugins/${pluginId}`,
        icon: PluginIcon,
        intlLabel: { id: `${pluginId}.plugin.name`, defaultMessage: 'Comments' },
        Component: async () => import('./pages/App'),
        permissions: []   -- accessible à tous les rôles admin pour l'instant
      })

  bootstrap(app) :
    - Montage de l'Initializer (voir section 3.3)

  registerTrads(async({ locale }) → ...) :
    - Import dynamique de translations/${locale}.json
    - Fallback silencieux si locale inconnue
```

Note sur le badge : La documentation officielle V5 (consultée lors de l'élaboration de ce document) ne mentionne pas de paramètre `badgeContent` dans `addMenuLink()`. La stratégie de badge est traitée dans l'ADR-001.

### 3.3 Composant `Initializer.tsx`

Ce composant est monté une seule fois dans le `bootstrap` admin. Son rôle : effectuer la requête initiale vers `/admin/stats` et injecter le compteur de modération en attente dans le store Redux admin.

```
Comportement :
  - Rendu : null (composant invisible)
  - Au montage : fetch GET /admin/stats via useFetchClient
  - Met à jour le store Redux local du plugin avec { pendingApproval, pendingReports }
  - Si erreur réseau ou 403 : fail silently (ne pas bloquer l'admin)
```

Le badge est affiché via le mécanisme décrit dans ADR-001.

### 3.4 Composant `App.tsx` — Router

```
Routes React Router (relatives au préfixe /plugins/comments) :
  /           → <Dashboard />
  /comments   → <CommentsList />
  /reports    → <Reports />
  /settings   → <Settings />
```

### 3.5 Page `Dashboard/index.tsx`

```
Composants @strapi/design-system utilisés :
  - Box, Flex, Grid : layout
  - Typography : titres de section
  - Status ou Badge : indicateurs colorés par état

Données affichées (depuis useStats) :
  - Carte "Total" : totalComments
  - Carte "En attente" : pendingApproval (fond orange si > 0)
  - Carte "Approuvés" : approvedComments
  - Carte "Bloqués" : blockedComments
  - Carte "Signalements en attente" : pendingReports (fond rouge si > 0)

Accessibilité :
  - Chaque carte est un <article> avec aria-label descriptif
  - Les valeurs numériques ont aria-live="polite" pour les mises à jour
```

### 3.6 Page `CommentsList/index.tsx`

```
Composants @strapi/design-system utilisés :
  - Table, Thead, Tbody, Tr, Td, Th : tableau de données
  - Pagination : navigation pages
  - Select, TextInput : filtres
  - Button, IconButton : actions en ligne
  - Dialog, DialogBody, DialogFooter : confirmation de suppression
  - Badge : affichage du statut (approved, blocked, pending)

Filtres disponibles (query params) :
  - status : "pending" | "approved" | "blocked" | "all"
  - relatedCollection : string (filtre par collection cible)
  - dateFrom, dateTo : plage de dates

Colonnes du tableau :
  - Auteur (firstname + email)
  - Contenu (tronqué à 80 chars)
  - Collection cible
  - Date
  - Statut (Badge)
  - Actions : Approuver | Bloquer | Répondre | Supprimer

Action "Répondre" :
  - Ouvre un Dialog modal contenant l'éditeur WYSIWYG natif Strapi
  - Voir ADR-002 sur le choix de l'éditeur

Accessibilité :
  - <table> avec caption décrivant le contenu
  - En-têtes de colonnes avec scope="col"
  - Les boutons d'action ont aria-label contextualisé (ex: "Approuver le commentaire de Jean")
  - Focus retourné au déclencheur après fermeture du Dialog
  - Navigation clavier sur les actions en ligne
```

### 3.7 Page `Reports/index.tsx`

```
Structure identique à CommentsList.
Colonnes du tableau :
  - Motif (reason, traduit)
  - Description
  - Email du signalant
  - Commentaire signalé (lien vers CommentsList avec filtre)
  - Date
  - Statut (Badge)
  - Actions : Marquer examiné | Rejeter

Filtres : status ("pending" | "reviewed" | "dismissed")
```

### 3.8 Page `Settings/index.tsx`

Voir ADR-004 pour les limites de la configuration runtime en Strapi V5.

```
Champs affichés en lecture seule (config actuelle du projet hôte) :
  - moderation.enabled : boolean
  - recaptcha.enabled : boolean
  - reportThreshold : number
  - allowedCollections : string[]

Comportement :
  - Les valeurs sont lues depuis GET /admin/config
  - Un message d'information explique que la configuration se modifie
    dans le fichier config/plugins.js du projet hôte Strapi
  - Pas de formulaire d'édition (voir ADR-004)
```

### 3.9 Hooks admin — Pattern uniforme

Tous les hooks suivent le même pattern basé sur `useFetchClient` de `@strapi/admin/strapi-admin`.

```
Pattern type pour useComments :

  État local :
    data : Comment[]
    pagination : { page, pageSize, total }
    isLoading : boolean
    error : Error | null
    filters : CommentFilters

  Fonctions exposées :
    fetchComments(filters, pagination) → void
    approveComment(id) → Promise<void>
    blockComment(id) → Promise<void>
    deleteComment(id) → Promise<void>
    replyToComment(id, { contentHtml }) → Promise<void>

  Implémentation :
    useFetchClient() retourne { get, post, put, del }
    Appels vers /comments/admin/* (préfixe plugin automatique Strapi)
    Gestion d'erreur : useNotification() de @strapi/admin pour les toasts
```

Note sur SWR : bien que le plugin Vercel ait injecté le contexte SWR dans cette session, SWR n'est PAS utilisé ici. Le panel admin Strapi dispose de son propre `useFetchClient` et de son store Redux. Introduire SWR dans le bundle admin ajouterait une dépendance redondante. La gestion d'état reste en `useState`/`useReducer` local avec `useFetchClient`. Voir ADR-003.

---

## 4. Intégration dans la sidebar Strapi

### 4.1 Registration du lien menu

La méthode `app.addMenuLink()` de l'API Plugin Admin V5 ajoute une entrée dans la navigation latérale principale de Strapi. Le composant `PluginIcon` sera basé sur l'icône `Message` ou `MessageSquare` de `@strapi/icons`.

### 4.2 Stratégie de badge de notification

La documentation officielle V5 ne documente pas de paramètre `badgeContent` natif sur `addMenuLink()`. L'approche retenue est documentée dans ADR-001.

En résumé : le badge est implémenté via le store Redux interne du plugin. L'`Initializer` (monté dans `bootstrap`) fetch les stats au démarrage de l'admin et stocke le compteur. Le composant `PluginIcon` accède au store via `useSelector` et affiche conditionnellement un badge superposé sur l'icône.

```
Flux :
  bootstrap → <Initializer /> → GET /admin/stats
             → dispatch({ pendingApproval + pendingReports })
             → PluginIcon lit le store → affiche badge si total > 0
```

### 4.3 Exports `package.json` à ajouter

L'activation du panneau admin nécessite deux ajouts au `package.json` du plugin :

#### Champ `exports` — ajout de l'entrée admin

```json
"./strapi-admin": {
  "source": "./admin/src/index.ts",
  "import": "./dist/admin/index.mjs",
  "require": "./dist/admin/index.js",
  "default": "./dist/admin/index.js"
}
```

#### Champ `files` — inclure le dist admin

```json
"files": [
  "dist",
  "strapi-server.js",
  "strapi-admin.js"
]
```

#### Fichier passerelle `strapi-admin.js` (racine du plugin)

Equivalent du `strapi-server.js` pour la partie admin. Applique le même pattern de déréférencement `mod.default || mod` (BUG-009) :

```
const mod = require('./dist/admin/index.js');
module.exports = mod.default || mod;
```

#### Champ `strapi` dans `package.json`

Confirmer que le champ `strapi` déclare bien l'existence d'un panneau admin. La convention Strapi V5 détecte automatiquement la partie admin si l'export `./strapi-admin` est présent dans `exports`.

### 4.4 Configuration TypeScript admin

#### `admin/tsconfig.json`

```
compilerOptions :
  target : ES2020
  module : ESNext
  moduleResolution : Bundler
  jsx : react-jsx
  strict : true
  baseUrl : ./src
  paths : { "@/*": ["./*"] }
  types : ["react", "react-dom"]

include : ["src/**/*", "custom.d.ts"]
exclude : ["node_modules", "dist"]
```

#### `admin/tsconfig.build.json`

```
extends : ./tsconfig.json
compilerOptions :
  outDir : ../../dist/admin
  declaration : true
  declarationDir : ../../dist/admin
  sourceMap : false

include : ["src/**/*"]
```

#### Ajout au script `build` du `package.json`

Le build actuel ne compile que la partie server. Il faut compiler les deux :

```
"build": "tsc -p server/tsconfig.build.json && vite build --config admin/vite.config.ts"
```

Note critique : La partie admin d'un plugin Strapi V5 est compilée avec **Vite** (bundler ESM), pas avec `tsc` directement. Strapi utilise en interne `@strapi/plugin-sdk` qui wrappe Vite. FORGE devra vérifier la configuration Vite attendue pour les plugins V5 et ne pas tenter de compiler l'admin avec `tsc` seul.

---

## 5. Stratégie API admin

### 5.1 Préfixage automatique des routes admin

Rappel BUG-010 : Strapi V5 préfixe automatiquement les routes d'un plugin avec `/${pluginName}`. Les routes admin sont accessibles à `/comments/admin/*` (pas `/api/comments/admin/*`). Le panel admin Strapi appelle ces routes via son proxy interne.

### 5.2 Endpoints admin finaux (URL complètes)

```
GET    /comments/admin/stats
GET    /comments/admin/comments               ?page=1&pageSize=20&status=pending
GET    /comments/admin/comments/:id
PUT    /comments/admin/comments/:id/approve
PUT    /comments/admin/comments/:id/block
PUT    /comments/admin/comments/:id/block-author
DELETE /comments/admin/comments/:id
POST   /comments/admin/comments/:id/reply

GET    /comments/admin/reports                ?status=pending&page=1
PUT    /comments/admin/reports/:id/review
PUT    /comments/admin/reports/:id/dismiss

GET    /comments/admin/config
```

### 5.3 Endpoint content-api nouveau

```
POST   /api/comments/reports
```

### 5.4 Format des réponses API

Respecter le format Strapi standard :

```
Réponse paginée :
  {
    data: T[],
    meta: {
      pagination: {
        page: number,
        pageSize: number,
        pageCount: number,
        total: number
      }
    }
  }

Réponse stats :
  {
    data: {
      totalComments: number,
      pendingApproval: number,
      approvedComments: number,
      blockedComments: number,
      pendingReports: number
    }
  }
```

---

## 6. Schéma des couches applicatives mis à jour

```
┌────────────────────────────────────────────────────────────────────┐
│  APPLICATION HÔTE (projet Strapi V5 du client)                     │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  PLUGIN strapi-plugin-comments                               │  │
│  │                                                              │  │
│  │  ┌─────────────────────────────────────────────────────┐     │  │
│  │  │  ADMIN (optionnel — dossier admin/)                  │     │  │
│  │  │                                                      │     │  │
│  │  │  PluginIcon + Initializer  →  Redux store local     │     │  │
│  │  │  React Router : Dashboard | CommentsList |          │     │  │
│  │  │                 Reports   | Settings                │     │  │
│  │  │  Hooks : useComments | useReports | useStats        │     │  │
│  │  │  UI : @strapi/design-system (RGAA natif)            │     │  │
│  │  └─────────────────────┬───────────────────────────────┘     │  │
│  │                        │ useFetchClient                       │  │
│  │                        ▼                                      │  │
│  │  ┌──────────────────────────────────────────────────────┐    │  │
│  │  │  SERVER                                              │    │  │
│  │  │                                                      │    │  │
│  │  │  Middlewares : RateLimit | reCAPTCHA | Sanitize      │    │  │
│  │  │  Controllers : comment | moderation | report         │    │  │
│  │  │  Services : comment | report | admin-stats |         │    │  │
│  │  │             avatar | profanity | recaptcha |         │    │  │
│  │  │             subscriber                               │    │  │
│  │  │  Policies : is-admin                                 │    │  │
│  │  └───────────────────────┬──────────────────────────────┘    │  │
│  │                          │                                    │  │
│  │  ┌───────────────────────▼──────────────────────────────┐    │  │
│  │  │  Content-Types                                       │    │  │
│  │  │  - plugin::comments.comment  (+ contentHtml,         │    │  │
│  │  │                                 isAdminReply)        │    │  │
│  │  │  - plugin::comments.report   (NOUVEAU)               │    │  │
│  │  │  - plugin::comments.user-category                   │    │  │
│  │  └──────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  PostgreSQL : comments_comments | comments_reports |               │
│              comments_user_categories | users (existant)           │
└────────────────────────────────────────────────────────────────────┘

          ▲ REST content-api (/api/comments/*)
          │
┌─────────┴──────────────────┐    ┌──────────────────────────────┐
│  FRONTEND (agnostique)     │    │  STRAPI ADMIN SPA             │
│  React / Next.js / etc.    │    │  /admin/plugins/comments/*   │
│  POST /api/comments/reports│    │  Dashboard | Modération      │
└────────────────────────────┘    └──────────────────────────────┘
```

---

## 7. ADR — Décisions techniques

### ADR-001 — Badge de notification : stratégie d'implémentation

**Contexte** : L'API `addMenuLink()` de Strapi V5 ne documente pas de paramètre `badgeContent` permettant un compteur dynamique natif sur le lien de navigation.

**Options évaluées** :

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Redux store plugin + PluginIcon custom | Contrôle total, pas de dépendance externe | Nécessite un composant wrapper sur l'icône |
| B. Polling HTTP via `setInterval` | Simple à implémenter | Requêtes inutiles, anti-RGESN, charge serveur |
| C. WebSocket Strapi | Temps réel | Non supporté nativement par Strapi V5, surcharge architecturale majeure |
| D. SWR avec refreshInterval | Pattern élégant | SWR non présent dans le bundle admin Strapi — doublon de dépendance |

**Décision** : Option A — Redux store local du plugin.

**Justification** :
- `@strapi/admin` expose `useSelector`/`useDispatch` via `react-redux` déjà bundlé dans l'admin Strapi. Aucune dépendance supplémentaire.
- L'`Initializer` fetch les stats une seule fois au montage du panel admin (performance RGESN : une seule requête, pas de polling).
- Le badge est mis à jour manuellement lors des actions de modération (après `approve`, `block`, `delete`, le hook `useComments` dispatch un refresh des stats).
- Ce pattern est identique à celui utilisé par les plugins Strapi natifs (Content Releases, Review Workflows).

**Compromis accepté** : Le badge n'est pas temps réel. Si un nouveau commentaire arrive pendant qu'un modérateur travaille, le badge ne s'incrémente pas automatiquement. Il se met à jour à la prochaine navigation ou action. Ce comportement est acceptable pour un outil de modération (vs. un chat temps réel).

---

### ADR-002 — Éditeur WYSIWYG : natif Strapi vs. librairie tierce

**Contexte** : L'admin doit permettre la rédaction de réponses avec formatage riche.

**Options évaluées** :

| Option | Avantages | Inconvénients |
|--------|-----------|---------------|
| A. Éditeur natif Strapi (Slate.js via `@strapi/content-manager`) | Zéro dépendance ajoutée, cohérence UX, RGAA assuré par Strapi | API d'intégration moins documentée pour les plugins tiers |
| B. TipTap | Riche, bien documenté, RGAA partiel | +150 Ko bundle, dépendance à maintenir |
| C. Quill.js | Connu, simple | Maintenance ralentie, RGAA insuffisant |
| D. Textarea HTML enrichi (markdown) | Léger | Non WYSIWYG, friction UX |

**Décision** : Option A — Éditeur natif Strapi.

**Justification** :
- Le Design System Strapi expose un composant `BlocksEditor` (editeur Blocks de Strapi V5) réutilisable dans les plugins via `@strapi/blocks-react-renderer`. Strapi V5 a migré son éditeur vers un format "Blocks" (JSON structuré) plutôt que du Markdown pur.
- Zéro ajout au bundle. Cohérence visuelle totale avec le reste de l'admin.
- Le contenu produit est un JSON structuré Strapi Blocks. Il est converti en HTML sanitisé avant stockage dans `contentHtml` via le service `adminReply` côté server (en utilisant `@strapi/blocks-react-renderer` côté server ou une conversion custom).
- RGAA 4.1 garanti par Strapi.

**Compromis accepté** : Le format JSON Blocks Strapi est propriétaire. Si le plugin est migré vers Strapi V6 ou une autre plateforme, la conversion devra être adaptée. Ce risque est jugé acceptable car le plugin est explicitement ciblé Strapi V5+.

**Point de vigilance pour FORGE** : L'API d'intégration du composant BlocksEditor dans un plugin tiers doit être vérifiée dans le code source Strapi avant implémentation. Si l'intégration s'avère bloquée (composant non exporté publiquement), le fallback est TipTap avec `@tiptap/starter-kit` uniquement (pas d'extensions tierces).

---

### ADR-003 — SWR dans l'admin : décision de non-utilisation

**Contexte** : Le système de la session de travail inclut SWR v2 comme dépendance suggérée (contexte Vercel plugin).

**Décision** : SWR n'est PAS utilisé dans le panneau admin du plugin.

**Justification** :
- Le bundle admin Strapi charge déjà `react-query` ou des hooks internes pour la gestion du cache HTTP. Ajouter SWR créerait une duplication de stratégie de cache dans le même bundle.
- `useFetchClient` de `@strapi/admin` est suffisant pour les besoins du plugin (fetch simple, pas de cache distribué, pas d'invalidation inter-composants complexe).
- Les pages admin du plugin n'ont pas besoin de la revalidation automatique `stale-while-revalidate` : les données de modération sont lues à la demande, pas en arrière-plan.
- Ajouter SWR en `peerDependency` forcerait les projets hôtes Strapi à l'installer, même si non utilisé ailleurs.

**Domaine d'application de SWR** : SWR est pertinent côté frontend Next.js pour les listes de commentaires publiques (revalidation en arrière-plan, mise à jour optimiste). Hors périmètre de ce document.

---

### ADR-004 — Configuration runtime : lecture seule dans l'admin

**Contexte** : La page "Settings" de l'admin doit-elle permettre la modification de la configuration du plugin ?

**Analyse** :
En Strapi V5, la configuration d'un plugin est définie dans `config/plugins.js` (ou `.ts`) du projet hôte. Elle est chargée au démarrage de Strapi et injectée dans `strapi.config`. Il n'existe pas d'API officielle pour modifier cette configuration en runtime et la persister (cela nécessiterait d'écrire dans le système de fichiers du projet hôte, ce qui est hors du périmètre d'un plugin).

Les alternatives seraient :
1. Stocker la configuration dans la base de données (table dédiée ou entrée dans `strapi_plugin_store`)
2. Lire depuis `config/plugins.js` (read-only)

**Décision** : La page Settings affiche la configuration en lecture seule (issue de `config/plugins.js`) dans un premier temps. La persistance en base de données via `strapi.store` est prévue en v2.1 du plugin.

**Justification** :
- Implémenter `strapi.store` (key-value store de Strapi) pour persister des paramètres de plugin est une feature distincte, non nécessaire au MVP.
- La lecture de la config courante via `strapi.config.get('plugin::comments')` est déjà implémentée côté server (BUG-006 résolu).
- Une page informative est mieux qu'un formulaire qui ne sauvegarde rien ou qui génère des comportements inattendus.

**Compromis accepté** : L'administrateur Strapi doit modifier la configuration dans les fichiers du projet pour changer les paramètres du plugin. Ce workflow est standard pour les plugins Strapi.

---

### ADR-005 — Seuil d'auto-masquage des signalements

**Contexte** : Combien de signalements déclenchent l'auto-masquage d'un commentaire ?

**Décision** : Seuil configurable via `config/plugins.js`, défaut à 3.

```
// config/plugins.js du projet hôte
module.exports = {
  comments: {
    reportThreshold: 3,   // défaut
    ...
  }
}
```

**Justification** :
- Un seuil de 1 est trop sensible (un seul signalement malveillant masque un commentaire légitime).
- Un seuil de 5 ou plus réduit l'utilité du mécanisme sur les sites à faible trafic.
- 3 est un équilibre raisonnable pour un plugin généraliste. Le rendre configurable permet à chaque projet de l'adapter.
- L'auto-masquage (`blocked: true`) est réversible par un admin via l'action "Démasquer" dans le panneau.

---

## 8. Évaluation complexité et risques

### 8.1 Complexité globale : **L** (3-5 jours)

| Composant | Complexité | Justification |
|-----------|------------|---------------|
| Modifications schémas server (comment + report) | XS | Ajout de champs, nouveau content-type |
| Nouvelles routes + contrôleurs server | S | Pattern établi, routes admin déjà présentes |
| Services adminStats + report | S | Logique métier simple, une requête DB optimisée |
| Fichiers de configuration admin (tsconfig, vite, package.json) | M | Vite pour l'admin est un périmètre nouveau pour ce projet |
| Arborescence admin (index.ts, pluginId, PluginIcon, Initializer) | S | Boilerplate bien documenté |
| Pages React (Dashboard, CommentsList, Reports, Settings) | M | 4 pages avec composants Design System |
| Hooks React (useComments, useReports, useStats) | M | Pattern uniforme, gestion d'erreur |
| Badge Redux + Initializer | M | Intégration store Redux admin Strapi |
| Intégration éditeur WYSIWYG natif | L | Point de risque — API non garantie |

### 8.2 Risques techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| R1. API BlocksEditor non exportée publiquement par Strapi V5 | Moyenne | Moyen | Fallback TipTap défini dans ADR-002 |
| R2. Build Vite de la partie admin — configuration non documentée | Haute | Moyen | Inspecter le Plugin SDK officiel `@strapi/plugin-sdk` avant implémentation |
| R3. Conflit de version Redux entre plugin et admin Strapi | Faible | Haut | Utiliser les hooks Redux exportés par `@strapi/admin`, ne jamais importer `react-redux` directement |
| R4. Préfixage des routes admin plugin différent de l'attendu | Moyenne | Moyen | BUG-010 documenté — tester les URL réelles après intégration |
| R5. Badge non rendu si `addMenuLink()` ne supporte pas d'icône composite | Faible | Faible | Icône sans badge acceptable en MVP si blocant |
| R6. `strapi-admin.js` passerelle — même bug que BUG-009 | Certaine | Critique | Appliquer immédiatement le pattern `mod.default || mod` |

### 8.3 Dépendances critiques (bloquantes pour FORGE)

1. Valider que `@strapi/plugin-sdk` (ou équivalent) produit le bon output de build pour la partie admin — avant d'écrire une seule ligne de composant React.
2. Vérifier l'export public de `BlocksEditor` depuis `@strapi/content-manager` ou `@strapi/design-system` — avant d'implémenter la feature WYSIWYG.
3. Confirmer le préfixe réel des routes admin plugin dans une instance Strapi V5 de test.

---

## 9. Checklist pré-implémentation FORGE

Avant de commencer le code de la partie admin :

- [ ] Confirmer la commande de build Vite pour la partie admin (`@strapi/plugin-sdk` ou configuration Vite manuelle)
- [ ] Vérifier les exports de `@strapi/admin` pour `useFetchClient` et les hooks Redux
- [ ] Confirmer que `BlocksEditor` est accessible depuis un plugin tiers (ou identifier le composant équivalent)
- [ ] Corriger le bug résiduel `inversedBy: "comments"` dans `comment/schema.json` (relation `author`)
- [ ] Ajouter `./strapi-admin` dans les exports de `package.json`
- [ ] Créer `strapi-admin.js` passerelle avec `mod.default || mod` (BUG-009 pattern)
- [ ] Ajouter `strapi-admin.js` dans le champ `files` de `package.json`
- [ ] Déclarer `@strapi/design-system`, `@strapi/icons`, `@strapi/admin` en `peerDependencies`
- [ ] Vérifier que le build server existant n'est pas cassé par les nouveaux fichiers admin
- [ ] Migrer le `tsconfig.build.json` racine pour intégrer les deux parties (ou garder deux commandes séparées)
