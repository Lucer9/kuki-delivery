# KUKI handoff

Context for picking this project up on a new machine or in a new Claude session.
Last updated: 2026-11-11.

## What this is

A take-home for **Agentplace**, applying to two roles with one project:

| Role | Their task | What we deliver |
|---|---|---|
| **Full-Stack Engineer** ([brief](https://agentplace.io/careers/full-stack-engineer)) | Build an agent for a real business on Agentplace (free Luna model), publish it, connect it to an external API, write a note on approach, production changes and platform limits. Email the agent link, the repo and the note to nikita@agentplace.io, subject "Application: Full-Stack Engineer". | The KUKI ordering agent + this delivery service + the note |
| **Agentic UX Designer** ([brief](https://agentplace.io/careers/agentic-ux-designer)) | Explore Agentplace, suggest 3–5 UI improvements (what's wrong, the fix, why it's better). Send screenshots, a short Figma file or a Loom. | Improvements drawn from the friction hit while building KUKI. Reply on the existing email thread with Nikita (sent Nov 4). |

No time limit on either.

## The product

**KUKI**: a chat-first cookie shop. *Ladurée × Crumbl, with a Mexican soul.*
- Crumbl's format: big cookies in boxes of 4/6/12, 6 classics + 4 rotating flavors.
- Ladurée-level French packaging: a Franco-Mexican toile (Mexican subjects drawn as French copperplate engravings, a nod to the Porfiriato), a gold cartouche, a satin ribbon.
- Mexican flavors: concha, cajeta, horchata, café de olla, pan de muerto, mazapán, mangonada.
- Location: **North Beach, San Francisco** (placeholder pickup: 1600 Stockton St). US addresses, USD.
- Original brand: no Crumbl/Ladurée names, logos, photos or patterns.

Details: `brand/brand-brief.md`, `brand/crumbl-research.md` (official Crumbl data: menu model, allergen policy, fulfillment UX copy), `menu/menu.json`.

## Architecture

```
Agentplace agent (Luna)  ──tools──▶  Cloudflare Worker (this repo)  ──▶  mock | Uber Direct | Lalamove
   menu + persona live here           quotes, orders, tracking
```

- **Menu lives in the agent.** `menu/menu.json` is the source of truth; `npm run menu` renders it into `agent/instructions.md`, which gets pasted into Agentplace.
- **The Worker handles everything that needs code**: cart totals (never the model), HMAC-signed `quote_id` (no DB, can't be tampered), quote expiry (`410 quote_expired`), normalized statuses, agent-readable errors (`{ error: { code, message } }`), a tracking page, `/openapi.json` with model-oriented descriptions.
- **Providers** behind one `DeliveryProvider` interface (`src/types.ts`): `mock` (stateless, time-based status; addresses containing "far away" are out of range, "cancel" gets canceled), `uber` (Uber Direct: OAuth client credentials, robo courier in test mode), `lalamove` (kept for LATAM/Asia; not in the US).
- **Boxes are sent to `/quote` as one line item** (e.g. `"4-pack: 2 Le Classique, 2 Concha Rosa"` at 17.50). Per-cookie box prices round badly ($17.52).

Endpoints, design decisions and the production list are in `README.md`.

## Current state

| Item | Status |
|---|---|
| Repo | `Lucer9/kuki-delivery`, `main`. Typecheck + 12 smoke tests pass (`npm run smoke`). |
| Deploy | Live at https://delivery-service.carlosaguirre.workers.dev with `PROVIDER = "mock"`. `/health` and `/openapi.json` work. |
| `QUOTE_SECRET` | **Not set yet.** `/quote` and `/order` return `not_configured` until it is. |
| Uber Direct | Adapter written from public docs, **never run against a real account**. Needs test credentials. |
| Lalamove | Same; not relevant for the US. |
| Agent in Agentplace | Not built yet. `agent/instructions.md` is ready to paste. |
| Renders | 24 WebP in `brand/renders/` (10 cookies × aerial + hero, closed box, open box, toile tile, contact sheet). Source in `renders-src/`. Stylized CG: **still looks polygonal / clay-like**. |
| The note (Full-Stack) | Not written. |
| UX improvements | Not written. Collect friction while building the agent. |

## Next steps, in order

1. **Set the secret** (no redeploy needed):
   ```bash
   npx wrangler secret put QUOTE_SECRET
   ```
   Value: output of `openssl rand -hex 32`. Then test:
   ```bash
   curl -s https://delivery-service.carlosaguirre.workers.dev/quote -H 'content-type: application/json' -d '{"dropoff":{"address":"2100 Chestnut St, San Francisco, CA 94123"},"items":[{"name":"4-pack: 2 Le Classique, 2 Concha Rosa","unit_price":17.5,"quantity":1}]}'
   ```
2. **Build the agent in Agentplace**: paste `agent/instructions.md`, add the 3 tools from `/openapi.json` (or by hand), publish. Note how tools are added (OpenAPI / HTTP / MCP). If MCP is supported, add a `/mcp` endpoint exposing the same 3 tools over the same functions; if not, mention it in the note.
3. **Uber Direct test credentials**: sign up at direct.uber.com → Developer tab → Customer ID, Client ID, Client Secret.
   ```bash
   npx wrangler secret put UBER_CUSTOMER_ID
   ```
   (same for `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`), set `PROVIDER = "uber"` in `wrangler.toml`, `npm run deploy`, fix whatever the first real call reveals.
4. **Renders → hyperreal.** Two tracks were proposed:
   - **Blender Cycles** (free, reproducible): procedural cookies with real subdivision, displacement and subsurface scattering, OIDN denoise; same slugs, sizes and backgrounds as now. Best for the chat-card cutouts and the box.
   - **AI image generation** (photo-level, costs credits) for 2–3 editorial landing shots. Figma Weave was tried but the account isn't linked yet: app.weavy.ai/settings → Profile → link Figma.
5. **Write the note** (Full-Stack): how the pieces fit, what changes for production (README already lists it: server-side catalog, payment before dispatch, idempotency, real geocoding + pin confirmation, webhooks into the chat, order storage, rate limiting), and where Agentplace hit limits.
6. **UX submission**: 3–5 improvements to Agentplace's own builder, from real friction (e.g. updating a weekly menu = editing and republishing the agent?).
7. **Optional**: replace the placeholder pickup with the real "shack" address (4 lines in `wrangler.toml`: address, lat, lng, phone).

## Commands

```bash
npm install
```

```bash
npm run smoke
```

```bash
npm run dev
```

```bash
npm run menu
```

```bash
npm run deploy
```

```bash
cd renders-src && npm install && node render.mjs
```
(Full-size PNGs go to `/renders/`, git-ignored. `--draft` for a fast preview, `--only <slug|aerial|hero|box-closed|box-4pack|box-pattern|sheet>`.)

## Prompt to continue in a new Claude session

> Read HANDOFF.md, README.md and brand/brand-brief.md. We're building KUKI for the Agentplace take-home. Start with step <N> of "Next steps".
