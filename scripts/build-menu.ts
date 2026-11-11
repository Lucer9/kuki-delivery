// Renders menu/menu.json into the menu section of agent/instructions.md,
// so the agent's instructions and the menu data never drift apart.
import { readFileSync, writeFileSync } from "node:fs";

interface Flavor {
  slug: string;
  name: string;
  lineup: "classic" | "rotating";
  description: string;
  allergens: string[];
  calories: number;
}
interface Menu {
  currency: string;
  notes: string;
  sizes: { label: string; count: number; price: number }[];
  flavors: Flavor[];
}

const menu = JSON.parse(readFileSync("menu/menu.json", "utf8")) as Menu;
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: menu.currency }).format(n);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const allergenCell = (a: string[]) =>
  a.map((x) => (/nut|peanut/i.test(x) ? `**${x}**` : x)).map((x, i) => (i === 0 ? cap(x) : x)).join(", ");

function table(lineup: Flavor["lineup"]): string {
  const rows = menu.flavors
    .filter((f) => f.lineup === lineup)
    .map((f) => `| **${f.name}** | ${f.description.replace(/\.$/, "")} | ${allergenCell(f.allergens)} | ~${f.calories} |`);
  return ["| Cookie | What it is | Allergens | Calories (whole cookie) |", "|---|---|---|---|", ...rows].join("\n");
}

const sixPack = menu.sizes.find((s) => s.count === 6);
const block = `## Menu (prices in ${menu.currency})

### Classics (always available)

${table("classic")}

### This week's rotating flavors

${table("rotating")}

${menu.notes}

| Size | Price |
|---|---|
${menu.sizes.map((s) => `| ${s.label} | ${money(s.price)} |`).join("\n")}

Boxes can mix any flavors, classic or rotating.${
  sixPack ? ` If someone picks 5 singles, suggest the 6-pack ("one more and it's a 6-pack for ${money(sixPack.price)}").` : ""
}`;

const path = "agent/instructions.md";
const doc = readFileSync(path, "utf8");
const re = /(<!-- menu:start[^>]*-->\n)[\s\S]*?(<!-- menu:end -->)/;
if (!re.test(doc)) throw new Error("menu markers not found in agent/instructions.md");
// Replacer function, not a string: prices like "$17.50" would otherwise be read as "$1".
writeFileSync(path, doc.replace(re, (_m: string, open: string, close: string) => `${open}${block}\n${close}`));
console.log(`Wrote ${menu.flavors.length} flavors into ${path}`);
