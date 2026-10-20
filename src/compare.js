// Product comparison: up to 3 saved analyses, kept in this browser.
import { evaluateProfile } from "./profile.js";

const STORAGE_KEY = "ii.compare.v1";
export const MAX_COMPARE = 3;

export function loadCompare() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.slice(0, MAX_COMPARE) : [];
  } catch (_) {
    return [];
  }
}

export function saveCompare(list) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_COMPARE))); } catch (_) { /* storage full or blocked */ }
}

// One summary row per product, used by the table, the verdict and the PDF.
export function summarize(item, profile) {
  const r = item.result || {};
  const ings = r.ingredients || [];
  const red = ings.filter((i) => i.flag === "red").map((i) => i.name);
  const yellow = ings.filter((i) => i.flag === "yellow").map((i) => i.name);
  const ev = evaluateProfile(r, profile);
  const avoid = ev.conflicts.filter((c) => c.level === "avoid");
  const caution = ev.conflicts.filter((c) => c.level === "caution");
  // Ranking score: the analysis' overall score, minus a clear penalty for anything the
  // person's profile says to avoid. Kept simple so the verdict is easy to explain.
  const rankScore = (Number(r.overallScore) || 0) - avoid.length * 15 - caution.length * 3;
  return {
    id: item.id, name: item.name, addedAt: item.addedAt,
    productType: r.productType, overall: r.overallScore, safety: r.safetyScore, natural: r.processingScore,
    processingLevel: r.processingLevel, verdict: r.verdict,
    ingredientCount: ings.length, red, yellow, avoid, caution,
    profileSet: ev.selected.length > 0, fits: ev.fits,
    suitableFor: r.suitableFor || {}, rankScore,
  };
}

export function pickWinner(rows) {
  if (rows.length < 2) return null;
  const sorted = [...rows].sort((a, b) => b.rankScore - a.rankScore);
  const best = sorted[0], next = sorted[1];
  if (best.rankScore === next.rankScore) return { tie: true, rows: sorted };
  const reasons = [];
  if ((best.overall || 0) > (next.overall || 0)) reasons.push(`higher overall score (${best.overall} vs ${next.overall})`);
  if (best.red.length < next.red.length) reasons.push(`fewer red-flag ingredients (${best.red.length} vs ${next.red.length})`);
  if (best.profileSet && best.avoid.length < next.avoid.length) reasons.push(`fewer conflicts with your profile (${best.avoid.length} vs ${next.avoid.length})`);
  if ((best.safety || 0) > (next.safety || 0) && reasons.length < 2) reasons.push(`safer ingredients (${best.safety} vs ${next.safety})`);
  return { tie: false, best, reasons, rows: sorted };
}
