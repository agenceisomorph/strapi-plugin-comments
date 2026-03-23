# Image prompts — strapi-plugin-comments

**Fichier** : `_docs/image-prompts.md`
**Date de rédaction** : 2026-03-23
**Auteur** : QUILL — ISOMORPH
**Usage** : Génération via Banana Pro (IA image)

---

## 1. Prompt — Illustration LinkedIn (16:9)

**Usage** : Image d'accompagnement du post de lancement LinkedIn. Format 1200x675px.

```
A sleek, modern tech illustration for a developer tool announcement. Dark background (#0F0F1A), deep navy to near-black gradient. Center composition: a stylized comment thread interface — two to three stacked comment cards with rounded corners, soft glow edges in electric blue (#4945FF) and soft violet (#9B6DFF). Each card shows a small circular avatar filled with a distinct pastel color (mint green, lavender, peach), and one or two lines of abstract placeholder text rendered as thin horizontal bars. A subtle badge labeled "Team" in electric blue sits on the bottom card, suggesting an admin reply. Above the comment stack, a small shield icon and a lock icon float slightly, rendered in semi-transparent white, hinting at security. On the right side, a faint abstract network of nodes and connecting lines in violet, representing a plugin ecosystem or API graph. No text, no words, no letters anywhere in the image. Clean, minimalist, premium developer aesthetic. Inspired by Strapi brand colors (electric blue, violet, dark navy). Subtle depth through soft shadows and a slight glassmorphism effect on the cards.
```

**Paramètres recommandés :**
- Ratio : 16:9 (1200x675)
- Style : Illustration vectorielle flat/tech, pas photo-réaliste
- Qualité : High detail
- Negative prompt : `text, letters, words, realistic photo, people, faces, clutter, busy background`

---

## 2. Prompt — Logo plugin (carré, 1:1)

**Usage** : Icône NPM, GitHub repository social preview, documentation. Format 512x512px.

```
A minimalist square logo for a developer plugin called "strapi-plugin-comments". Dark square background with very slightly rounded corners, deep navy blue (#0F0F1A). Center: a single clean speech bubble icon, geometric and modern, with a small circular dot inside representing a reply indicator. The bubble uses a gradient fill from electric blue (#4945FF) on the left to violet (#9B6DFF) on the right, with a crisp white outline stroke of 2px. Below the bubble, a tiny second smaller bubble overlapping slightly at the bottom-right corner, in semi-transparent violet, suggesting a threaded reply. The overall composition is perfectly centered with generous padding. No text, no letters, no labels anywhere. Inspired by Strapi's design language. Clean, bold, instantly recognizable at small sizes (16x16 favicon-ready clarity). Flat design with a single subtle drop shadow for depth.
```

**Paramètres recommandés :**
- Ratio : 1:1 (512x512)
- Style : Flat icon design, vector-clean
- Qualité : High detail, sharp edges
- Negative prompt : `text, letters, words, gradients that are too soft, photorealistic, 3D render, complex details, clutter`

---

## Palette de couleurs de référence

| Couleur | Hex | Usage |
|---------|-----|-------|
| Strapi Electric Blue | `#4945FF` | Couleur primaire, accents |
| Strapi Violet | `#9B6DFF` | Dégradé, éléments secondaires |
| Dark Navy | `#0F0F1A` | Fond principal |
| White | `#FFFFFF` | Contours, textes |
| Pastel Mint | `#B5EAD7` | Avatar commentateur 1 |
| Pastel Lavender | `#C7CEEA` | Avatar commentateur 2 |
| Pastel Peach | `#FFDAC1` | Avatar commentateur 3 |

---

## Notes pour la génération

- Tester les deux prompts avec et sans le paramètre `--no-text` ou équivalent Banana Pro pour garantir l'absence de texte
- Si du texte apparaît dans l'image générée, ajouter au negative prompt : `typography, font, caption, label, watermark, UI text`
- Générer 3 à 4 variantes et sélectionner la plus proche du brief
- Le logo doit rester lisible à 32x32px (taille favicon) — vérifier après génération
