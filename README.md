# delivery-service

A small Cloudflare Worker that gives an Agentplace agent three delivery tools:
price a cart with delivery, place the order, and track it.

The menu lives in the agent. This service handles everything that needs code:
money math, signed quotes, the courier API, and status.

```
Agentplace agent (Luna)  ──tools──▶  this Worker  ──▶  mock | Lalamove v3 | Uber Direct
```

## Repo map

| Path | What |
|---|---|
| `src/` | The Worker: routes, pricing, signed quotes, providers (mock, Uber Direct, Lalamove) |
| `menu/menu.json` | The 10-flavor menu: source of truth for the agent |
| `agent/instructions.md` | Paste into Agentplace. Menu section is generated: `npm run menu` |
| `brand/` | Brand brief and Crumbl reference research |

## Endpoints

| Method | Path | What it does |
|---|---|---|
| POST | `/quote` | `{ dropoff: { address }, items: [{ name, unit_price, quantity }] }` → subtotal, delivery fee, total, ETA, `quote_id`, `expires_at`, `summary` |
| POST | `/order` | `{ quote_id, customer: { name, phone }, notes? }` → `order_id`, `tracking_url` |
| GET | `/order/:id` | → normalized `status`, courier, ETA, `tracking_url`, `summary` |
| GET | `/track/:id` | Customer-facing tracking page (auto-refreshes) |
| GET | `/openapi.json` | Tool spec, with descriptions written for the model |

Statuses are the same for every provider: `finding_courier → courier_assigned → picked_up → delivered` (or `canceled`).

Errors always come back as `{ error: { code, message } }`. The message is safe to read to the customer, and the code tells the agent what to do next (for example, `quote_expired` means re-quote and confirm again).

## Design decisions

- **Totals come from code, not the model.** The agent sends items and unit prices; the service does the math and returns a ready-to-say `summary`.
- **Quotes are signed tokens.** The `quote_id` is an HMAC-signed payload (price, cart, provider refs, expiry), so there's no database between quote and order, and the price can't be edited before ordering.
- **Quotes expire.** Courier prices are only held for a few minutes. An expired quote returns `410 quote_expired` so the agent can refresh the price and confirm it with the customer.
- **Provider interface.** `src/types.ts → DeliveryProvider`. The mock, Lalamove and Uber Direct adapters implement it. Order IDs carry a provider prefix (`mock_`, `lm_`, `ub_`), so status checks keep working after switching providers.
- **The mock is stateless.** Status advances with time, computed from the timestamp in the order ID. Addresses containing `far away` are out of range, and ones containing `cancel` get canceled after pickup, which is useful for demoing error handling in chat.

## Run it

```bash
npm install
cp .dev.vars.example .dev.vars   # set QUOTE_SECRET
npm run smoke                    # tests the mock flow end to end, no network
npm run dev                      # local server on http://localhost:8787
```

Try it:

```bash
curl -s localhost:8787/quote -H 'content-type: application/json' -d '{
  "dropoff": { "address": "2100 Chestnut St, San Francisco, CA 94123" },
  "items": [{ "name": "Le Classique", "unit_price": 4.75, "quantity": 4 }]
}'
```

## Deploy

```bash
npx wrangler secret put QUOTE_SECRET
npx wrangler secret put SERVICE_TOKEN   # optional; agent then sends Authorization: Bearer <token>
npm run deploy
```

## Switch to Lalamove

Lalamove does not operate in the US. The adapter is kept for LATAM/Asia markets.

1. Get sandbox keys from the Lalamove partner portal and set `LALAMOVE_MARKET` and `COUNTRY` to match.
2. `npx wrangler secret put LALAMOVE_API_KEY` and `LALAMOVE_API_SECRET`.
3. Set `PROVIDER = "lalamove"` in `wrangler.toml` and deploy.

Lalamove needs coordinates. The service uses `lat`/`lng` if the agent sends them, otherwise it geocodes the address with OpenStreetMap Nominatim (fine for a demo, not for production).

## Switch to Uber Direct

1. Sign up at direct.uber.com and open the Developer tab to get the Customer ID, Client ID and Client Secret (test credentials).
2. `npx wrangler secret put UBER_CUSTOMER_ID`, `UBER_CLIENT_ID`, `UBER_CLIENT_SECRET`.
3. Set `PROVIDER = "uber"` and deploy. With `UBER_ROBO_COURIER = "true"`, Uber's test courier moves each delivery through its statuses on its own.

Lalamove and Uber adapters are written against their public docs but haven't been run against live test accounts yet.

## What I'd change for production

- Prices from a server-side catalog instead of trusting `unit_price` from the agent.
- Payment before dispatch (Stripe / Mercado Pago), and idempotency keys on `/order`.
- Real geocoding with address autocomplete, and a confirmation card showing the pin.
- Lalamove webhooks → push status updates into the conversation instead of polling.
- Store orders (D1/KV) for history, refunds and support.
- Rate limiting, and a per-agent token instead of one shared `SERVICE_TOKEN`.
