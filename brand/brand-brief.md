# KUKI — brand + menu brief (v0.1)

## Concept

**Ladurée × Crumbl, with a Mexican soul.** Crumbl's format (big, loud cookies in a box, a weekly
rotating menu) with Ladurée-level French packaging and pâtisserie technique, applied to Mexican
flavors: concha, cajeta, horchata, café de olla, pan de muerto, mazapán, mangonada.

Packaging: a Franco-Mexican toile (Mexican subjects drawn as French copperplate engravings,
a nod to the Porfiriato), a gilded cartouche, a satin ribbon.

"Parisian pâtisserie, pop energy." A cookie shop in North Beach, San Francisco (delivers around SF).
Structure is minimal (the chat UI must stay readable); the *product moments* are loud:
flat bold color, oversized cookies, playful copy. Not Le Labo austere, not full maximalist chaos.

## Palette (avoid Crumbl pink as the primary)
| Token | Hex | Use |
|---|---|---|
| beurre (butter yellow) | #FFE27A | primary brand color, boxes, backgrounds |
| tomate (tomato red) | #E8412C | wordmark, CTAs, accents |
| crème | #FFF6E5 | surfaces, chat background |
| cacao | #3B2418 | text, chocolate |
| pistache | #B7D59A | small accent only |

## Type
- Wordmark/display: high-contrast Didone, italic for flair (e.g. Bodoni Moda).
- UI/body: clean grotesk (e.g. Inter).
- Wordmark: **KUKI** in caps, tomate on beurre.

## Menu

10 cookies: 6 classics + 4 rotating weekly. Source of truth: `menu/menu.json`
(rendered into `agent/instructions.md` with `npm run menu`).

Allergen statement (always shown): "Everything is baked in a shared kitchen with milk, egg, wheat,
soy, tree nuts and peanuts, so we can't guarantee any cookie is free of an allergen."

Agent instructions: `agent/instructions.md`
