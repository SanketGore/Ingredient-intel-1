import { useState } from "react";
import { PROFILE_GROUPS, optionLabel } from "./profile.js";

const card = { background: "#fff", borderRadius: 18, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,0.07)", border: "1px solid #e2e8f0", marginBottom: 12 };
const eyebrow = { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#64748b" };

export function ProfileEditor({ profile, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(profile.selected || []));
  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <section aria-label="My profile" style={{ ...card, animation: "fadeUp 0.3s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#0f172a" }}>My profile</h2>
        <button onClick={onClose} aria-label="Close profile" style={{ border: "none", background: "transparent", fontSize: 20, color: "#64748b", cursor: "pointer", minWidth: 44, minHeight: 44 }}>✕</button>
      </div>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
        Pick what matters to you. Results will flag ingredients that don't fit. Your choices stay on this device only.
      </p>
      {PROFILE_GROUPS.map((g) => (
        <fieldset key={g.id} style={{ border: "none", padding: 0, margin: "0 0 14px" }}>
          <legend style={{ ...eyebrow, marginBottom: 8 }}>{g.title}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {g.options.map((o) => {
              const on = selected.has(o.id);
              return (
                <button key={o.id} type="button" aria-pressed={on} onClick={() => toggle(o.id)}
                  style={{ minHeight: 40, padding: "8px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                    border: on ? "1.5px solid #1d4ed8" : "1.5px solid #e2e8f0", background: on ? "#eff6ff" : "#f8fafc", color: on ? "#1d4ed8" : "#475569" }}>
                  {on ? "✓ " : ""}{o.label}
                </button>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => onSave({ selected: [...selected] })}
          style={{ flex: 1, minHeight: 46, borderRadius: 11, border: "none", background: "#1d4ed8", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          Save profile
        </button>
        {selected.size > 0 && (
          <button onClick={() => setSelected(new Set())}
            style={{ minHeight: 46, padding: "0 16px", borderRadius: 11, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Clear all
          </button>
        )}
      </div>
    </section>
  );
}

export function ProfileMatch({ evaluation, onEdit }) {
  if (!evaluation || !evaluation.selected.length) {
    return (
      <div style={{ ...card, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#475569", flex: 1, minWidth: 200 }}>Set up your profile to see if this product suits your diet, allergies and preferences.</span>
        <button onClick={onEdit} style={{ minHeight: 40, padding: "8px 14px", borderRadius: 10, border: "1.5px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Set up profile</button>
      </div>
    );
  }
  const avoid = evaluation.conflicts.filter((c) => c.level === "avoid");
  const caution = evaluation.conflicts.filter((c) => c.level === "caution");
  const tone = avoid.length ? { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", title: "Not a match for your profile" }
    : caution.length ? { bg: "#fffbeb", border: "#fde68a", text: "#92400e", title: "Check before you buy" }
    : { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", title: "Fits your profile" };

  return (
    <section aria-label="Profile match" style={{ ...card, background: tone.bg, border: `1px solid ${tone.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: evaluation.conflicts.length ? 10 : 4 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: tone.text }}>{tone.title}</div>
        <button onClick={onEdit} style={{ minHeight: 36, padding: "6px 12px", borderRadius: 9, border: `1px solid ${tone.border}`, background: "#fff", color: tone.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Edit profile</button>
      </div>
      {evaluation.conflicts.map((c, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "6px 0", borderTop: i ? `1px solid ${tone.border}` : "none" }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: c.level === "avoid" ? "#b91c1c" : "#b45309", minWidth: 58 }}>{c.level === "avoid" ? "Avoid" : "Caution"}</span>
          <span style={{ fontSize: 13, color: "#1e293b" }}><strong>{c.ingredient}</strong> · {c.reason} <span style={{ color: "#64748b" }}>({optionLabel(c.option)})</span></span>
        </div>
      ))}
      <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
        Checked for: {evaluation.selected.map(optionLabel).join(", ")}. Based on the label text; always read the pack for allergen warnings.
      </div>
    </section>
  );
}
