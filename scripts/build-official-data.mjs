#!/usr/bin/env node
// Builds api/data/generated/additives.generated.json from open official-data sources.
//
//   node scripts/build-official-data.mjs            (downloads the sources)
//   node scripts/build-official-data.mjs --offline  (uses copies in data-sources/)
//
// Sources
//  1. Open Food Facts additives taxonomy (ODbL). It aggregates EFSA re-evaluations:
//     the EFSA opinion, its date and link, the ADI and EFSA's over-exposure findings,
//     plus E-numbers, names in many languages (incl. Hindi/Marathi), additive class and
//     vegan/vegetarian/palm-oil flags.
//  2. Optional: data-sources/iarc.csv, the CSV export of IARC's "List of
//     Classifications" (monographs.iarc.who.int/list-of-classifications, "CSV" button).
//     IARC has no download API, so refresh this file by hand after each IARC meeting.
//  3. Optional: data-sources/fssai.csv, India-specific notes transcribed from the FSSAI
//     Food Additives Regulations (columns: ins,status,note,source_url). FSSAI only
//     publishes PDFs, so this file is maintained by hand.
//
// The hand-curated files (api/data/foodAdditives.json, cosmeticIngredients.json) always
// take priority over this generated file at lookup time.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(ROOT, "data-sources");
const OUT = path.join(ROOT, "api", "data", "generated", "additives.generated.json");
const OFF_URL = "https://raw.githubusercontent.com/openfoodfacts/openfoodfacts-server/main/taxonomies/additives.txt";
const OFFLINE = process.argv.includes("--offline");

// ---------- helpers ----------
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const stripLang = (v) => clean(v).replace(/^en:/, "").replace(/\ben:/g, "");
const codeKey = (s) => clean(s).toLowerCase().replace(/^(e|ins)\s*-?\s*/, "").replace(/[()\s]/g, "");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map((h) => clean(h).toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, clean(r[i])])));
}

async function loadText(url, localName) {
  const local = path.join(SRC_DIR, localName);
  if (OFFLINE) return fs.readFileSync(local, "utf8");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const text = await res.text();
  fs.mkdirSync(SRC_DIR, { recursive: true });
  fs.writeFileSync(local, text);
  return text;
}

// ---------- 1. Open Food Facts taxonomy ----------
function parseTaxonomy(text) {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  const out = [];
  for (const block of blocks) {
    const names = {}; const props = {};
    for (const raw of block.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || line.startsWith("<")) continue;
      let m = line.match(/^([a-z_]+):([a-z]{2}):\s*(.*)$/);
      if (m && m[1].length > 2) { props[m[1]] = m[3]; continue; }
      m = line.match(/^([a-z]{2}(?:-[a-z]{2,4})?):\s*(.*)$/);
      // Commas inside a name are escaped as "\\," in the taxonomy.
      if (m) names[m[1]] = m[2].split(/(?<!\\),/).map((n) => clean(n.replace(/\\,/g, ","))).filter(Boolean);
    }
    if (props.e_number && names.en) out.push({ names, props });
  }
  return out;
}

const listify = (v) => stripLang(v).split(/,\s*/).map(clean).filter(Boolean);

function toRecord({ names, props }) {
  // The first English name is the code, e.g. "E211" or a sub-variant like "E322(i)".
  const first = names.en[0] || "";
  const eNumber = /^e\d/i.test(first) ? first.toUpperCase().replace(/\s+/g, "") : `E${clean(props.e_number).toUpperCase()}`;
  const isVariant = /\(/.test(eNumber);
  const enNames = names.en.filter((n) => !/^e\d/i.test(n));
  const displayName = enNames[0] || eNumber;
  const aliases = new Set();
  for (const lang of ["en", "hi", "mr", "xx"]) for (const n of names[lang] || []) aliases.add(n.toLowerCase());
  const code = clean(props.e_number).toLowerCase();
  // Only the main entry claims the bare code; sub-variants keep their own "(i)" code.
  if (!isVariant) [`e${code}`, `e ${code}`, `ins ${code}`, `ins${code}`].forEach((a) => aliases.add(a));
  else aliases.delete(`e${code}`);

  const hasEfsa = Boolean(props.efsa_evaluation || props.efsa_evaluation_adi);
  const efsaBits = [];
  if (props.efsa_evaluation_adi) efsaBits.push(`ADI ${clean(props.efsa_evaluation_adi)} mg/kg body weight/day`);
  if (props.efsa_evaluation_date) efsaBits.push(`evaluated ${clean(props.efsa_evaluation_date).replace(/\//g, "-")}`);
  if (props.efsa_evaluation_overexposure_risk) efsaBits.push(`over-exposure risk: ${stripLang(props.efsa_evaluation_overexposure_risk)}`);
  if (props.efsa_evaluation_exposure_mean_greater_than_adi)
    efsaBits.push(`average intake above ADI for: ${listify(props.efsa_evaluation_exposure_mean_greater_than_adi).join(", ")}`);
  if (props.efsa_evaluation && !efsaBits.length) efsaBits.push(clean(props.efsa_evaluation));

  const yesNo = (v) => (v ? stripLang(v).toLowerCase() : null); // "yes" | "no" | "maybe"
  const sourceLinks = [];
  if (props.efsa_evaluation_url) sourceLinks.push({ body: "EFSA", url: clean(props.efsa_evaluation_url) });
  sourceLinks.push({ body: "Open Food Facts", url: `https://world.openfoodfacts.org/facets/additives/${eNumber.toLowerCase()}` });

  return {
    id: `off-${eNumber.toLowerCase().replace(/[()]/g, "")}`,
    isVariant,
    displayName,
    eNumber,
    aliases: [...aliases],
    classes: props.additives_classes ? listify(props.additives_classes) : [],
    diet: {
      vegan: yesNo(props.vegan),
      vegetarian: yesNo(props.vegetarian),
      fromPalmOil: yesNo(props.from_palm_oil),
    },
    verified: hasEfsa,
    regulatory: hasEfsa ? { EFSA_EU: efsaBits.join("; ") } : {},
    knownConcerns: props.efsa_evaluation_overexposure_risk && /high|yes/.test(props.efsa_evaluation_overexposure_risk)
      ? "EFSA found some population groups may exceed the acceptable daily intake."
      : null,
    sourceLinks,
  };
}

// ---------- 2. IARC (optional) ----------
function loadIarc() {
  const file = path.join(SRC_DIR, "iarc.csv");
  if (!fs.existsSync(file)) return null;
  const rows = parseCsv(fs.readFileSync(file, "utf8"));
  const byName = new Map();
  for (const r of rows) {
    const agent = (r.agent || "").toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
    const group = r.group || r["group "] || "";
    if (agent && group) byName.set(agent, { group, volume: r.volume || "", year: r["evaluation year"] || r["volume publication year"] || "" });
  }
  return byName;
}

// ---------- 3. FSSAI (optional, hand-maintained) ----------
function loadFssai() {
  const file = path.join(SRC_DIR, "fssai.csv");
  if (!fs.existsSync(file)) return null;
  const map = new Map();
  for (const r of parseCsv(fs.readFileSync(file, "utf8"))) {
    if (r.ins) map.set(codeKey(r.ins), r);
  }
  return map;
}

// ---------- main ----------
const offText = await loadText(OFF_URL, "off-additives.txt");
const seenIds = new Set();
const records = parseTaxonomy(offText).map(toRecord).filter((r) => !seenIds.has(r.id) && seenIds.add(r.id));

const iarc = loadIarc();
const fssai = loadFssai();
let iarcHits = 0, fssaiHits = 0;
for (const rec of records) {
  if (iarc) {
    const hit = [rec.displayName, ...rec.aliases].map((n) => iarc.get(n.toLowerCase())).find(Boolean);
    if (hit) {
      rec.regulatory.IARC = `Group ${hit.group}${hit.volume ? ` (IARC Monographs vol. ${hit.volume}${hit.year ? `, ${hit.year}` : ""})` : ""}`;
      rec.sourceLinks.push({ body: "IARC", url: "https://monographs.iarc.who.int/list-of-classifications" });
      rec.verified = true; iarcHits++;
    }
  }
  if (fssai) {
    const hit = fssai.get(codeKey(rec.eNumber));
    if (hit) {
      rec.regulatory.FSSAI = [hit.status, hit.note].filter(Boolean).join(" - ");
      if (hit.source_url) rec.sourceLinks.push({ body: "FSSAI", url: hit.source_url });
      rec.verified = true; fssaiHits++;
    }
  }
}

records.sort((a, b) => a.eNumber.localeCompare(b.eNumber, "en", { numeric: true }));
const output = {
  _meta: {
    generatedAt: new Date().toISOString(),
    generator: "scripts/build-official-data.mjs",
    counts: { total: records.length, verified: records.filter((r) => r.verified).length, iarcMatches: iarcHits, fssaiMatches: fssaiHits },
    sources: [
      { name: "Open Food Facts additives taxonomy (aggregates EFSA re-evaluations)", url: OFF_URL, license: "ODbL 1.0 - attribution and share-alike required" },
      ...(iarc ? [{ name: "IARC List of Classifications", url: "https://monographs.iarc.who.int/list-of-classifications" }] : []),
      ...(fssai ? [{ name: "FSSAI Food Additives Regulations (hand-transcribed)", url: "https://fssai.gov.in/cms/Compendium-FSS-FPS-FA.php" }] : []),
    ],
  },
  additives: records,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(output, null, 1) + "\n");
console.log(`Wrote ${records.length} additives (${output._meta.counts.verified} with official evaluations) to ${path.relative(ROOT, OUT)}`);
if (records.length < 300) { console.error("Suspiciously few records - source format may have changed."); process.exit(1); }
