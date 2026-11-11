// Cart math happens here, in code, so the model never adds up prices itself.
import { ServiceError } from "./types";

export interface CartItem {
  name: string;
  unit_price: number; // major units, e.g. 4.75 USD
  quantity: number;
}

export interface PricedLine {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

const MAX_QTY = 48;

/** Returns lines and subtotal in minor units (centavos). */
export function priceCart(items: unknown): { lines: PricedLine[]; subtotal: number } {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError(400, "empty_cart", "The cart is empty. Add at least one item before quoting.");
  }
  const lines = items.map((raw, i): PricedLine => {
    const it = raw as Partial<CartItem>;
    if (typeof it.name !== "string" || !it.name.trim()) {
      throw new ServiceError(400, "invalid_item", `Item ${i + 1} is missing a name.`);
    }
    if (typeof it.unit_price !== "number" || !Number.isFinite(it.unit_price) || it.unit_price < 0) {
      throw new ServiceError(400, "invalid_item", `"${it.name}" needs a valid unit_price.`);
    }
    if (!Number.isInteger(it.quantity) || (it.quantity as number) < 1 || (it.quantity as number) > MAX_QTY) {
      throw new ServiceError(400, "invalid_item", `"${it.name}" quantity must be a whole number from 1 to ${MAX_QTY}.`);
    }
    const unit = Math.round(it.unit_price * 100);
    return { name: it.name.trim(), quantity: it.quantity!, unit_price: unit, line_total: unit * it.quantity! };
  });
  return { lines, subtotal: lines.reduce((s, l) => s + l.line_total, 0) };
}

export const toMajor = (minor: number) => Math.round(minor) / 100;

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(minor / 100);
}
