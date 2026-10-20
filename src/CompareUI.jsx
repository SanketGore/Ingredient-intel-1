import { useState } from "react";
import { MAX_COMPARE, summarize, pickWinner } from "./compare.js";

const card = { background: "#fff", borderRadius: 18, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0", marginBottom: 12 };
const btn = { minHeight: 40, padding: "8px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const scoreColor = (s) => (s >= 70 ? "#15803d" : s >= 40 ? "#b45309" : "#b91c1c");

// "Add to compare" control shown on a result.
export function AddToCompare({ inList, full, onAdd, onOpen, count }) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  if (inList) {
    return (
      <button onClick={onOpen} style={{ ...btn, border: "1.5px solid #bbf7d0", background: "#f0fdf4", color: "#15803d" }}>
        ✓ In comparison · View ({count})
      </button>
    );
  }
  if (naming) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onAdd(name.trim()); setNaming(false); setName(""); }}
        style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <label htmlFor="cmp-name" style={{ position: "absolute", left: -9999 }}>Product name</label>
        <input id="cmp-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name, e.g. Brand A syrup" maxLength={60}
          style={{ minHeight: 40, padding: "0 12px", borderRadius: 10, border: "1.5px solid #cbd5e1", fontSize: 13, fontFamily: "inherit", minWidth: 200 }} />
        <button type="submit" style={{ ...btn, border: "none", background: "#1d4ed8", color: "#fff" }}>Add</button>
        <button type="button" onClick={() => setNaming(false)} style={{ ...btn, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569" }}>Cancel</button>
      </form>
    );
  }
  return (
    <button onClick={() => (full ? onOpen() : setNaming(true))} title={full ? `You can compare up to ${MAX_COMPARE} products` : ""}
      style={{ ...btn, border: "1.5px solid #e2e8f0", background: "#fff", color: "#334155" }}>
      {full ? `Comparison full (${MAX_COMPARE}) · View` : "+ Add to compare"}
    </button>
  );
}

// Sticky tray showing how many products are lined up.
export function CompareTray({ count, onOpen }) {
  if (!count) return null;
  return (
    <div style={{ position: "sticky", bottom: 12, zIndex: 5, display: "flex", justifyContent: "center", marginTop: 12 }}>
      <button onClick={onOpen} style={{ ...btn, minHeight: 46, padding: "0 20px", border: "none", background: "#0f172a", color: "#fff", boxShadow: "0 6px 20px rgba(15,23,42,0.25)" }}>
        Compare products ({count}/{MAX_COMPARE})
      </button>
    </div>
  );
}

const Row = ({ label, children }) => (
  <tr>
    <th scope="row" style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", padding: "10px 8px", verticalAlign: "top", whiteSpace: "nowrap", borderTop: "1px solid #f1f5f9" }}>{label}</th>
    {children}
  </tr>
);
const Cell = ({ children, highlight }) => (
  <td style={{ padding: "10px 8px", fontSize: 13, color: "#1e293b", verticalAlign: "top", borderTop: "1px solid #f1f5f9", background: highlight ? "#f0fdf4" : "transparent", minWidth: 150 }}>{children}</td>
);
const suit = (v) => (v === true ? "Yes" : v === false ? "No" : "Unknown");

export function CompareView({ items, profile, onRemove, onClear, onClose, onDownload }) {
  const rows = items.map((it) => summarize(it, profile));
  const winner = pickWinner(rows);
  const bestId = winner && !winner.tie ? winner.best.id : null;

  return (
    <section aria-label="Product comparison" style={{ ...card, animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Compare products</h2>
        <button onClick={onClose} aria-label="Close comparison" style={{ border: "none", background: "transparent", fontSize: 20, color: "#64748b", cursor: "pointer", minWidth: 44, minHeight: 44 }}>✕</button>
      </div>

      {rows.length < 2 && (
        <p style={{ fontSize: 13, color: "#475569", margin: "0 0 12px" }}>
          Add {rows.length ? "one more product" : "two or more products"} to compare. Analyse a label, then tap "+ Add to compare".
        </p>
      )}

      {winner && (
        <div style={{ padding: "12px 14px", borderRadius: 12, background: winner.tie ? "#f8fafc" : "#f0fdf4", border: `1px solid ${winner.tie ? "#e2e8f0" : "#bbf7d0"}`, marginBottom: 12 }}>
          {winner.tie ? (
            <span style={{ fontSize: 13, color: "#334155" }}>These products come out even. Check the red-flag ingredients below to decide.</span>
          ) : (
            <span style={{ fontSize: 13, color: "#166534" }}>
              <strong>Better choice: {winner.best.name}</strong>{winner.reasons.length ? ` — ${winner.reasons.join(", ")}.` : "."}
            </span>
          )}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: "auto", margin: "0 -8px" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th scope="col" style={{ width: 110 }}><span style={{ position: "absolute", left: -9999 }}>Attribute</span></th>
                {rows.map((r) => (
                  <th key={r.id} scope="col" style={{ textAlign: "left", padding: "8px", verticalAlign: "top", background: r.id === bestId ? "#f0fdf4" : "transparent", borderRadius: "10px 10px 0 0" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#0f172a" }}>{r.id === bestId ? "★ " : ""}{r.name}</div>
                    <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize", fontWeight: 500 }}>{r.productType}</div>
                    <button onClick={() => onRemove(r.id)} style={{ marginTop: 4, border: "none", background: "transparent", color: "#b91c1c", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "6px 0", fontFamily: "inherit" }}>Remove</button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[["Overall", "overall"], ["Safety", "safety"], ["Natural", "natural"]].map(([label, key]) => (
                <Row key={key} label={label}>
                  {rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}><span style={{ fontSize: 20, fontWeight: 800, color: scoreColor(r[key]) }}>{r[key] ?? "–"}</span><span style={{ color: "#94a3b8" }}> /100</span></Cell>)}
                </Row>
              ))}
              <Row label="Processing">{rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}>{r.processingLevel || "–"}</Cell>)}</Row>
              <Row label="Red flags">{rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}>{r.red.length ? <span style={{ color: "#b91c1c" }}>{r.red.join(", ")}</span> : <span style={{ color: "#15803d" }}>None</span>}</Cell>)}</Row>
              <Row label="Moderate">{rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}>{r.yellow.length ? r.yellow.join(", ") : "None"}</Cell>)}</Row>
              <Row label="Your profile">
                {rows.map((r) => (
                  <Cell key={r.id} highlight={r.id === bestId}>
                    {!r.profileSet ? <span style={{ color: "#64748b" }}>No profile set</span>
                      : r.avoid.length ? <span style={{ color: "#b91c1c" }}>Avoid: {[...new Set(r.avoid.map((c) => c.ingredient))].join(", ")}</span>
                      : r.caution.length ? <span style={{ color: "#b45309" }}>Check: {[...new Set(r.caution.map((c) => c.ingredient))].join(", ")}</span>
                      : <span style={{ color: "#15803d" }}>Fits</span>}
                  </Cell>
                ))}
              </Row>
              {["vegetarian", "vegan", "glutenFree", "diabetic"].map((k) => (
                <Row key={k} label={k.replace(/([A-Z])/g, " $1")}>{rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}>{suit(r.suitableFor[k])}</Cell>)}</Row>
              ))}
              <Row label="Verdict">{rows.map((r) => <Cell key={r.id} highlight={r.id === bestId}><span style={{ color: "#475569" }}>{r.verdict}</span></Cell>)}</Row>
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
          {rows.length > 1 && (
            <button onClick={() => onDownload(rows, winner)} style={{ ...btn, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>Download comparison PDF</button>
          )}
          <button onClick={onClear} style={{ ...btn, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569" }}>Clear all</button>
        </div>
      )}
    </section>
  );
}
