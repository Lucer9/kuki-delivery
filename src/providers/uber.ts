// Uber Direct (DaaS) adapter.
// Docs: https://developer.uber.com/docs/deliveries/overview
// Flow: OAuth client-credentials token → delivery_quotes → deliveries (with quote_id) → GET deliveries/{id}.
// Test credentials from direct.uber.com create test deliveries; with the robo courier
// enabled, Uber moves the delivery through its statuses on its own.
import type { DeliveryProvider, DeliveryStatus, Env, ProviderStatus } from "../types";
import { ServiceError } from "../types";
import { geocode, type Geo } from "../geocode";

const STATUS_MAP: Record<string, DeliveryStatus> = {
  pending: "finding_courier",
  pickup: "courier_assigned",
  pickup_complete: "picked_up",
  dropoff: "picked_up",
  delivered: "delivered",
  canceled: "canceled",
  returned: "canceled",
};

// Tokens last ~30 days. Cached per isolate; for production, cache in KV so every
// isolate doesn't fetch its own (Uber rate-limits the token endpoint).
let cached: { token: string; exp: number } | null = null;

/** Uber wants addresses as a JSON *string*, ideally structured. */
const uberAddress = (line: string, g: Geo) =>
  JSON.stringify(
    g.street && g.city && g.state && g.zip
      ? { street_address: [g.street], city: g.city, state: g.state, zip_code: g.zip, country: g.country }
      : { street_address: [line], country: g.country },
  );

const minutesUntil = (iso?: string) =>
  iso ? Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000)) : null;

export function uberProvider(env: Env): DeliveryProvider {
  async function token(): Promise<string> {
    if (cached && cached.exp > Date.now() + 60_000) return cached.token;
    if (!env.UBER_CLIENT_ID || !env.UBER_CLIENT_SECRET || !env.UBER_CUSTOMER_ID) {
      throw new ServiceError(500, "provider_not_configured", "Delivery isn't set up yet. Please try again later.");
    }
    const res = await fetch("https://auth.uber.com/oauth/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.UBER_CLIENT_ID,
        client_secret: env.UBER_CLIENT_SECRET,
        grant_type: "client_credentials",
        scope: "eats.deliveries",
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !json.access_token) {
      console.error("uber auth error", res.status, JSON.stringify(json));
      throw new ServiceError(502, "provider_error", "The delivery service didn't respond as expected. Please try again.");
    }
    cached = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
    return cached.token;
  }

  async function call<T>(method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
    const res = await fetch(`https://api.uber.com/v1/customers/${env.UBER_CUSTOMER_ID}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const json = (await res.json().catch(() => ({}))) as T & { code?: string; message?: string };
    if (!res.ok) {
      console.error("uber error", res.status, JSON.stringify(json));
      if (res.status === 404) throw new ServiceError(404, "order_not_found", "I couldn't find that order.");
      if (json.code === "address_undeliverable" || json.code === "address_undeliverable_limited_couriers") {
        throw new ServiceError(422, "out_of_range", "That address is outside our delivery area.");
      }
      if (json.code === "invalid_params" && /address/i.test(json.message ?? "")) {
        throw new ServiceError(422, "address_not_found", "I couldn't find that address. Could you add the city and ZIP code?");
      }
      throw new ServiceError(502, "provider_error", "The delivery service didn't respond as expected. Please try again.");
    }
    return json;
  }

  let pickupGeo: Geo | null = null;
  const pickup = async () => {
    pickupGeo ??= await geocode(
      { address: env.PICKUP_ADDRESS, lat: Number(env.PICKUP_LAT), lng: Number(env.PICKUP_LNG) },
      env.COUNTRY,
    );
    return {
      pickup_address: uberAddress(env.PICKUP_ADDRESS, pickupGeo),
      pickup_latitude: Number(env.PICKUP_LAT),
      pickup_longitude: Number(env.PICKUP_LNG),
    };
  };

  return {
    name: "uber",

    async quote(dropoff) {
      const c = await geocode(dropoff, env.COUNTRY);
      const q = await call<{ id: string; fee: number; currency: string; expires: string; duration?: number }>(
        "POST",
        "/delivery_quotes",
        {
          ...(await pickup()),
          dropoff_address: uberAddress(dropoff.address, c),
          dropoff_latitude: c.lat,
          dropoff_longitude: c.lng,
        },
      );
      return {
        fee: q.fee, // already in minor units
        currency: q.currency.toUpperCase(),
        eta_minutes: q.duration ?? null,
        expires_at: Date.parse(q.expires),
        ref: { quoteId: q.id, geo: JSON.stringify(c) },
      };
    },

    async createOrder({ ref, dropoff, customer, items, notes }) {
      const geo = JSON.parse(ref.geo) as Geo;
      const d = await call<{ id: string; tracking_url?: string }>("POST", "/deliveries", {
        quote_id: ref.quoteId,
        ...(await pickup()),
        pickup_name: env.PICKUP_NAME,
        pickup_phone_number: env.PICKUP_PHONE,
        dropoff_address: uberAddress(dropoff.address, geo),
        dropoff_latitude: geo.lat,
        dropoff_longitude: geo.lng,
        dropoff_name: customer.name,
        dropoff_phone_number: customer.phone,
        dropoff_notes: notes ?? "",
        manifest_items: items.map((i) => ({ name: i.name, quantity: i.quantity, size: "small" })),
        ...(env.UBER_ROBO_COURIER === "true" ? { test_specifications: { robo_courier_specification: { mode: "auto" } } } : {}),
      });
      return { id: `ub_${d.id}`, tracking_url: d.tracking_url ?? null };
    },

    async getStatus(orderId): Promise<ProviderStatus> {
      const d = await call<{
        status: string;
        tracking_url?: string;
        dropoff_eta?: string;
        courier?: { name?: string; phone_number?: string } | null;
      }>("GET", `/deliveries/${encodeURIComponent(orderId.replace(/^ub_/, ""))}`);
      const status = STATUS_MAP[d.status] ?? "finding_courier";
      return {
        status,
        courier: d.courier ? { name: d.courier.name, phone: d.courier.phone_number } : null,
        eta_minutes: status === "delivered" || status === "canceled" ? 0 : minutesUntil(d.dropoff_eta),
        tracking_url: d.tracking_url ?? null,
      };
    },
  };
}
