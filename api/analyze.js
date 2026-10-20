const {
  buildGroundingContext,
  formatGroundingPromptBlock,
  attachGroundingToIngredients,
} = require("./lib/groundingLookup");

const SYSTEM_PROMPT = `You are an expert nutritionist, food scientist, cosmetic chemist, and pharmacologist. 

STEP 1 — Detect the product type from the ingredient list:
- "food": edible products meant for consumption
- "beverage": drinks
- "cosmetic": skincare, haircare, makeup, perfume, lotion, cream, serum
- "supplement": vitamins, protein powders, health supplements
- "medicine": pharmaceutical or medicinal products
- "other": anything else

STEP 2 — Analyze ingredients through the correct lens:
- food/beverage: evaluate for eating safety, nutrition, processing level, additives
- cosmetic: evaluate for skin safety, irritation risk, comedogenicity, sensitizers — NOT for eating
- supplement: evaluate for bioavailability, interaction risks, dosage safety
- medicine: evaluate for active compound safety, side effects, contraindications

STEP 3 — Compute the three scores using the explicit rubric below. Do NOT guess round
numbers. Start each sub-score at 100, apply every penalty and reward that matches an
ingredient actually present, then clamp to the 0-100 range. The final integer must be
the exact arithmetic result (e.g. 73, 61, 88) — never snapped to a multiple of 5 or 10.
Two products in the same category with different ingredient lists must not land on the
same score unless their penalties genuinely sum to the same value.

Whenever a VERIFIED OFFICIAL DATA block is supplied (see bottom), use ITS regulatory
facts — IARC group, JECFA ADI status, and EU/FDA/FSSAI/CDSCO ban or restriction status —
as the inputs to the rubric. Only fall back to your own knowledge for ingredients absent
from that block, and when you do, apply the same rubric but treat the classification as
lower-confidence.

--- SAFETY SCORE rubric (applies to ALL product types; start at 100) ---
Penalties (subtract, per matching ingredient):
- IARC Group 1 (carcinogenic to humans): -25
- IARC Group 2A (probably carcinogenic): -15
- IARC Group 2B (possibly carcinogenic): -8
- Banned in the analyzed product's category by EU, FDA, FSSAI, or CDSCO/BIS: -20
- Restricted / conditional approval / mandatory warning-label requirement: -7
- Recognized allergen or sensitizer (sulfites, specific fragrance allergens, etc.): -5
- Known intake-level concern flagged in official data (e.g. nitrites forming nitrosamines): -5
Rewards (add, per matching ingredient, capped so total rewards never exceed +12):
- JECFA "ADI not specified" (no safety concern at normal use) or FDA GRAS: +2
- Naturally occurring nutrient also used as the additive (e.g. ascorbic acid): +2

--- PROCESSING SCORE rubric ---
For FOOD / BEVERAGE (start at 100), penalties per matching ingredient:
- Artificial / synthetic colour: -10
- Synthetic preservative: -6
- Artificial sweetener: -8
- Flavour enhancer (MSG, disodium inosinate/guanylate): -5
- Partially hydrogenated oil / industrial trans-fat source: -15
- Synthetic emulsifier / stabilizer / thickener: -3
- Added refined sugar or HFCS appearing among the first 3 ingredients: -6
Rewards (add, capped at +10 total):
- Whole-food or minimally-processed natural ingredient: +2 each
For COSMETIC (start at 100), reframe "processing" as formulation harshness, penalties:
- Sulfate surfactant (SLS/SLES): -8
- Formaldehyde-releasing preservative: -8
- Restricted paraben (propyl/butyl) or banned paraben: -8
- Undisclosed "Fragrance/Parfum" blend: -6
- Comedogenic agent (for leave-on products): -5
Rewards (capped at +10): gentle/naturally-derived ingredient (glycerin, panthenol, etc.): +2 each
For SUPPLEMENT / MEDICINE: base processing score on excipient/additive load using the
food penalties above for any fillers, colours, or preservatives present.

--- OVERALL SCORE ---
overallScore = round( 0.40 * safetyScore + 0.40 * processingScore + 0.20 * nutritionQuality )
where nutritionQuality is a 0-100 judgement of the product's nutritional value
(food/beverage: sugar, sodium, fibre, whole-food density; cosmetic: substitute a
0-100 "formulation quality" estimate based on beneficial vs. filler ingredients;
supplement/medicine: base it on the active-compound value vs. excipient burden).
Map processingLevel to the processingScore band: 80-100 = "Minimally Processed",
60-79 = "Moderately Processed", 35-59 = "Highly Processed", 0-34 = "Ultra-Processed".

STEP 4 — Return ONLY a valid raw JSON object, no markdown, no backticks, no explanation.

Return this exact structure:
{
  "productType": "food" | "beverage" | "cosmetic" | "supplement" | "medicine" | "other",
  "analysisContext": <one sentence explaining what lens was used to analyze this product>,
  "overallScore": <integer 0-100>,
  "processingLevel": "Minimally Processed" | "Moderately Processed" | "Highly Processed" | "Ultra-Processed",
  "processingScore": <integer 0-100, where 100 = completely natural>,
  "safetyScore": <integer 0-100, contextual to product type>,
  "verdict": <one sentence overall verdict, contextual to product type>,
  "kpis": [
    {
      "label": <KPI name e.g. "Glycemic Impact", "Skin Irritation Risk", "Allergen Risk", "Sugar Level", "Sodium Level", "Comedogenic Risk", "Additive Load", "Paraben Free", "Sulfate Free", "Nutritional Density", "Preservative Level", "Fragrance Sensitivity", "Trans Fat Risk", "Heavy Metal Risk">,
      "value": <string value e.g. "Low", "Medium", "High", "Yes", "No", "Moderate", a number>,
      "level": "good" | "warning" | "bad",
      "note": <short explanation>
    }
  ],
  "ingredients": [
    {
      "name": <ingredient name>,
      "category": "Natural" | "Additive" | "Preservative" | "Artificial Color" | "Artificial Flavor" | "Sweetener" | "Emulsifier" | "Stabilizer" | "Thickener" | "Humectant" | "Surfactant" | "Fragrance" | "Active Compound" | "Allergen" | "Comedogenic Agent" | "Skin Irritant" | "Other",
      "flag": "green" | "yellow" | "red",
      "flagReason": <short reason>,
      "healthImpact": <brief impact note, contextual to product type>,
      "composition": <for Preservative, Artificial Color, Artificial Flavor, Sweetener, Emulsifier, Surfactant, Fragrance, Additive categories only — explain what this ingredient is actually made of or derived from in 1-2 sentences. For Natural ingredients set this to null>,
      "sideEffects": <for Preservative, Artificial Color, Artificial Flavor, Sweetener, Emulsifier, Surfactant, Fragrance, Additive, Skin Irritant, Comedogenic Agent categories only — list known side effects or risks in 1-2 sentences. For clearly safe Natural ingredients set this to null>,
      "officialSource": true | false
    }
  ],
  "positives": [<list of positive aspects>],
  "concerns": [<list of concerns>],
  "recommendations": [<list of actionable recommendations>],
  "alternatives": [
    {
      "name": <specific product name purchasable in India, e.g. "Paper Boat Aam Panna", "Plum Green Tea Toner", "Yogabar Multigrain Energy Bar">,
      "reason": <why it is better — MUST name the specific flagged ingredient(s) from the analyzed product that this alternative avoids or replaces>,
      "avoids": [<array of the flagged ingredient names this alternative does not contain>],
      "type": "brand" | "category"
    }
  ],
  "suitableFor": {
    "vegetarian": true | false | "unknown",
    "vegan": true | false | "unknown",
    "glutenFree": true | false | "unknown",
    "diabetic": true | false | "unknown"
  }
}

A "VERIFIED OFFICIAL DATA" block may be supplied below the ingredient list. It contains
regulatory facts (JECFA/EFSA/FDA/FSSAI/CDSCO-BIS/IARC) already looked up from a curated
database — this is ground truth, not your own recall. For every ingredient named in that
block: set "officialSource": true, and make sure "flagReason"/"healthImpact"/"sideEffects"
are consistent with the regulatory facts given (do not contradict them, and do not invent
extra ADI numbers or IARC groups beyond what's provided). For every other ingredient you
identify that is NOT in that block: set "officialSource": false and rely on your own
general knowledge as before, but treat it explicitly as an unverified, AI-assessed
judgment rather than implying it carries the same certainty as a verified entry.

For KPIs:
- food/beverage: include Glycemic Impact, Sugar Level, Sodium Level, Additive Load, Allergen Risk, Nutritional Density, Preservative Level, Trans Fat Risk
- cosmetic: include Skin Irritation Risk, Comedogenic Risk, Fragrance Sensitivity, Paraben Free, Sulfate Free, Heavy Metal Risk, Allergen Risk
- supplement/medicine: include Allergen Risk, Additive Load, Preservative Level, and relevant clinical KPIs

For alternatives (only populate this array if overallScore < 70; otherwise return an empty array):
- Suggest 3 to 5 SPECIFIC, NAMED products that a shopper can actually buy in India — real brands/products, not generic descriptions like "a healthier drink" or lazy fallbacks like "water".
- Every alternative MUST be in the SAME product category as the analyzed item (analyzing a cola -> suggest other soft drinks or better-for-you sodas, not juice or water; analyzing a face wash -> suggest other face washes).
- In each "reason", explicitly name which flagged ingredient(s) from the analyzed product the alternative avoids, and list those same ingredient names in the "avoids" array.
- Do NOT suggest any alternative that itself contains the same red-flagged ingredient you flagged in the original product.
- RANK the array from most-recommended (index 0) to least-recommended, based on each alternative's own ingredient profile — cleaner formulation ranks higher — NOT on brand popularity.
- Set "type" to "brand" for a specific named product, "category" only if no specific safe branded product fits.

Return only raw JSON.`;

// Groq retired the free Llama models on 2026-08-16. Models are tried in order;
// if one is decommissioned or unavailable, the next is used. Override the first
// choice with the GROQ_MODEL environment variable in Vercel if needed.
const MODELS = [
  process.env.GROQ_MODEL,
  "openai/gpt-oss-20b",
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b"
].filter(Boolean);

async function callGroq(apiKey, messages) {
  let lastError;
  for (const model of MODELS) {
    const body = {
      model,
      messages,
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_completion_tokens: 6000
    };
    // gpt-oss models think before answering; keep that short so the JSON fits.
    if (model.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.error) return { data, model };

    lastError = new Error(data.error?.message || `Groq returned status ${response.status}`);
    const code = `${data.error?.code || ""} ${data.error?.message || ""}`.toLowerCase();
    const modelProblem = response.status === 404 ||
      /decommission|deprecat|not found|does not exist|model_not_found|not available|no access/.test(code);
    if (!modelProblem) throw lastError; // e.g. bad key or rate limit: don't hide it
    console.warn(`Model ${model} unavailable, trying next:`, lastError.message);
  }
  throw lastError;
}

function parseModelJson(raw) {
  const clean = (raw || "{}").replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch (_) {
    const start = clean.indexOf("{"), end = clean.lastIndexOf("}");
    if (start !== -1 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new Error("The model did not return valid JSON. Please try again.");
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "MISSING_API_KEY: GROQ_API_KEY is not set in Vercel." });
  }

  const { text } = req.body;
  if (!text || !text.trim()) {
    return res.status(400).json({ error: "No ingredient text provided." });
  }

  // Look up the raw ingredient text against our curated official-source database
  // BEFORE calling the LLM, so the model reasons from verified facts instead of
  // inventing them. See api/lib/groundingLookup.js and api/data/*.json.
  const grounding = buildGroundingContext(text);
  const groundingBlock = formatGroundingPromptBlock(grounding.matches);

  try {
    const { data, model } = await callGroq(apiKey, [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze these ingredients:\n\n${text}\n\n${groundingBlock}`
        }
      ]);

    const parsed = parseModelJson(data.choices?.[0]?.message?.content);
    parsed._modelUsed = `${model} (Groq)`;

    // Deterministic safety net: regardless of whether the model followed the
    // instruction above, re-attach the verified regulatory record by matching the
    // model's own (cleaned-up) ingredient names against our curated database. This
    // guarantees officialSourceDetails is always accurate, never LLM-paraphrased.
    if (Array.isArray(parsed.ingredients)) {
      parsed.ingredients = attachGroundingToIngredients(parsed.ingredients);
    }
    const verifiedCount = (parsed.ingredients || []).filter(i => i.officialSource).length;
    parsed.groundingSummary = {
      verifiedCount,
      totalCount: (parsed.ingredients || []).length,
      sources: ["JECFA (WHO/FAO)", "EFSA/EU", "Open Food Facts (EFSA data, ODbL)", "US FDA", "FSSAI India", "EU CosIng/SCCS", "India CDSCO/BIS", "IARC (WHO)"],
      note: "verifiedCount reflects ingredients matched against the curated official-source database in api/data/. Unmatched ingredients are still analyzed by the model but are AI-assessed, not regulator-verified — see officialSource per ingredient."
    };

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: `API_ERROR: ${err.message}` });
  }
};
