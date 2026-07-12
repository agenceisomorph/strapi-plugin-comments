# PV de recette — Tier payant (freemium) — 2026-07-12

> Recette du modèle freemium Community / Pro sur Strapi 5.50.1 **vierge**,
> plugin installé depuis le tarball npm pack. Clé de test :
> `ISOMORPH-COMMENTS-B5DE-5D05-8480-E4D7` (checksum pair → valide).

## Décision produit

Comments reste **payant** (décision Florent 2026-07-11) : tier Community gratuit
plafonné à 500 commentaires + fonctions de base ; tier Pro (clé de licence) =
commentaires illimités + actions en masse, épinglage, réponse admin, gestion des
signalements.

## Résultats — tier Community (sans clé)

| # | Scénario | Résultat |
|---|---|---|
| C1 | `GET /admin/license` → `tier=community`, `commentLimit=500`, features Pro à `false` | ✅ PASS |
| C2 | `PUT /admin/comments/bulk-approve` → 403 `LicenseRequired` | ✅ PASS |
| C3 | `PUT /admin/comments/:id/pin` → 403 | ✅ PASS |
| C4 | `POST /admin/comments/:id/reply` → 403 | ✅ PASS |
| C5 | `PUT /admin/reports/:id/review` → 403 | ✅ PASS |
| C6 | `POST /admin/license/verify` (clé valide) → `{valid:true, tier:pro}` sans persister | ✅ PASS |
| C7 | Plafond 500 : base seedée à 500, 501ᵉ commentaire public → 403 « Limite Community atteinte » | ✅ PASS |
| C8 | `POST /admin/comments/bulk-delete` → 403 `LicenseRequired` (gate tient sur la route corrigée) | ✅ PASS |

## Résultats — tier Pro (clé valide)

| # | Scénario | Résultat |
|---|---|---|
| P1 | `GET /admin/license` → `tier=pro`, `maskedKey=…E4D7`, `commentLimit=null`, features Pro à `true` | ✅ PASS |
| P2 | `PUT /admin/comments/:id/pin` → 200 | ✅ PASS |
| P3 | `PUT /admin/comments/bulk-approve` → 200 | ✅ PASS |
| P4 | `POST /admin/comments/bulk-delete` → `{deleted:1}` | ✅ PASS |
| — | Clé jamais renvoyée au client (masquée), fail-open Community sur clé invalide | ✅ (couvert par tests unitaires license.test.ts) |

## Bugs trouvés et corrigés

1. **`bulk-delete` inatteignable même en Pro (404)** : la route
   `DELETE /admin/comments/bulk-delete` était déclarée APRÈS
   `DELETE /admin/comments/:id` → le routeur Koa matchait `/bulk-delete` sur la
   route paramétrique (`id="bulk-delete"`) → suppression unitaire → 404.
   Fix : routes statiques `bulk-*` déclarées avant la route paramétrique `:id`.
2. **`bulk-delete` renvoyait 400 même bien routée** : Strapi/Koa ne parse pas le
   corps des requêtes `DELETE` → `ids` arrivait `undefined`. Fix : passage en
   `POST` (endpoint d'action, cohérent avec `bulk-approve`/`bulk-block` en PUT
   dont le corps est parsé).

## Réserve mineure (non bloquante)

`bulkDelete` compte un id comme « supprimé » même s'il n'existe pas (le Document
Service v5 est idempotent et ne lève pas sur un id absent) → le rapport peut
afficher `deleted:1` pour un id fantôme. Cosmétique ; à durcir si le compteur est
exposé dans l'UI.

## Restes

- [ ] Câbler les actions bulk à des boutons dans le panneau admin (aujourd'hui
  endpoints API seuls — l'UISettings n'expose que le badge de features)
- [ ] Renommage npm `@isomorph-agency/strapi-plugin-comments` (nom sans scope pris
  par Sensinum) avant publication
- [ ] Décider validation licence V2 (serveur ISOMORPH) vs V1 locale actuelle
