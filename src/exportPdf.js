// Builds a printable PDF of an Ingredient Intel analysis.
// The PDF is generated from the analysis data itself (not a screenshot), so every
// section is included, whichever tab the user happens to be looking at.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const BLUE = [29, 78, 216];
const INK = [15, 23, 42];
const MUTED = [71, 85, 105];
const LINE = [226, 232, 240];
const FLAG_COLORS = { green: [21, 128, 61], yellow: [180, 83, 9], red: [185, 28, 28] };
const LEVEL_COLORS = { good: FLAG_COLORS.green, warning: FLAG_COLORS.yellow, bad: FLAG_COLORS.red };

// jsPDF's built-in fonts only cover Latin characters; swap common symbols and drop the rest.
const clean = (v) => {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-").replace(/…/g, "...")
    .replace(/→/g, "->").replace(/≤/g, "<=").replace(/≥/g, ">=")
    .replace(/₹/g, "Rs. ").replace(/µ/g, "u")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, "")
    .trim();
};

// Same as clean(), but says so when a value was written only in a non-Latin script.
const cleanOr = (v, fallback = "(name in a non-Latin script)") => clean(v) || (v ? fallback : "");

const suitText = (v) => (v === true ? "Yes" : v === false ? "No" : "Unknown");
const label = (key) => key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();

export function exportReportPdf(result, ingredientText = "") {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 44;
  const W = pageW - M * 2;
  let y = M;

  const ensure = (h) => { if (y + h > pageH - 50) { doc.addPage(); y = M; } };

  const heading = (text) => {
    ensure(40);
    y += 10;
    doc.setFont("helvetica", "bold").setFontSize(13).setTextColor(...INK);
    doc.text(text, M, y);
    y += 6;
    doc.setDrawColor(...LINE).setLineWidth(0.8).line(M, y, M + W, y);
    y += 14;
  };

  const paragraph = (text, { size = 10, color = MUTED, bold = false } = {}) => {
    const t = clean(text);
    if (!t) return;
    doc.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
    const lines = doc.splitTextToSize(t, W);
    lines.forEach((ln) => { ensure(size + 4); doc.text(ln, M, y); y += size + 4; });
    y += 4;
  };

  const bullets = (items) => {
    (items || []).forEach((item) => {
      const t = clean(item);
      if (!t) return;
      doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(...MUTED);
      const lines = doc.splitTextToSize(t, W - 14);
      lines.forEach((ln, i) => {
        ensure(14);
        if (i === 0) doc.text("•", M + 2, y);
        doc.text(ln, M + 14, y);
        y += 14;
      });
      y += 2;
    });
    y += 4;
  };

  // ── Header ──
  doc.setFillColor(...BLUE).rect(0, 0, pageW, 6, "F");
  doc.setFont("helvetica", "bold").setFontSize(20).setTextColor(...INK);
  doc.text("Ingredient Intel Report", M, y + 14);
  y += 30;
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  const when = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  doc.text(clean(`Generated ${when}  |  Product type: ${result.productType || "unknown"}`), M, y);
  y += 20;

  // ── Scores ──
  const scores = [
    ["Overall", result.overallScore],
    ["Safety", result.safetyScore],
    ["Natural", result.processingScore],
  ];
  const boxW = (W - 20) / 3;
  scores.forEach(([name, val], i) => {
    const x = M + i * (boxW + 10);
    const n = Number(val);
    const col = n >= 70 ? FLAG_COLORS.green : n >= 45 ? FLAG_COLORS.yellow : FLAG_COLORS.red;
    doc.setDrawColor(...LINE).setFillColor(248, 250, 252).roundedRect(x, y, boxW, 58, 6, 6, "FD");
    doc.setFont("helvetica", "bold").setFontSize(22).setTextColor(...(isNaN(n) ? MUTED : col));
    doc.text(isNaN(n) ? "-" : String(n), x + boxW / 2, y + 30, { align: "center" });
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text(`${name} / 100`, x + boxW / 2, y + 46, { align: "center" });
  });
  y += 74;

  paragraph(result.verdict, { size: 11, color: INK, bold: true });
  paragraph(`Processing level: ${result.processingLevel || "-"}`);
  paragraph(result.analysisContext);
  if (result.groundingSummary) {
    const g = result.groundingSummary;
    paragraph(`${g.verifiedCount}/${g.totalCount} ingredients verified against official sources (JECFA, EFSA, FDA, FSSAI, CosIng, CDSCO/BIS, IARC). The rest are AI-assessed.`, { size: 9 });
  }

  // ── Suitability ──
  if (result.suitableFor && Object.keys(result.suitableFor).length) {
    heading("Suitability");
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [Object.keys(result.suitableFor).map(label)],
      body: [Object.values(result.suitableFor).map(suitText)],
      theme: "grid",
      styles: { fontSize: 10, halign: "center", textColor: INK, lineColor: LINE },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: "bold" },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── KPIs ──
  if (result.kpis?.length) {
    heading("Key indicators");
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Indicator", "Value", "Note"]],
      body: result.kpis.map((k) => [clean(k.label), clean(k.value), clean(k.note)]),
      theme: "grid",
      styles: { fontSize: 9, textColor: INK, lineColor: LINE, cellPadding: 5 },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 120, fontStyle: "bold" }, 1: { cellWidth: 70 } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 1) {
          const c = LEVEL_COLORS[result.kpis[d.row.index]?.level];
          if (c) { d.cell.styles.textColor = c; d.cell.styles.fontStyle = "bold"; }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── Ingredients ──
  if (result.ingredients?.length) {
    heading("Ingredient breakdown");
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Ingredient", "Category", "Flag", "Why / health impact"]],
      body: result.ingredients.map((i) => {
        const details = [
          i.flagReason,
          i.healthImpact,
          i.composition ? `Made of: ${i.composition}` : "",
          i.sideEffects ? `Side effects: ${i.sideEffects}` : "",
          i.officialSource ? "Verified against official sources." : "AI-assessed.",
        ].map(clean).filter(Boolean).join("\n");
        return [cleanOr(i.name), clean(i.category), clean((i.flag || "").toUpperCase()), details];
      }),
      theme: "grid",
      styles: { fontSize: 8.5, textColor: INK, lineColor: LINE, cellPadding: 5, valign: "top" },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 100, fontStyle: "bold" }, 1: { cellWidth: 80 }, 2: { cellWidth: 50 } },
      didParseCell: (d) => {
        if (d.section === "body" && d.column.index === 2) {
          const c = FLAG_COLORS[result.ingredients[d.row.index]?.flag];
          if (c) { d.cell.styles.textColor = c; d.cell.styles.fontStyle = "bold"; }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── Lists ──
  if (result.positives?.length) { heading("Positives"); bullets(result.positives); }
  if (result.concerns?.length) { heading("Concerns"); bullets(result.concerns); }
  if (result.recommendations?.length) { heading("Recommendations"); bullets(result.recommendations); }

  // ── Alternatives ──
  if (result.alternatives?.length) {
    heading("Cleaner alternatives");
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Alternative", "Why it is better"]],
      body: result.alternatives.map((a) => [clean(a.name), clean(a.reason)]),
      theme: "grid",
      styles: { fontSize: 9, textColor: INK, lineColor: LINE, cellPadding: 5 },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 150, fontStyle: "bold" } },
    });
    y = doc.lastAutoTable.finalY + 12;
  }

  // ── Original ingredient list ──
  if (ingredientText && ingredientText.trim()) {
    heading("Ingredient list analysed");
    const t = clean(ingredientText);
    const dropped = t.replace(/\s/g, "").length < ingredientText.replace(/\s/g, "").length * 0.9;
    if (t) paragraph(t, { size: 9 });
    if (dropped) paragraph("Some text in a non-Latin script (e.g. Hindi) could not be shown in this PDF.", { size: 8 });
  }

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(148, 163, 184);
    doc.text(clean(`Ingredient Intel  |  ${result._modelUsed || "AI analysis"}  |  Not medical advice; consult a qualified professional for clinical decisions.`), M, pageH - 24);
    doc.text(`${p} / ${pages}`, pageW - M, pageH - 24, { align: "right" });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`ingredient-intel-report-${stamp}.pdf`);
}
