// Stateless, tamper-proof quote tokens: base64url(JSON) + "." + HMAC-SHA256.
// No database is needed between /quote and /order, and the agent can't edit the price.
import { ServiceError } from "./types";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function sign<T>(payload: T, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign("HMAC", await key(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verify<T>(token: string, secret: string): Promise<T> {
  const [body, sig] = token.split(".");
  if (!body || !sig) throw new ServiceError(400, "invalid_quote", "That quote ID isn't valid. Please get a new quote.");
  const ok = await crypto.subtle.verify("HMAC", await key(secret), fromB64url(sig), enc.encode(body));
  if (!ok) throw new ServiceError(400, "invalid_quote", "That quote ID isn't valid. Please get a new quote.");
  return JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
}
