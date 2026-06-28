# Grounding Layer — How Ingredient Intel verifies claims against official data

## The problem this solves
Previously, `api/analyze.js` sent the raw ingredient text straight to an LLM
(`llama-3.1-8b-instant` on Groq) and trusted it to know, from memory, whether each
ingredient is "safe." The JSON schema *looked* authoritative (categories, flags,
side effects) but nothing in it was actually checked against a real regulatory source.

## What changed
1. **`api/data/foodAdditives.json`** — curated reference data for ~25 common food/beverage
   additives, each with status from JECFA (WHO/FAO), EFSA/EU, US FDA, FSSAI (India), and
   IARC (WHO) carcinogen classification where relevant, plus links back to the primary
   source.
2. **`api/data/cosmeticIngredients.json`** — same idea for ~14 common cosmetic/skincare
   ingredients, sourced from EU CosIng/SCCS, US FDA, and India's CDSCO/BIS (IS 4707).
3. **`api/lib/groundingLookup.js`** — matches ingredient text (by name, alias, or
   E-number/INS-number) against the two datasets above. No network calls, no new npm
   dependencies — pure string matching so it's instant and has zero external failure
   modes during a live demo.
4. **`api/analyze.js`** — now does two things differently:
   - **Before** calling the LLM: looks up the raw ingredient text, and injects a
     "VERIFIED OFFICIAL DATA" block into the prompt so the model reasons from real
     regulatory facts for any ingredient we have on file.
   - **After** the LLM responds: re-attaches the verified record to each ingredient by
     name-matching again, deterministically. This is the important part — we don't
     trust the LLM to faithfully copy the regulatory facts, so the final `officialSource`
     / `officialSourceDetails` fields are always exactly what's in our curated JSON,
     never an LLM paraphrase.
5. **`src/App.jsx`** — added a "✓ Verified · JECFA/EFSA/FDA" vs "AI-assessed · no
   official record matched" badge on every ingredient card, plus a summary strip
   ("14/19 ingredients verified against official sources") right under the product-type
   banner.

## Why this design (useful to explain to judges)
- **Demo-safe**: the grounding lookup is a local JSON match, not a live API call — no
  risk of a third-party API being down/slow during your presentation.
- **Honest, not just "official-sounding"**: ingredients we don't have on file are clearly
  labelled AI-assessed instead of being silently presented with the same confidence as a
  verified one.
- **Two safety nets, not one**: the LLM is *told* the verified facts before it writes
  anything (so its prose stays consistent), and the backend *re-attaches* the facts
  afterward regardless of whether the LLM followed instructions (so the data is never
  wrong even if the model ignores the prompt).

## Coverage and honesty about limitations
This is a **starter seed set**, not a complete database — ~25 food additives and ~14
cosmetic ingredients, chosen because they're the ones most likely to show up in a real
product label (common preservatives, sweeteners, dyes, parabens, sulfates, etc.) and
because their regulatory status is well-documented and, in a few cases (Red Dye 3,
Titanium Dioxide, Aspartame, parabens), genuinely contested across US/EU/India — which
makes for a much more interesting demo than "everything is either green or red."

To extend coverage, the most realistic next sources to add (and why they're tractable):
- **Open Food Facts additives taxonomy** (`static.openfoodfacts.org/data/taxonomies/additives.json`)
  — a single static JSON file that already aggregates EFSA ADI values and JECFA/FDA/FSANZ
  authorization flags for hundreds of E-numbers. Best next step for breadth.
- **PubChem PUG-REST** (free, no API key) — good fallback for CAS numbers / GHS hazard
  data on anything not in your curated set.
- **US EPA CompTox Dashboard** IARC group lists — clean, downloadable mirrors of IARC's
  Group 1/2A/2B classifications, useful as a universal cross-category red-flag check.

FSSAI (India, food) and CDSCO/BIS (India, cosmetics) do **not** have a public API or
clean structured export as of this writing — their official lists are published as
compendium/gazette PDFs. That's why the India-specific facts in this dataset were
hand-curated from those PDFs rather than fetched live; if you expand this dataset,
budget extra time for India-specific entries since it's documentation/PDF research, not
API integration.

## Primary sources referenced while building this dataset
- JECFA database (WHO/FAO): https://apps.who.int/food-additives-contaminants-jecfa-database/
- EU food additives (EFSA re-evaluations): https://food.ec.europa.eu/food-safety/food-improvement-agents/additives_en
- US FDA Substances Added to Food: https://www.fda.gov/food/food-additives-petitions/substances-added-food-formerly-eafus
- US FDA color additive status (incl. Red No. 3 ban order): https://www.fda.gov/industry/color-additives/fdc-red-no-3
- FSSAI compendium: https://fssai.gov.in/cms/Compendium-FSS-FPS-FA.php
- EU CosIng: https://ec.europa.eu/growth/tools-databases/cosing/
- India CDSCO Cosmetics: https://cdsco.gov.in/opencms/opencms/en/Cosmetics/cosmetics/
- IARC Monographs (WHO): https://www.iarc.who.int/
- IARC/JECFA joint aspartame statement (2023): https://www.who.int/news/item/14-07-2023-aspartame-hazard-and-risk-assessment-results-released

**Verify before relying on this beyond a hackathon demo** — regulatory status changes
(as the Red Dye 3 / Titanium Dioxide entries in this very dataset demonstrate), and this
was compiled as of 2026-06-28 from public secondary reporting plus primary regulator
pages, not a live legal review.
