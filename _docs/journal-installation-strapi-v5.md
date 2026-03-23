# Journal d'installation — Plugins Strapi V5

**Projet** : Suite Plugins Strapi ISOMORPH
**Maintenu par** : HELM (chef de projet) + FORGE (dev senior)
**Dernière mise à jour** : 2026-03-22

> Ce journal recense tous les problèmes rencontrés lors de l'intégration des plugins
> dans Strapi V5, avec la cause racine et la correction appliquée.
> Il sert de référence pour éviter de reproduire ces erreurs sur les prochains plugins.

---

## BUG-001 — Plugin non reconnu par Strapi (`comments is not installed`)

**Date** : 2026-03-22
**Contexte** : Premier démarrage Strapi avec le plugin installé via `npm install file:../`
**Erreur** : `Error loading the plugin comments because comments is not installed`

**Cause racine** : Le champ `exports` dans `package.json` du plugin bloquait l'accès à `./package.json`. Strapi V5 fait `require('strapi-plugin-comments/package.json')` pour détecter les plugins installés (fichier `get-enabled-plugins.js`). Si `exports` est défini sans inclure `"./package.json"`, Node.js refuse l'accès (ERR_PACKAGE_PATH_NOT_EXPORTED).

**Correction** : Ajouter `"./package.json": "./package.json"` dans le champ `exports` du `package.json` du plugin.

```json
"exports": {
  "./package.json": "./package.json",
  "./strapi-server": {
    "source": "./server/src/index.ts",
    "require": "./dist/server/src/index.js",
    "default": "./dist/server/src/index.js"
  }
}
```

**Règle pour les futurs plugins** : Tout plugin Strapi V5 avec un champ `exports` DOIT inclure `"./package.json": "./package.json"`.

---

## BUG-002 — Chemins `exports` désalignés avec le build TypeScript

**Date** : 2026-03-22
**Contexte** : Le build `tsc` produit dans `dist/server/src/` mais les exports pointaient vers `dist/server/`
**Erreur** : Le plugin se charge mais le point d'entrée n'est pas trouvé

**Cause racine** : Le `tsconfig.build.json` compile `server/src/` vers `dist/server/src/` (préservation de la structure). Mais les exports initiaux pointaient vers `./dist/server/index.mjs` et `./dist/server/index.js` (sans le `src/`).

**Correction** : Aligner les chemins exports avec la sortie réelle du build :
- `"require": "./dist/server/src/index.js"`
- `"main": "./strapi-server.js"` (fichier passerelle qui fait `require('./dist/server/src/index')`)

**Règle** : Toujours vérifier que les chemins dans `exports` correspondent exactement à la sortie de `tsc`. Exécuter `ls dist/server/src/` après le premier build.

---

## BUG-003 — `register.ts` crash : `strapi` undefined ou incomplet

**Date** : 2026-03-22
**Contexte** : Le `register` du plugin crash avec `Cannot read properties of undefined (reading 'contentTypes')`
**Erreur** : `TypeError: Cannot read properties of undefined (reading 'plugin')` puis `Cannot read properties of undefined (reading 'contentTypes')`

**Cause racine** : L'`index.ts` du plugin exportait une factory `({ strapi }) => ({...})` qui capturait `strapi` par closure. Mais en Strapi V5, le `rawModule` est créé par `loadConfigFile` qui n'appelle PAS la factory avec `{ strapi }`. Le module est chargé comme un objet statique, et c'est `createModule(namespace, rawModule, strapi)` qui passe `strapi` aux lifecycle hooks via `rawModule.register({ strapi })`.

Le problème : la factory capturait un `strapi` potentiellement `undefined`, et les closures `register: () => register({ strapi })` utilisaient cette valeur capturée au lieu de l'argument passé par Strapi.

**Correction** : Exporter les lifecycle hooks directement, pas via closure :

```typescript
// AVANT (bugué)
export default ({ strapi }) => ({
  register: () => register({ strapi }),
  bootstrap: () => bootstrap({ strapi }),
  ...
});

// APRÈS (correct)
export default () => ({
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  routes,
  controllers,
  services,
  ...
});
```

Strapi appelle ensuite `rawModule.register({ strapi })` avec la bonne instance.

**Règle** : En Strapi V5, les lifecycle hooks (`register`, `bootstrap`, `destroy`) doivent accepter `{ strapi }` en paramètre direct. Ne PAS capturer `strapi` par closure dans l'export du plugin.

---

## BUG-004 — Relation `inversedBy` invalide sur modèle externe

**Date** : 2026-03-22
**Contexte** : Le schéma `comment` déclarait `"inversedBy": "comments"` sur la relation `author` vers User, et `user-category` déclarait `"inversedBy": "userCategories"` sur la relation `users`
**Erreur** : `Error on attribute author in model comment: inversedBy attribute comments not found target plugin::users-permissions.user`

**Cause racine** : `inversedBy` exige que l'attribut existe sur le modèle cible. Or l'extension du modèle User (dans `register.ts`) est fail-safe et peut échouer. De plus, déclarer `inversedBy: "comments"` exige d'ajouter un attribut `comments` au modèle User, ce qui n'était pas fait du tout.

**Correction** : Retirer tous les `inversedBy` sur les relations vers des modèles externes (User). Les relations deviennent unidirectionnelles :

```json
// AVANT (crash)
"author": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "plugin::users-permissions.user",
  "inversedBy": "comments"
}

// APRÈS (fonctionne)
"author": {
  "type": "relation",
  "relation": "manyToOne",
  "target": "plugin::users-permissions.user"
}
```

**Règle** : Un plugin Strapi V5 ne doit JAMAIS utiliser `inversedBy` ou `mappedBy` sur une relation vers un modèle qu'il ne possède pas (ex: `users-permissions.user`), sauf si l'extension du modèle cible est garantie et non fail-safe. Préférer les relations unidirectionnelles pour la robustesse.

---

## BUG-005 — `auth: true` invalide dans les routes content-api

**Date** : 2026-03-22
**Contexte** : Route DELETE avec `config.auth: true`
**Erreur** : `Invalid route config config.auth must be a object type, but the final value was: true`

**Cause racine** : En Strapi V5, le validateur de routes (`routing.js`) exige que `config.auth` soit soit `false` (désactivé) soit un objet `{ scope: string[] }`. Le booléen `true` n'est PAS accepté, contrairement à ce que les types TypeScript de Strapi (`boolean | { scope: string[] }`) laissent penser.

**Correction** : Remplacer `auth: true` par `auth: { scope: [] }` pour les routes nécessitant une authentification.

**Règle** : Dans les routes Strapi V5, utiliser `auth: false` (public) ou `auth: { scope: [] }` (authentifié). Ne JAMAIS utiliser `auth: true`.

---

## BUG-006 — Accès à la config du plugin : `strapi.plugin().config` ne fonctionne pas

**Date** : 2026-03-22
**Contexte** : Bootstrap et services accédaient à la config via `strapi.plugin('comments').config`
**Erreur** : `Cannot read properties of undefined (reading 'enabled')` — la config retournée est une fonction getter lodash, pas l'objet de configuration

**Cause racine** : En Strapi V5, `strapi.plugin('comments').config` retourne un accessor lodash (fonction `.get()`), pas l'objet de configuration directement. L'objet complet est accessible via `strapi.config.get('plugin::comments')`.

**Correction** : Remplacer partout `strapi.plugin('comments').config` par `strapi.config.get('plugin::comments')`.

```typescript
// AVANT (retourne un accessor, pas un objet)
const config = strapi.plugin('comments').config;

// APRÈS (retourne l'objet de configuration)
const config = strapi.config.get('plugin::comments');
```

**Règle** : Toujours accéder à la config d'un plugin via `strapi.config.get('plugin::NOM_PLUGIN')`. Ne PAS utiliser `strapi.plugin('...').config` comme objet.

---

## BUG-007 — Routes content-api non montées (404 sur /api/comments)

**Date** : 2026-03-22
**Contexte** : Les routes publiques du plugin retournent 404
**Erreur** : `GET /api/comments` retourne `{"error":{"status":404,"name":"NotFoundError"}}`

**Cause racine** : Les routes content-api du plugin n'avaient pas de `type: 'content-api'` explicite dans leur configuration. Strapi V5 (`register-routes.js` ligne 71) applique `router.type = router.type ?? 'admin'` par defaut. Sans `type`, les routes etaient enregistrees comme routes admin (accessibles uniquement via le panel admin), pas comme routes content-api (accessibles publiquement via `/api/`).

**Correction** : Ajouter `type: 'content-api'` dans l'objet de routes content-api :

```typescript
const contentApiRoutes = {
  type: 'content-api',  // OBLIGATOIRE — sinon les routes sont montees en admin
  routes: [...]
};
```

**Regle** : Tout objet de routes content-api d'un plugin Strapi V5 DOIT avoir `type: 'content-api'` explicitement. Sans ce champ, les routes sont traitees comme des routes admin et ne sont pas accessibles publiquement.

---

## BUG-008 — Permissions publiques non configurees (403 Forbidden)

**Date** : 2026-03-22
**Contexte** : Le frontend recoit 403 sur les appels API Strapi
**Erreur** : `Forbidden` sur `GET /api/articles` et `GET /api/comments`

**Cause racine** : Strapi V5 bloque toutes les routes content-api par defaut (securite by design). Les permissions publiques (role Public) doivent etre configurees manuellement dans l'admin ou programmatiquement.

**Correction** : Ajouter un script bootstrap dans `src/index.ts` du projet Strapi qui configure automatiquement les permissions publiques :
- `api::article.article.find` / `findOne` — lecture des articles
- `plugin::comments.comment.find` / `findOne` / `create` / `reply` — commentaires

**Regle** : Pour tout projet d'experimentation, configurer les permissions publiques dans le bootstrap du projet Strapi (`src/index.ts`). Ne pas compter sur une configuration manuelle dans l'admin.

---

## BUG-012 — `fields` invalides dans les populate du Document Service

**Date** : 2026-03-22
**Contexte** : Le service `findByDocument` demande `fields: ['id', 'documentId', 'firstname']` dans le `populate.author` du Document Service
**Erreur** : `ValidationError: Invalid key firstname` — traverse/query-fields.js

**Cause racine** : Le modele User de Strapi V5 (`plugin::users-permissions.user`) n'a PAS d'attribut `firstname` par defaut. Ses attributs sont : `username`, `email`, `provider`, `password`, `confirmed`, `blocked`. De plus, `id` n'est pas toujours un champ valide a demander explicitement dans le Document Service V5.

Le service demandait des champs qui n'existent pas sur le modele cible de la relation, et le traverse validator de Strapi rejetait la requete.

**Correction** : Remplacer les `fields` explicites par `populate: { author: true }` pour charger tous les champs de la relation sans filtrage. Ou utiliser uniquement des champs qui existent sur le modele cible (`documentId`, `username`, `email`).

```typescript
// AVANT (crash — firstname n'existe pas sur User)
populate: {
  author: { fields: ['id', 'documentId', 'firstname'] }
}

// APRES (fonctionne — charge tous les champs)
populate: {
  author: true
}
```

**Regle** : Ne JAMAIS supposer les champs d'un modele externe dans un `fields` de populate. Soit utiliser `true` pour tout charger, soit verifier les attributs reels du modele cible. Le modele User Strapi V5 n'a PAS `firstname`/`lastname` par defaut.

---

## BUG-011 — Signature middleware incorrecte : `(config, { strapi })` et non `({ strapi })`

**Date** : 2026-03-22
**Contexte** : Les middlewares du plugin (rate-limit, recaptcha-verify, sanitize-input) crashent avec `Cannot read properties of undefined (reading 'config')`
**Erreur** : `TypeError: Cannot read properties of undefined (reading 'config')` dans tous les middlewares

**Cause racine** : En Strapi V5, les middlewares de plugin sont instancies via `middlewareFactory(config, { strapi })` (fichier `middleware.js → instantiateMiddleware`). Le premier argument est la config du middleware (objet vide `{}` par defaut), le second est `{ strapi }`. Nos middlewares utilisaient `({ strapi })` comme premier argument, ce qui recevait la config (un objet vide) au lieu de strapi.

**Correction** : La signature des middlewares de plugin Strapi V5 est :

```typescript
// AVANT (bugue — strapi est undefined)
export default ({ strapi }) =>
  async (ctx, next) => { ... }

// APRES (correct — config en premier, strapi en second)
export default (_config: unknown, { strapi }) =>
  async (ctx, next) => { ... }
```

**Regle** : Les middlewares de plugin Strapi V5 recoivent TOUJOURS `(config, { strapi })` comme arguments de la factory. `config` est la configuration inline du middleware (souvent `{}`), `{ strapi }` est l'instance Strapi. Ne PAS confondre avec les controllers et services qui recoivent `({ strapi })`.

---

## BUG-010 — Prefixe plugin duplique dans les paths de routes

**Date** : 2026-03-22
**Contexte** : Les routes content-api retournent 404 sur `/api/comments` mais 500 sur `/api/comments/comments`
**Erreur** : Route effective doublee : `/api/comments/comments` au lieu de `/api/comments`

**Cause racine** : Strapi V5 prefixe automatiquement les routes d'un plugin avec `/${pluginName}` (voir `register-routes.js` ligne 72 : `router.prefix = router.prefix ?? '/${pluginName}'`). Si les paths des routes contiennent deja `/comments`, le resultat est `/comments/comments`.

**Correction** : Les paths des routes doivent etre relatifs au prefixe du plugin :

```typescript
// AVANT (doublon : /api/comments/comments)
{ path: '/comments', handler: 'comment.find' }

// APRES (correct : /api/comments)
{ path: '/', handler: 'comment.find' }

// AVANT (doublon : /api/comments/comments/:id)
{ path: '/comments/:id', handler: 'comment.findOne' }

// APRES (correct : /api/comments/:id)
{ path: '/:id', handler: 'comment.findOne' }
```

**Regle** : Les paths des routes d'un plugin Strapi V5 ne doivent PAS inclure le nom du plugin. Strapi ajoute automatiquement `/${pluginName}` comme prefixe. Utiliser `/` pour la racine et `/:id` pour les sous-routes.

---

## BUG-009 — `strapi-server.js` ne dereference pas `export default`

**Date** : 2026-03-22
**Contexte** : Le plugin est charge par Strapi mais toutes les proprietes (routes, controllers, services) sont `undefined`
**Erreur** : Routes 404, plugin semble vide

**Cause racine** : Le fichier `strapi-server.js` fait `module.exports = require('./dist/server/src/index')`. Or le code source utilise `export default () => ({...})` qui est compile par TypeScript en `exports.default = ...`. Le `require()` CommonJS retourne l'objet module entier `{ default: fn }`, pas la valeur de `default`. Strapi recoit donc `{ default: fn }` au lieu de la factory directement.

**Correction** : Derefencer le `default` dans `strapi-server.js` :

```javascript
const mod = require('./dist/server/src/index');
module.exports = mod.default || mod;
```

**Regle** : Tout fichier passerelle `strapi-server.js` qui charge un module TypeScript compile en CommonJS DOIT derefencer `mod.default || mod` pour gerer la transformation `export default` → `exports.default`.

---

## Checklist pre-integration — Tout nouveau plugin Strapi V5

Avant de tester un plugin dans un projet Strapi V5, vérifier :

- [ ] `package.json` contient `"./package.json": "./package.json"` dans `exports`
- [ ] Les chemins dans `exports` correspondent exactement à la sortie du build (`ls dist/`)
- [ ] `main` pointe vers `./strapi-server.js` (passerelle CommonJS)
- [ ] `strapi-server.js` fait `mod.default || mod` pour derefencer l'export default TypeScript
- [ ] Le champ `strapi.kind` vaut `"plugin"` dans `package.json`
- [ ] Les lifecycle hooks sont exportés directement, pas via closure
- [ ] Aucun `inversedBy`/`mappedBy` sur des relations vers des modèles externes
- [ ] `auth: true` n'est utilisé nulle part dans les routes (utiliser `{ scope: [] }`)
- [ ] La config est lue via `strapi.config.get('plugin::nom')`, pas `strapi.plugin().config`
- [ ] Les routes content-api ont `type: 'content-api'` explicite
- [ ] Les permissions publiques sont configurees dans le bootstrap du projet hote
- [ ] Le build compile sans erreur (`npm run build`)
- [ ] Les tests passent (`npm test`)
