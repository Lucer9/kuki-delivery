import type { Address } from "./types";
import { ServiceError } from "./types";

/**
 * Lalamove and Uber Direct both want coordinates. Uses the caller's lat/lng when given,
 * otherwise geocodes with OpenStreetMap Nominatim (fine for a demo; for production use a
 * paid geocoder plus address autocomplete so the customer confirms the pin).
 */
export async function geocode(a: Address): Promise<{ lat: number; lng: number }> {
  if (a.lat !== undefined && a.lng !== undefined) return { lat: a.lat, lng: a.lng };
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(a.address)}`;
  const res = await fetch(url, { headers: { "User-Agent": "delivery-service-demo/0.1" } });
  const hits = (await res.json().catch(() => [])) as { lat: string; lon: string }[];
  if (!hits[0]) {
    throw new ServiceError(422, "address_not_found", "I couldn't find that address. Could you add the colonia and postal code?");
  }
  return { lat: Number(hits[0].lat), lng: Number(hits[0].lon) };
}
