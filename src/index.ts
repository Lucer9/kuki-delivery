import { formatMoney, priceCart, toMajor, type PricedLine } from "./pricing";
import { lalamoveProvider } from "./providers/lalamove";
import { mockProvider } from "./providers/mock";
import { uberProvider } from "./providers/uber";
import { openapi } from "./openapi";
import { sign, verify } from "./token";
import { ServiceError, type Address, type DeliveryProvider, type Env } from "./types";

interface QuoteToken {
  provider: DeliveryProvider["name"];
  ref: Record<string, string>;
  dropoff: Address;
  lines: PricedLine[];
  subtotal: number;
  fee: number;
  total: number;
  currency: string;
  exp: number;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });

function providerFor(env: Env, name: string = env.PROVIDER): DeliveryProvider {
  if (name === "lalamove") return lalamoveProvider(env);
  if (name === "mock") return mockProvider(env);
  if (name === "uber") return uberProvider(env);
  throw new ServiceError(500, "provider_not_configured", `Unknown provider "${name}".`);
}

/** Order IDs carry their provider prefix, so status checks still work after switching providers. */
function providerForOrder(env: Env, id: string): DeliveryProvider {
  if (id.startsWith("lm_")) return providerFor(env, "lalamove");
  if (id.startsWith("mock_")) return providerFor(env, "mock");
  if (id.startsWith("ub_")) return providerFor(env, "uber");
  throw new ServiceError(404, "order_not_found", "I couldn't find that order. Could you check the order ID?");
}

async function body(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    throw new ServiceError(400, "invalid_json", "Request body must be JSON.");
  }
}

function parseAddress(raw: unknown): Address {
  const a = (typeof raw === "string" ? { address: raw } : raw) as Partial<Address> | undefined;
  if (!a || typeof a.address !== "string" || a.address.trim().length < 8) {
    throw new ServiceError(400, "invalid_address", "I need a full delivery address: street, city and ZIP code.");
  }
  return { address: a.address.trim(), lat: a.lat, lng: a.lng };
}

async function quote(req: Request, env: Env) {
  const b = await body(req);
  const dropoff = parseAddress(b.dropoff);
  const { lines, subtotal } = priceCart(b.items);
  const provider = providerFor(env);
  const q = await provider.quote(dropoff);
  const total = subtotal + q.fee;
  const exp = Math.min(q.expires_at, Date.now() + 10 * 60_000);

  const token: QuoteToken = { provider: provider.name, ref: q.ref, dropoff, lines, subtotal, fee: q.fee, total, currency: q.currency, exp };
  return json({
    quote_id: await sign(token, env.QUOTE_SECRET),
    provider: provider.name,
    currency: q.currency,
    items: lines.map((l) => ({ ...l, unit_price: toMajor(l.unit_price), line_total: toMajor(l.line_total) })),
    subtotal: toMajor(subtotal),
    delivery_fee: toMajor(q.fee),
    total: toMajor(total),
    eta_minutes: q.eta_minutes,
    expires_at: new Date(exp).toISOString(),
    // Ready-to-say text so the model doesn't have to format money itself.
    summary: `Subtotal ${formatMoney(subtotal, q.currency)} + delivery ${formatMoney(q.fee, q.currency)} = ${formatMoney(total, q.currency)}${
      q.eta_minutes ? `, about ${q.eta_minutes} min` : ""
    }. Price held until ${new Date(exp).toISOString()}.`,
  });
}

async function order(req: Request, env: Env) {
  const b = await body(req);
  if (typeof b.quote_id !== "string") throw new ServiceError(400, "missing_quote", "Get a quote first, then place the order with its quote_id.");
  const q = await verify<QuoteToken>(b.quote_id, env.QUOTE_SECRET);
  if (Date.now() > q.exp) {
    throw new ServiceError(410, "quote_expired", "That price expired. Get a fresh quote and confirm the new total with the customer.");
  }
  const c = b.customer as { name?: unknown; phone?: unknown } | undefined;
  if (!c || typeof c.name !== "string" || !c.name.trim()) throw new ServiceError(400, "invalid_customer", "I need the customer's name.");
  if (typeof c.phone !== "string" || !/^\+\d{10,15}$/.test(c.phone.replace(/[\s-]/g, ""))) {
    throw new ServiceError(400, "invalid_phone", "I need a phone number with country code, like +1 415 555 0123.");
  }
  const origin = new URL(req.url).origin;
  const o = await providerFor(env, q.provider).createOrder({
    ref: q.ref,
    dropoff: q.dropoff,
    customer: { name: c.name.trim(), phone: c.phone.replace(/[\s-]/g, "") },
    items: q.lines.map((l) => ({ name: l.name, quantity: l.quantity })),
    notes: typeof b.notes === "string" ? b.notes.slice(0, 200) : undefined,
    origin,
  });
  return json(
    {
      order_id: o.id,
      status: "finding_courier",
      tracking_url: o.tracking_url,
      total: toMajor(q.total),
      currency: q.currency,
      summary: `Order placed. Total ${formatMoney(q.total, q.currency)}. We're finding a courier now.`,
    },
    201,
  );
}

const STATUS_TEXT = {
  finding_courier: "Looking for a courier",
  courier_assigned: "Courier on the way to the bakery",
  picked_up: "Your cookies are on the way",
  delivered: "Delivered. Enjoy!",
  canceled: "This delivery was canceled",
} as const;

async function status(id: string, req: Request, env: Env) {
  const s = await providerForOrder(env, id).getStatus(id, new URL(req.url).origin);
  return json({ order_id: id, ...s, summary: STATUS_TEXT[s.status] });
}

async function trackPage(id: string, req: Request, env: Env) {
  const s = await providerForOrder(env, id).getStatus(id, new URL(req.url).origin);
  const steps = ["finding_courier", "courier_assigned", "picked_up", "delivered"] as const;
  const at = steps.indexOf(s.status as (typeof steps)[number]);
  const esc = (t: string) => t.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="15"><title>Order tracking</title>
<style>body{font:16px/1.5 system-ui;max-width:420px;margin:40px auto;padding:0 16px;color:#222}
li{padding:8px 0;color:#999}li.done{color:#222}li.now{font-weight:600;color:#b4446c}</style>
<h1>${esc(STATUS_TEXT[s.status])}</h1>
${s.courier?.name ? `<p>Courier: ${esc(s.courier.name)}</p>` : ""}
${s.status === "canceled" ? "" : `<ol>${steps.map((st, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}">${STATUS_TEXT[st]}</li>`).join("")}</ol>`}
<p style="color:#999;font-size:13px">Order ${esc(id)} · refreshes every 15 s</p>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    try {
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
          },
        });
      }
      if (path === "/" || path === "/health") return json({ ok: true, provider: env.PROVIDER });
      if (path === "/openapi.json") return json(openapi(url.origin));

      const trackMatch = path.match(/^\/track\/([\w-]+)$/);
      if (req.method === "GET" && trackMatch) return trackPage(trackMatch[1], req, env);

      if (!env.QUOTE_SECRET) throw new ServiceError(500, "not_configured", "QUOTE_SECRET is not set.");
      if (env.SERVICE_TOKEN && req.headers.get("Authorization") !== `Bearer ${env.SERVICE_TOKEN}`) {
        throw new ServiceError(401, "unauthorized", "Missing or wrong service token.");
      }

      if (req.method === "POST" && path === "/quote") return await quote(req, env);
      if (req.method === "POST" && path === "/order") return await order(req, env);
      const orderMatch = path.match(/^\/order\/([\w-]+)$/);
      if (req.method === "GET" && orderMatch) return await status(orderMatch[1], req, env);

      throw new ServiceError(404, "not_found", "No such endpoint.");
    } catch (err) {
      if (err instanceof ServiceError) return json({ error: { code: err.code, message: err.message } }, err.status);
      console.error(err);
      return json({ error: { code: "internal", message: "Something went wrong on our side. Please try again." } }, 500);
    }
  },
};
