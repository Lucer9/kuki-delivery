// Lalamove API v3 adapter (sandbox by default).
// Docs: https://developers.lalamove.com/
// Auth: "Authorization: hmac <key>:<ts>:<sig>", sig = HMAC-SHA256 hex of
//   `${ts}\r\n${METHOD}\r\n${path}\r\n\r\n${body}` with the API secret.
import type { Address, DeliveryProvider, DeliveryStatus, Env, ProviderStatus } from "../types";
import { ServiceError } from "../types";

const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATUS_MAP: Record<string, DeliveryStatus> = {
  ASSIGNING_DRIVER: "finding_courier",
  ON_GOING: "courier_assigned",
  PICKED_UP: "picked_up",
  COMPLETED: "delivered",
  CANCELED: "canceled",
  REJECTED: "canceled",
  EXPIRED: "canceled",
};

export function lalamoveProvider(env: Env): DeliveryProvider {
  const base = env.LALAMOVE_BASE_URL ?? "https://rest.sandbox.lalamove.com";
  const market = env.LALAMOVE_MARKET ?? "MX";

  async function call<T>(method: "GET" | "POST", path: string, data?: unknown): Promise<T> {
    if (!env.LALAMOVE_API_KEY || !env.LALAMOVE_API_SECRET) {
      throw new ServiceError(500, "provider_not_configured", "Delivery isn't set up yet. Please try again later.");
    }
    const body = data === undefined ? "" : JSON.stringify({ data });
    const ts = Date.now().toString();
    const sig = await hmacHex(env.LALAMOVE_API_SECRET, `${ts}\r\n${method}\r\n${path}\r\n\r\n${body}`);
    const res = await fetch(base + path, {
      method,
      headers: {
        Authorization: `hmac ${env.LALAMOVE_API_KEY}:${ts}:${sig}`,
        Market: market,
        "Request-ID": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      body: body || undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; errors?: { id?: string; message?: string }[] };
    if (!res.ok || !json.data) {
      const first = json.errors?.[0];
      console.error("lalamove error", res.status, JSON.stringify(json.errors ?? json));
      if (res.status === 404) throw new ServiceError(404, "order_not_found", "I couldn't find that order.");
      if (first?.id?.includes("OUT_OF_SERVICE_AREA")) {
        throw new ServiceError(422, "out_of_range", "That address is outside our delivery area.");
      }
      throw new ServiceError(502, "provider_error", "The delivery service didn't respond as expected. Please try again.");
    }
    return json.data;
  }

  /** Lalamove needs coordinates. Uses the caller's lat/lng, else geocodes the address. */
  async function coords(a: Address): Promise<{ lat: string; lng: string }> {
    if (a.lat !== undefined && a.lng !== undefined) return { lat: String(a.lat), lng: String(a.lng) };
    // Demo geocoder. For production, use a paid geocoder (Google, Mapbox) and an
    // address-autocomplete UI so the customer confirms the exact location.
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(a.address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "delivery-service-demo/0.1" } });
    const hits = (await res.json().catch(() => [])) as { lat: string; lon: string }[];
    if (!hits[0]) {
      throw new ServiceError(422, "address_not_found", "I couldn't find that address. Could you add the colonia and postal code?");
    }
    return { lat: hits[0].lat, lng: hits[0].lon };
  }

  return {
    name: "lalamove",

    async quote(dropoff) {
      const q = await call<{
        quotationId: string;
        expiresAt: string;
        priceBreakdown: { total: string; currency: string };
        stops: { stopId: string }[];
      }>("POST", "/v3/quotations", {
        serviceType: env.LALAMOVE_SERVICE_TYPE ?? "MOTORCYCLE",
        language: "es_MX",
        stops: [
          { coordinates: { lat: env.PICKUP_LAT, lng: env.PICKUP_LNG }, address: env.PICKUP_ADDRESS },
          { coordinates: await coords(dropoff), address: dropoff.address },
        ],
      });
      return {
        fee: Math.round(Number(q.priceBreakdown.total) * 100),
        currency: q.priceBreakdown.currency,
        eta_minutes: null, // Lalamove doesn't return an ETA on quotes
        expires_at: Date.parse(q.expiresAt),
        ref: { quotationId: q.quotationId, senderStopId: q.stops[0].stopId, recipientStopId: q.stops[1].stopId },
      };
    },

    async createOrder({ ref, customer, notes }) {
      const o = await call<{ orderId: string; shareLink?: string }>("POST", "/v3/orders", {
        quotationId: ref.quotationId,
        sender: { stopId: ref.senderStopId, name: env.PICKUP_NAME, phone: env.PICKUP_PHONE },
        recipients: [{ stopId: ref.recipientStopId, name: customer.name, phone: customer.phone, remarks: notes ?? "" }],
        isPODEnabled: true,
      });
      return { id: `lm_${o.orderId}`, tracking_url: o.shareLink ?? null };
    },

    async getStatus(orderId): Promise<ProviderStatus> {
      const o = await call<{ status: string; driverId?: string; shareLink?: string }>(
        "GET",
        `/v3/orders/${encodeURIComponent(orderId.replace(/^lm_/, ""))}`,
      );
      return {
        status: STATUS_MAP[o.status] ?? "finding_courier",
        courier: o.driverId ? { id: o.driverId } : null,
        eta_minutes: null,
        tracking_url: o.shareLink ?? null,
      };
    },
  };
}
