// api/lib/groundingLookup.js
//
// Matches ingredient text against the curated official-source datasets in api/data/.
// Purpose: stop the LLM from being the *only* source of truth for "is this ingredient
// safe" — anything we have an official regulatory record for should be backed by that
// record, not by model recall.
//
// This module is intentionally dependency-free (no npm installs needed) so it runs
// as-is in a Vercel serverless function.

const foodAdditives = require("../data/foodAdditives.json");
const cosmeticIngredients = require("../data/cosmeticIngredients.json");

// ---- Normalization -----------------------------------------------------

function normalize(str) {
  if (!str) return "";
  return String(str)
    .toLowerCase()
    .replace(/\(.*?\)/g, " ") // drop parenthetical asides for the primary match
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Pull out E-number / INS-number style tokens, e.g. "E211", "E 211", "INS 211", "211(i)"
function extractCodeNumbers(str) {
  if (!str) return [];
  const codes = [];
  const eMatches = String(str).matchAll(/\be\s?-?\s?(\d{3}[a-z]?)\b/gi);
  for (const m of eMatches) codes.push(m[1].toLowerCase());
  const insMatches = String(str).matchAll(/\bins\s?(\d{3}[a-z]?)\b/gi);
  for (const m of insMatches) codes.push(m[1].toLowerCase());
  return [...new Set(codes)];
}

// ---- Build a flat, searchable index out of both datasets ----------------

function buildIndex() {
  const records = [];

  for (const item of foodAdditives.additives || []) {
    records.push({
      ...item,
      _datasetSource: "Food/Beverage additive database (JECFA / EFSA / FDA / FSSAI / IARC)",
      _aliasSet: new Set(
        [item.displayName, ...(item.aliases || [])].map(normalize).filter(Boolean)
      ),
      _codeSet: new Set(
        [item.eNumber]
          .filter(Boolean)
          .flatMap((e) => extractCodeNumbers(e))
      ),
    });
  }

  for (const item of cosmeticIngredients.ingredients || []) {
    records.push({
      ...item,
      _datasetSource: "Cosmetic ingredient database (EU CosIng/SCCS / FDA / India CDSCO-BIS)",
      _aliasSet: new Set(
        [item.displayName, ...(item.aliases || [])].map(normalize).filter(Boolean)
      ),
      _codeSet: new Set(),
    });
  }

  return records;
}

let _cachedIndex = null;
function getIndex() {
  if (!_cachedIndex) _cachedIndex = buildIndex();
  return _cachedIndex;
}

// ---- Matching -------------------------------------------------------------

// Returns the best-matching grounding record for a single ingredient string, or null.
function matchOne(ingredientText) {
  const norm = normalize(ingredientText);
  if (!norm) return null;

  const index = getIndex();
  const codes = extractCodeNumbers(ingredientText);

  // 1. Exact code match (e.g. "E211" in the text matches eNumber 211)
  if (codes.length) {
    for (const rec of index) {
      for (const code of codes) {
        if (rec._codeSet.has(code)) return rec;
      }
    }
  }

  // 2. Exact alias match
  for (const rec of index) {
    if (rec._aliasSet.has(norm)) return rec;
  }

  // 3. Substring match in either direction (handles "Sodium Benzoate (Preservative)"
  //    or OCR text like "sodium benzoate e211 preservative")
  for (const rec of index) {
    for (const alias of rec._aliasSet) {
      if (alias.length < 4) continue; // avoid noisy short-alias false positives
      if (norm.includes(alias) || alias.includes(norm)) return rec;
    }
  }

  return null;
}

// Given the raw ingredient text the user typed/OCR'd, split it into rough candidate
// tokens and match each one. Used to build the "verified data" block we feed the LLM
// *before* it reasons, so its narrative is grounded rather than invented.
function splitCandidates(rawText) {
  if (!rawText) return [];
  return rawText
    .split(/[,;]|(?<=\))\s+(?=[A-Z])/) // split on commas/semicolons, and after a closing paren
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildGroundingContext(rawText) {
  const candidates = splitCandidates(rawText);
  const matches = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const rec = matchOne(candidate);
    if (rec && !seen.has(rec.id)) {
      seen.add(rec.id);
      matches.push(rec);
    }
  }

  return { candidateCount: candidates.length, matches };
}

// Render the matched records into a compact block to inject into the LLM prompt.
function formatGroundingPromptBlock(matches) {
  if (!matches.length) {
    return "VERIFIED OFFICIAL DATA: none of the listed ingredients matched our curated regulatory database. Treat all ingredients as AI-assessed from general knowledge and say so.";
  }

  const lines = matches.map((m) => {
    const regBits = Object.entries(m.regulatory || {})
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" | ");
    return `- "${m.displayName}" (${m.eNumber || m.casNumber || "no code"}): ${regBits}. Known concern note: ${m.knownConcerns || "none on file"}.`;
  });

  return [
    "VERIFIED OFFICIAL DATA (ground truth — do not contradict this, and do not invent ADI/IARC/regulatory numbers for these specific ingredients beyond what's given here):",
    ...lines,
    "For every ingredient listed above, set officialSource to true in your JSON output and base flag/healthImpact on the data given. For any OTHER ingredient not listed above, set officialSource to false and rely on general knowledge, clearly treating it as AI-assessed rather than regulator-verified.",
  ].join("\n");
}

// After the LLM returns its parsed ingredient list, deterministically re-attach the
// official record by matching on the LLM's own (cleaned-up) ingredient name. This is
// the safety net in case the LLM ignores the prompt instruction above — we don't trust
// the model to faithfully copy regulatory facts, we attach them ourselves.
function attachGroundingToIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return ingredients;

  return ingredients.map((ing) => {
    const rec = matchOne(ing.name || "");
    if (!rec) {
      return { ...ing, officialSource: false, officialSourceDetails: null };
    }
    return {
      ...ing,
      officialSource: true,
      officialSourceDetails: {
        matchedName: rec.displayName,
        code: rec.eNumber || rec.casNumber || null,
        regulatory: rec.regulatory,
        knownConcerns: rec.knownConcerns,
        sourceLinks: rec.sourceLinks || [],
        dataset: rec._datasetSource,
      },
    };
  });
}

module.exports = {
  normalize,
  matchOne,
  buildGroundingContext,
  formatGroundingPromptBlock,
  attachGroundingToIngredients,
};
