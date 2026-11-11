// Runs the worker's fetch handler in Node against the mock provider. No network needed.
import worker from "../src/index";
import type { Env } from "../src/types";

const env: Env = {
  PROVIDER: "mock",
  CURRENCY: "USD",
  COUNTRY: "US",
  QUOTE_SECRET: "test-secret",
  PICKUP_NAME: "Test Bakery",
  PICKUP_ADDRESS: "1600 Stockton St, San Francisco, CA 94133",
  PICKUP_LAT: "37.8008",
  PICKUP_LNG: "-122.4091",
  PICKUP_PHONE: "+13235550100",
  MOCK_MINUTES_PER_STAGE: "0.001", // ~60 ms per stage
};

const base = "https://svc.test";
let failures = 0;
async function call(method: string, path: string, body?: unknown) {
  const res = await worker.fetch(
    new Request(base + path, { method, body: body ? JSON.stringify(body) : undefined, headers: { "Content-Type": "application/json" } }),
    env,
  );
  return { status: res.status, data: (await res.json()) as any };
}
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    console.log("      ", JSON.stringify(detail));
  }
}

const items = [
  { name: "Le Classique", unit_price: 4.75, quantity: 4 },
  { name: "Concha Rosa", unit_price: 4.75, quantity: 2 },
];
const dropoff = { address: "2100 Chestnut St, San Francisco, CA 94123" };

const q = await call("POST", "/quote", { dropoff, items });
check("quote 200", q.status === 200, q);
check("subtotal computed in code", q.data.subtotal === 28.5, q.data);
check("total = subtotal + fee", Math.abs(q.data.total - (q.data.subtotal + q.data.delivery_fee)) < 0.001, q.data);

const tampered = q.data.quote_id.replace(/^./, (c: string) => (c === "a" ? "b" : "a"));
const t = await call("POST", "/order", { quote_id: tampered, customer: { name: "Ana", phone: "+13235550111" } });
check("tampered quote rejected", t.status === 400 && t.data.error.code === "invalid_quote", t);

const badPhone = await call("POST", "/order", { quote_id: q.data.quote_id, customer: { name: "Ana", phone: "5511" } });
check("bad phone rejected", badPhone.data.error?.code === "invalid_phone", badPhone);

const far = await call("POST", "/quote", { dropoff: { address: "Somewhere far away, Sacramento CA" }, items });
check("out of range → 422", far.status === 422 && far.data.error.code === "out_of_range", far);

const empty = await call("POST", "/quote", { dropoff, items: [] });
check("empty cart rejected", empty.data.error?.code === "empty_cart", empty);

const o = await call("POST", "/order", { quote_id: q.data.quote_id, customer: { name: "Ana", phone: "+1 323 555 0111" } });
check("order 201", o.status === 201 && o.data.order_id.startsWith("mock_"), o);

const s1 = await call("GET", `/order/${o.data.order_id}`);
check("status starts at finding_courier", s1.data.status === "finding_courier", s1.data);
await new Promise((r) => setTimeout(r, 300));
const s2 = await call("GET", `/order/${o.data.order_id}`);
check("status reaches delivered", s2.data.status === "delivered", s2.data);

const page = await worker.fetch(new Request(`${base}/track/${o.data.order_id}`), env);
check("tracking page renders", page.status === 200 && (await page.text()).includes("Delivered"));

const missing = await call("GET", "/order/nope");
check("unknown order → error", missing.status >= 400, missing);

console.log(failures ? `\n${failures} failed` : "\nAll passed");
(globalThis as any).process.exitCode = failures ? 1 : 0;
