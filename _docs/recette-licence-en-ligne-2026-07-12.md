# PV de recette — Vérification de licence EN LIGNE (Option B) — 2026-07-12

> Objectif : rendre le tier payant réellement protégé. Avant, le plugin validait
> la clé par un **checksum local public** → n'importe qui pouvait fabriquer une
> clé « valide ». Désormais le plugin **vérifie la clé en ligne** contre le service
> ISOMORPH (`/api/licenses/verify`) : une clé n'est Pro que si elle existe dans la
> base des licences (créée uniquement après un paiement Stripe) et qu'elle est
> active + non expirée.
>
> Banc : Strapi 5 vierge + plugin (tarball) + **faux serveur de vérification**
> local pilotable (valid / revoked / down) sur `:4999`.

## Architecture livrée (côté plugin — PR A)

- Service `license` réécrit : appel réseau au `verifyUrl`, cache mémoire + persisté
  (store plugin), revérification périodique (12 h), **fenêtre de grâce** (7 j).
- `getTier()`/`isProLicense()` restent synchrones (lisent le cache) — la
  vérification est asynchrone en tâche de fond (jamais bloquante au boot).
- Tolérance aux pannes : réponse « invalide » explicite → repli Community immédiat ;
  panne réseau/5xx → maintien du dernier tier connu tant qu'on est dans la grâce,
  sinon repli Community (fail-safe révocation).
- Callers (`comment.ts`, `license-gate.ts`, contrôleur `verifyLicense`) basculés
  sur le **service singleton** (cache partagé). Endpoint admin « tester une clé »
  vérifie désormais en ligne.
- Config : `licenseKey` + bloc `license` (`verifyUrl`, `verifyIntervalHours`,
  `graceDays`, `timeoutMs`).

## Résultats

| # | Scénario | Résultat |
|---|---|---|
| O1 | Boot avec clé + serveur `valid` → tier Pro (vérifié en ligne) | ✅ PASS |
| O2 | Route Pro (pin) accessible en Pro | ✅ PASS |
| O3 | Endpoint admin « tester une clé » (en ligne) → valid/pro | ✅ PASS |
| O4 | **Grâce** : serveur `down` + dernière vérif récente → Pro maintenu | ✅ PASS |
| O5 | **Révocation** : serveur répond `valid:false` → repli Community | ✅ PASS |
| O6 | Route Pro (pin) → 403 après révocation | ✅ PASS |
| O7 | **Forgerie** : clé format-valide mais absente de la base → refusée | ✅ PASS |
| — | 74 tests unitaires (dont 13 nouveaux, `license-online.test.ts`), type-check, lint | ✅ PASS |

## Portée de sécurité

- **Forgerie neutralisée** : le serveur ISOMORPH fait autorité. Une clé fabriquée
  passe le format mais n'existe pas dans la base → `not_found` → Community.
- **Client payant non pénalisé** par une panne d'isomorph.dev (grâce 7 j).
- **Révocation effective** : couper/expirer une licence côté serveur rétrograde le
  plugin à la revérification suivante (ou au redémarrage).

## Restes (PR suivantes)

- [ ] **Backend isomorph.dev (PR B)** : durcir l'endpoint verify (déjà en place),
  brancher l'**email d'envoi de la licence** dans le webhook Stripe (via Scaleway
  TEM, défaut ISOMORPH), documenter les variables d'env.
- [ ] **Mise en production** (action Florent) : clés Stripe live, produits/prix,
  webhook `https://isomorph.dev/api/webhooks/stripe`, env Vercel, déploiement.
- [ ] Renommage npm `@isomorph-agency/strapi-plugin-comments` avant publication.
- [ ] (Optionnel V3) signature cryptographique offline (Ed25519) en complément,
  pour fonctionner même isomorph.dev totalement hors ligne au-delà de la grâce.
