# RAPPORT D'AUDIT SECURITE — strapi-plugin-comments-v5

**Agent** : SHIELD — SecOps ISOMORPH
**Date** : 2026-03-23
**Referentiel** : OWASP Top 10 : 2025
**Version auditee** : 1.0.0

## SYNTHESE

| Niveau | Nombre |
|--------|--------|
| CRITIQUE | 0 |
| HAUTE | 3 |
| MOYENNE | 6 |
| FAIBLE | 4 |
| **Total** | **13** |

## FAILLES P0 (immédiat)

- SEC-001 : recaptchaSecretKey stockée en base et retournée par l'API admin
- SEC-007 : console.log debug laissé en production

## FAILLES P1 (avant publication)

- SEC-002 : Rate limiter fail-open quand IP absente
- SEC-003 : Math.random() pour mot de passe abonné
- SEC-005 : checkThreshold en fail-open silencieux
- SEC-008 : Email en clair dans les logs
- SEC-009 : getEffectiveConfig fail-open sur la modération

## FAILLES P2 (prochaine version)

- SEC-004, SEC-006, SEC-010, SEC-012, SEC-013

**Checklist : 14/20 PASS — 6 FAIL — NO-GO avant corrections P0+P1**

Rapport complet dans le transcript de l'agent SHIELD.
