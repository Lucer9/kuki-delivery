export interface Env {
  PROVIDER: "mock" | "lalamove";
  CURRENCY: string;
  QUOTE_SECRET: string;
  SERVICE_TOKEN?: string;
  PICKUP_NAME: string;
  PICKUP_ADDRESS: string;
  PICKUP_LAT: string;
  PICKUP_LNG: string;
  PICKUP_PHONE: string;
  MOCK_MINUTES_PER_STAGE?: string;
  LALAMOVE_BASE_URL?: string;
  LALAMOVE_MARKET?: string;
  LALAMOVE_SERVICE_TYPE?: string;
  LALAMOVE_API_KEY?: string;
  LALAMOVE_API_SECRET?: string;
}

export interface Address {
  address: string;
  lat?: number;
  lng?: number;
}

export interface Customer {
  name: string;
  phone: string; // E.164, e.g. +5255...
}

/** One normalized status set, whatever the provider reports. */
export type DeliveryStatus =
  | "finding_courier"
  | "courier_assigned"
  | "picked_up"
  | "delivered"
  | "canceled";

export interface ProviderQuote {
  /** Amounts are in minor units (centavos). */
  fee: number;
  currency: string;
  eta_minutes: number | null;
  /** When the provider stops honoring this price. */
  expires_at: number;
  /** Opaque data the provider needs again at order time. */
  ref: Record<string, string>;
}

export interface ProviderOrder {
  id: string; // provider-prefixed, e.g. "mock_..." or "lm_..."
  tracking_url: string | null;
}

export interface ProviderStatus {
  status: DeliveryStatus;
  courier: { name?: string; phone?: string; id?: string } | null;
  eta_minutes: number | null;
  tracking_url: string | null;
}

/** Each delivery API implements this. The routes never touch a provider directly. */
export interface DeliveryProvider {
  name: "mock" | "lalamove";
  quote(dropoff: Address): Promise<ProviderQuote>;
  createOrder(input: {
    ref: Record<string, string>;
    dropoff: Address;
    customer: Customer;
    notes?: string;
    origin: string;
  }): Promise<ProviderOrder>;
  getStatus(orderId: string, origin: string): Promise<ProviderStatus>;
}

/** Errors shaped so the agent can relay them to the customer. */
export class ServiceError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
