import type { Address } from "./types";
import { ServiceError } from "./types";

export interface Geo {
  lat: number;
  lng: number;
  /** Structured parts when the geocoder returns them (Uber Direct prefers these). */
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country: string; // ISO 3166-1 alpha-2, e.g. "US"
}

/**
 * Lalamove and Uber Direct both want coordinates. Geocodes with OpenStreetMap Nominatim
 * (fine for a demo; for production use a paid geocoder plus address autocomplete so the
 * customer confirms the pin). Caller-provided lat/lng still gets geocoded for the parts.
 */
export async function geocode(a: Address, country: string): Promise<Geo> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1` +
    `&countrycodes=${country.toLowerCase()}&q=${encodeURIComponent(a.address)}`;
  const res = await fetch(url, { headers: { "User-Agent": "delivery-service-demo/0.1" } });
  const hits = (await res.json().catch(() => [])) as {
    lat: string;
    lon: string;
    address?: Record<string, string>;
  }[];
  const hit = hits[0];
  if (!hit) {
    if (a.lat !== undefined && a.lng !== undefined) return { lat: a.lat, lng: a.lng, country };
    throw new ServiceError(422, "address_not_found", "I couldn't find that address. Could you add the city and ZIP code?");
  }
  const p = hit.address ?? {};
  return {
    lat: a.lat ?? Number(hit.lat),
    lng: a.lng ?? Number(hit.lon),
    street: [p.house_number, p.road].filter(Boolean).join(" ") || undefined,
    city: p.city ?? p.town ?? p.village ?? p.suburb,
    state: p.state,
    zip: p.postcode,
    country: (p.country_code ?? country).toUpperCase(),
  };
}
