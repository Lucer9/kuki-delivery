// A stateless fake courier service for demos and tests.
// Status advances with time, computed from the timestamp in the order ID.
// Magic addresses help demo error handling in the chat:
//   contains "lejos" / "far"      → out of delivery range
//   contains "cancel"             → the delivery gets canceled after pickup
import type { Address, DeliveryProvider, DeliveryStatus, Env, ProviderStatus } from "../types";
import { ServiceError } from "../types";

const STAGES: DeliveryStatus[] = ["finding_courier", "courier_assigned", "picked_up", "delivered"];
const COURIERS = ["Lupita R.", "Mateo S.", "Fer G.", "Diego M."];

function hash(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Deterministic fake distance (2–9 km) so the same address always gets the same price. */
const fakeKm = (address: string) => 2 + (hash(address.toLowerCase()) % 70) / 10;

export function mockProvider(env: Env): DeliveryProvider {
  const stageMs = Number(env.MOCK_MINUTES_PER_STAGE ?? "1") * 60_000;

  return {
    name: "mock",

    async quote(dropoff: Address) {
      const a = dropoff.address.toLowerCase();
      if (a.includes("lejos") || a.includes("far")) {
        throw new ServiceError(422, "out_of_range", "That address is outside our delivery area.");
      }
      const km = fakeKm(dropoff.address);
      return {
        fee: Math.round((35 + 8 * km) * 100), // 35 MXN base + 8 MXN/km
        currency: env.CURRENCY,
        eta_minutes: Math.round(15 + 3 * km),
        expires_at: Date.now() + 5 * 60_000,
        ref: { km: km.toFixed(1) },
      };
    },

    async createOrder({ dropoff, origin }) {
      const flag = dropoff.address.toLowerCase().includes("cancel") ? "x" : "o";
      const id = `mock_${Date.now().toString(36)}_${flag}${crypto.randomUUID().slice(0, 6)}`;
      return { id, tracking_url: `${origin}/track/${id}` };
    },

    async getStatus(orderId: string, origin: string): Promise<ProviderStatus> {
      const [, ts, tail] = orderId.split("_");
      const created = parseInt(ts ?? "", 36);
      if (!Number.isFinite(created) || !tail) {
        throw new ServiceError(404, "order_not_found", "I couldn't find that order.");
      }
      const stage = Math.min(Math.floor((Date.now() - created) / stageMs), STAGES.length - 1);
      const status: DeliveryStatus = tail.startsWith("x") && stage >= 3 ? "canceled" : STAGES[stage];
      const courier =
        stage >= 1 ? { name: COURIERS[hash(orderId) % COURIERS.length], phone: "+525500000000" } : null;
      const remaining = status === "delivered" || status === "canceled" ? 0 : (STAGES.length - 1 - stage) * (stageMs / 60_000);
      return { status, courier, eta_minutes: remaining, tracking_url: `${origin}/track/${orderId}` };
    },
  };
}
