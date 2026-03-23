# Post LinkedIn — Lancement strapi-plugin-comments

**Fichier** : `_docs/linkedin-post-launch.md`
**Date de rédaction** : 2026-03-23
**Auteur** : QUILL — ISOMORPH
**Statut** : Prêt à publier (remplacer les liens placeholder avant envoi)

---

## Version principale (longue — recommandée pour le lancement)

---

On vient de publier un plugin open source pour Strapi V5. Voici pourquoi on l'a construit.

Il y a quelques semaines, un client nous demande d'ajouter des commentaires sur son blog Strapi. Simple en apparence. Sauf que Strapi V5 n'a aucun plugin de commentaires fonctionnel — les anciens plugins sont tous bloqués sur V4, et le Marketplace est vide sur ce sujet.

Résultat : on a construit le nôtre. Et on le publie en open source.

**strapi-plugin-comments** — le système de commentaires le plus complet pour Strapi V5.

Ce que le plugin fait nativement, sans configuration supplémentaire :

- Commentaires et réponses (système threadé N-1)
- Panneau admin dédié dans la sidebar Strapi — modération, stats, signalements
- Filtre anti-injures FR + EN (leo-profanity, configurable)
- Vérification Google reCAPTCHA V3 côté serveur
- Rate limiting par IP avec store Redis injectable
- Sanitisation XSS sur tous les inputs
- Système de signalement communautaire avec seuil d'auto-blocage
- Génération automatique d'avatar pastel déterministe (WCAG AA)
- Réponses admin en WYSIWYG avec badge "Équipe"
- Like / Unlike, épinglage de commentaires, blocage d'auteur

TypeScript strict. Zod sur chaque input. Conforme OWASP 2025. Framework-agnostic : React, Vue, Next.js, Nuxt, Astro — tout fonctionne.

NPM : [lien à ajouter]
GitHub : https://github.com/isomorph-agency/strapi-plugin-comments

Si tu travailles avec Strapi V5 et que tu as besoin de commentaires, c'est le plugin qu'il te faut. Et si tu veux contribuer, les PRs sont ouvertes.

---

#Strapi #OpenSource #NodeJS #TypeScript #WebDev #CMS #ISOMORPH

---

## Version courte (alternative — format hook percutant)

---

Strapi V5 n'avait aucun plugin de commentaires digne de ce nom.

On a réglé le problème.

strapi-plugin-comments : commentaires threadés, modération admin, anti-injures, reCAPTCHA V3, rate limiting, signalements communautaires — tout ça en open source, TypeScript strict, conforme OWASP 2025.

Disponible maintenant sur NPM.

[lien NPM] | [lien GitHub]

#Strapi #OpenSource #TypeScript #NodeJS

---

## Notes de publication

- Publier entre 8h et 10h un mardi ou mercredi (meilleure portée LinkedIn)
- Ajouter une image générée (voir `image-prompts.md`) pour maximiser la visibilité
- Épingler le post sur le profil ISOMORPH pendant 2 semaines
- Taguer Strapi officiel (@Strapi) dans le post si pertinent
- Partager également sur le compte personnel de Florent pour amplifier la portée
- Remplacer les liens placeholder par les URLs NPM et GitHub réels avant publication
