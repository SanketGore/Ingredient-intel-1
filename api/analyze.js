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

STEP 3 — Return ONLY a valid raw JSON object, no markdown, no backticks, no explanation.

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
      "name": <product name or category e.g. "Organic Rolled Oats", "CeraVe Moisturising Cream">,
      "reason": <why this is a better alternative>,
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

For alternatives: suggest 2-3 specific well-known cleaner products or product categories. Only suggest alternatives if overallScore < 70.

Return only raw JSON.`;

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
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze these ingredients:\n\n${text}\n\n${groundingBlock}`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 3000
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Groq returned status ${response.status}`);
    }

    const raw    = data.choices?.[0]?.message?.content || "{}";
    const clean  = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    parsed._modelUsed = "llama-3.1-8b-instant (Groq)";

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
      sources: ["JECFA (WHO/FAO)", "EFSA/EU", "US FDA", "FSSAI India", "EU CosIng/SCCS", "India CDSCO/BIS", "IARC (WHO)"],
      note: "verifiedCount reflects ingredients matched against the curated official-source database in api/data/. Unmatched ingredients are still analyzed by the model but are AI-assessed, not regulator-verified — see officialSource per ingredient."
    };

    return res.status(200).json(parsed);
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: `API_ERROR: ${err.message}` });
  }
};
