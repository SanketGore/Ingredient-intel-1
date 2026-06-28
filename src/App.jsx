import { useState, useRef, useCallback } from "react";
import { createWorker } from "tesseract.js";

const SUPPORTED_LANGUAGES = [
  { code: "eng",     label: "English",    flag: "🇬🇧" },
  { code: "hin",     label: "Hindi",      flag: "🇮🇳" },
  { code: "fra",     label: "French",     flag: "🇫🇷" },
  { code: "deu",     label: "German",     flag: "🇩🇪" },
  { code: "spa",     label: "Spanish",    flag: "🇪🇸" },
  { code: "por",     label: "Portuguese", flag: "🇵🇹" },
  { code: "ita",     label: "Italian",    flag: "🇮🇹" },
  { code: "rus",     label: "Russian",    flag: "🇷🇺" },
  { code: "ara",     label: "Arabic",     flag: "🇸🇦" },
  { code: "chi_sim", label: "Chinese",    flag: "🇨🇳" },
  { code: "jpn",     label: "Japanese",   flag: "🇯🇵" },
  { code: "kor",     label: "Korean",     flag: "🇰🇷" },
];

const amazonSearchUrl = (productName, region = "in") =>
  `https://www.amazon.${region}/s?k=${encodeURIComponent(productName)}&tag=ingredientintel`;

export default function IngredientAnalyzer() {
  const [input, setInput]               = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult]             = useState(null);
  const [loading, setLoading]           = useState(false);
  const [ocring, setOcring]             = useState(false);
  const [ocrProgress, setOcrProgress]   = useState(0);
  const [ocrLang, setOcrLang]           = useState("eng");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [error, setError]               = useState("");
  const [activeTab, setActiveTab]       = useState("overview");
  const [dragOver, setDragOver]         = useState(false);
  const fileRef = useRef();

  // ── OCR ────────────────────────────────────────────────────────────────────
  const extractTextFromImage = async (file, lang = ocrLang) => {
    setOcring(true);
    setOcrProgress(0);
    setError("");
    try {
      const worker = await createWorker(lang, 1, {
        logger: (m) => {
          if (m.status === "recognizing text") setOcrProgress(Math.round(m.progress * 100));
        }
      });
      const { data: { text } } = await worker.recognize(file);
      await worker.terminate();
      setInput(text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim());
      setOcrProgress(100);
    } catch (err) {
      setError("OCR failed. Please type the ingredients manually.");
    } finally {
      setOcring(false);
    }
  };

  const handleImageUpload = useCallback((file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
    extractTextFromImage(file, ocrLang);
  }, [ocrLang]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    handleImageUpload(e.dataTransfer.files[0]);
  }, [handleImageUpload]);

  const clearImage = (e) => {
    e.stopPropagation();
    setImagePreview(null);
    setInput("");
    setOcrProgress(0);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleLangChange = (code) => {
    setOcrLang(code);
    setShowLangPicker(false);
  };

  // ── Analyze ────────────────────────────────────────────────────────────────
  const analyze = async () => {
    if (!input.trim()) { setError("Please enter or extract an ingredient list first."); return; }
    setLoading(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: input.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Analysis failed");
      setResult(data);
      setActiveTab("overview");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ── Style helpers ──────────────────────────────────────────────────────────
  const scoreColor   = (s) => s >= 70 ? "#22c55e" : s >= 40 ? "#f59e0b" : "#ef4444";
  const flagDot      = (f) => f === "green" ? "#22c55e" : f === "yellow" ? "#f59e0b" : "#ef4444";
  const flagBg       = (f) => f === "green" ? "#f0fdf4" : f === "yellow" ? "#fffbeb" : "#fef2f2";
  const flagBorder   = (f) => f === "green" ? "#bbf7d0" : f === "yellow" ? "#fde68a" : "#fecaca";
  const kpiColor     = (l) => l === "good" ? "#22c55e" : l === "warning" ? "#f59e0b" : "#ef4444";
  const kpiBg        = (l) => l === "good" ? "#f0fdf4" : l === "warning" ? "#fffbeb" : "#fef2f2";
  const kpiBorder    = (l) => l === "good" ? "#bbf7d0" : l === "warning" ? "#fde68a" : "#fecaca";
  const suitIcon     = (v) => v === true ? "✓" : v === false ? "✗" : "—";
  const suitColor    = (v) => v === true ? "#16a34a" : v === false ? "#dc2626" : "#9ca3af";
  const processColor = (level) => {
    if (level?.includes("Ultra"))    return { bg: "#fef2f2", text: "#dc2626" };
    if (level?.includes("Highly"))   return { bg: "#fff7ed", text: "#ea580c" };
    if (level?.includes("Moderate")) return { bg: "#fefce8", text: "#ca8a04" };
    return { bg: "#f0fdf4", text: "#16a34a" };
  };
  const productIcon  = (t) => ({ food:"🍽️", beverage:"🥤", cosmetic:"💄", supplement:"💊", medicine:"🏥", other:"📦" }[t] || "📦");
  const contextBg    = (t) => ({ food:"#f0fdf4", beverage:"#eff6ff", cosmetic:"#fdf4ff", supplement:"#fff7ed", medicine:"#fef2f2", other:"#f8fafc" }[t] || "#f8fafc");
  const contextBorder= (t) => ({ food:"#bbf7d0", beverage:"#bfdbfe", cosmetic:"#e9d5ff", supplement:"#fed7aa", medicine:"#fecaca", other:"#e2e8f0" }[t] || "#e2e8f0");
  const contextText  = (t) => ({ food:"#166534", beverage:"#1e40af", cosmetic:"#6b21a8", supplement:"#c2410c", medicine:"#991b1b", other:"#475569" }[t] || "#475569");

  const selectedLang = SUPPORTED_LANGUAGES.find(l => l.code === ocrLang);

  const ScoreRing = ({ score, label }) => {
    const r = 32, size = 80, circ = 2 * Math.PI * r;
    const color = scoreColor(score);
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={40} cy={40} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
          <circle cx={40} cy={40} r={r} fill="none" stroke={color} strokeWidth="7"
            strokeDasharray={`${(score/100)*circ} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }} />
          <text x={40} y={40} fill={color} fontSize="17" fontWeight="800"
            textAnchor="middle" dominantBaseline="middle"
            style={{ transform:"rotate(90deg)", transformOrigin:"40px 40px", fontFamily:"inherit" }}>
            {score}
          </text>
        </svg>
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", color:"#94a3b8" }}>{label}</span>
      </div>
    );
  };

  const tabs = [
    { id:"overview",     label:"📊 Overview"   },
    { id:"kpis",         label:"📈 KPIs"        },
    { id:"ingredients",  label:"🧪 Ingredients" },
    { id:"advice",       label:"💡 Advice"      },
    ...(result?.alternatives?.length > 0 ? [{ id:"alternatives", label:"✨ Alternatives" }] : [])
  ];

  return (
    <div style={{ fontFamily:"'DM Sans',sans-serif", minHeight:"100vh", background:"#f1f5f9", color:"#1e293b" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800&family=Instrument+Serif&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing:border-box; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
        @keyframes spin   { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }
        @keyframes pulse  { 0%,100%{opacity:1}50%{opacity:0.4} }
        .ing-card:hover  { transform:translateX(3px); transition:transform 0.15s; }
        .kpi-card:hover  { transform:translateY(-2px); transition:transform 0.15s; }
        .alt-card:hover  { transform:translateY(-2px); transition:transform 0.15s; }
        .tab-btn:hover   { background:#f1f5f9 !important; }
        .lang-opt:hover  { background:#eff6ff !important; }
        .shop-btn:hover  { opacity:0.85; }
      `}</style>

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0f172a 0%,#1a3050 50%,#0f172a 100%)", padding:"32px 24px 28px", textAlign:"center" }}>
        <div style={{ display:"inline-flex", alignItems:"center", gap:6, background:"rgba(99,179,237,0.12)", border:"1px solid rgba(99,179,237,0.2)", borderRadius:20, padding:"4px 12px", marginBottom:14 }}>
          <span style={{ width:7, height:7, borderRadius:"50%", background:"#34d399", display:"inline-block", animation:"pulse 2s infinite" }} />
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.18em", color:"#7dd3fc", textTransform:"uppercase" }}>Llama 3.1 · Groq Cloud</span>
        </div>
        <h1 style={{ fontFamily:"'Instrument Serif',serif", fontSize:36, fontWeight:400, color:"#fff", margin:0, lineHeight:1.1 }}>Ingredient Intel</h1>
        <p style={{ color:"#64748b", fontSize:13, marginTop:8, marginBottom:0, fontWeight:500 }}>Decode what's really in your food, drinks & cosmetics</p>
      </div>

      <div style={{ maxWidth:620, margin:"0 auto", padding:"20px 16px 40px" }}>

        {/* Input Card */}
        <div style={{ background:"#fff", borderRadius:18, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", border:"1px solid #e2e8f0", marginBottom:14 }}>

          {/* Image upload header row */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <label style={{ fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#94a3b8" }}>
              Upload Label Photo
            </label>
            {/* Language picker */}
            <div style={{ position:"relative" }}>
              <button onClick={() => setShowLangPicker(v => !v)} style={{ display:"flex", alignItems:"center", gap:5, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:8, padding:"4px 10px", cursor:"pointer", fontSize:12, fontWeight:600, color:"#475569", fontFamily:"inherit" }}>
                <span>{selectedLang?.flag}</span>
                <span>{selectedLang?.label}</span>
                <span style={{ fontSize:9, color:"#94a3b8" }}>▼</span>
              </button>
              {showLangPicker && (
                <div style={{ position:"absolute", right:0, top:"110%", background:"#fff", border:"1px solid #e2e8f0", borderRadius:12, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:100, minWidth:160, maxHeight:260, overflowY:"auto" }}>
                  <div style={{ padding:"8px 12px 4px", fontSize:10, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase" }}>OCR Language</div>
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <div key={lang.code} className="lang-opt" onClick={() => handleLangChange(lang.code)}
                      style={{ padding:"8px 14px", cursor:"pointer", fontSize:13, fontWeight:500, color: lang.code === ocrLang ? "#1d4ed8" : "#475569", background: lang.code === ocrLang ? "#eff6ff" : "transparent", display:"flex", alignItems:"center", gap:8 }}>
                      <span>{lang.flag}</span><span>{lang.label}</span>
                      {lang.code === ocrLang && <span style={{ marginLeft:"auto", color:"#2563eb", fontSize:12 }}>✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onClick={() => !ocring && fileRef.current.click()}
            style={{ border:`2px dashed ${dragOver?"#3b82f6":"#cbd5e1"}`, borderRadius:12, overflow:"hidden", cursor:ocring?"wait":"pointer", background:dragOver?"#eff6ff":"#f8fafc", transition:"all 0.2s", padding:imagePreview?0:"18px 16px", textAlign:"center", marginBottom:14 }}
          >
            {imagePreview ? (
              <div style={{ position:"relative" }}>
                <img src={imagePreview} alt="Label" style={{ width:"100%", maxHeight:200, objectFit:"contain", display:"block", borderRadius:10 }} />
                {ocring && (
                  <div style={{ position:"absolute", inset:0, background:"rgba(15,23,42,0.78)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, borderRadius:10 }}>
                    <div style={{ fontSize:13, color:"#fff", fontWeight:600 }}>Extracting {selectedLang?.label} text… {ocrProgress}%</div>
                    <div style={{ width:"70%", height:6, background:"rgba(255,255,255,0.2)", borderRadius:10, overflow:"hidden" }}>
                      <div style={{ width:`${ocrProgress}%`, height:"100%", background:"#34d399", borderRadius:10, transition:"width 0.3s" }} />
                    </div>
                  </div>
                )}
                {!ocring && <button onClick={clearImage} style={{ position:"absolute", top:8, right:8, background:"rgba(15,23,42,0.7)", color:"#fff", border:"none", borderRadius:"50%", width:28, height:28, cursor:"pointer", fontSize:14 }}>✕</button>}
              </div>
            ) : (
              <>
                <div style={{ fontSize:28, marginBottom:6 }}>📷</div>
                <div style={{ fontSize:13, color:"#475569", fontWeight:600 }}>Drop label photo or tap to browse</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>
                  Text will be auto-extracted · Select language above before uploading
                </div>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={(e) => handleImageUpload(e.target.files[0])} />

          <label style={{ fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#94a3b8", display:"block", marginBottom:8 }}>
            {imagePreview ? "Extracted Text — Review & Edit if Needed" : "Or Paste Ingredients Manually"}
          </label>
          <textarea
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Paste ingredient list e.g. Water, Sugar, Sodium Benzoate... or Aqua, Glycerin, Retinol, Niacinamide..."
            rows={4}
            style={{ width:"100%", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"11px 13px", fontSize:14, resize:"vertical", color:"#334155", background:ocring?"#f8fafc":"#fff", fontFamily:"inherit", lineHeight:1.6, transition:"border-color 0.2s" }}
            onFocus={(e) => e.target.style.borderColor="#3b82f6"}
            onBlur={(e)  => e.target.style.borderColor="#e2e8f0"}
            readOnly={ocring}
          />
          {ocring && <div style={{ fontSize:12, color:"#3b82f6", marginTop:6, fontWeight:600 }}>⏳ Reading {selectedLang?.label} text… {ocrProgress}%</div>}

          <button onClick={analyze} disabled={loading||ocring} style={{ marginTop:14, width:"100%", padding:"14px", borderRadius:11, border:"none", background:(loading||ocring)?"#94a3b8":"linear-gradient(135deg,#1d4ed8,#2563eb)", color:"#fff", fontSize:15, fontWeight:700, cursor:(loading||ocring)?"not-allowed":"pointer", fontFamily:"inherit", boxShadow:(loading||ocring)?"none":"0 4px 14px rgba(37,99,235,0.3)", transition:"all 0.2s" }}>
            {loading?"Analyzing…":ocring?`Extracting text… ${ocrProgress}%`:"🔬 Analyze Ingredients"}
          </button>
          {error && <div style={{ marginTop:10, color:"#ef4444", fontSize:13, textAlign:"center", fontWeight:500 }}>{error}</div>}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ background:"#fff", borderRadius:18, padding:28, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", border:"1px solid #e2e8f0", textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:12, display:"inline-block", animation:"spin 2.5s linear infinite" }}>⚗️</div>
            <div style={{ fontWeight:700, color:"#1e293b", fontSize:15 }}>Analyzing your ingredients…</div>
            <div style={{ color:"#94a3b8", fontSize:13, marginTop:5 }}>Detecting product type and running contextual analysis</div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div style={{ animation:"fadeUp 0.4s ease" }}>

            {/* Context Banner */}
            <div style={{ background:contextBg(result.productType), border:`1px solid ${contextBorder(result.productType)}`, borderRadius:12, padding:"10px 14px", marginBottom:12, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:22 }}>{productIcon(result.productType)}</span>
              <div>
                <div style={{ fontSize:11, fontWeight:800, textTransform:"uppercase", letterSpacing:"0.1em", color:contextText(result.productType) }}>{result.productType} detected</div>
                <div style={{ fontSize:12, color:"#475569", marginTop:2 }}>{result.analysisContext}</div>
              </div>
            </div>

            {/* Grounding Summary — how many ingredients are backed by official regulatory data */}
            {result.groundingSummary && (
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:11, color:"#475569", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:10, padding:"8px 12px", marginBottom:12 }}>
                <span style={{ fontSize:14 }}>📋</span>
                <span>
                  <strong style={{ color:"#15803d" }}>{result.groundingSummary.verifiedCount}/{result.groundingSummary.totalCount}</strong> ingredients verified against official sources (JECFA, EFSA, FDA, FSSAI, CosIng, CDSCO/BIS, IARC) — the rest are AI-assessed from general knowledge.
                </span>
              </div>
            )}

            {/* Score Card */}
            <div style={{ background:"#fff", borderRadius:18, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", border:"1px solid #e2e8f0", marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18, gap:12 }}>
                <div style={{ flex:1, fontSize:14, color:"#334155", lineHeight:1.5, fontWeight:500 }}>{result.verdict}</div>
                <div style={{ ...processColor(result.processingLevel), fontSize:10, fontWeight:800, padding:"5px 10px", borderRadius:20, letterSpacing:"0.05em", whiteSpace:"nowrap", flexShrink:0 }}>
                  {result.processingLevel}
                </div>
              </div>
              <div style={{ display:"flex", justifyContent:"space-around", paddingTop:16, borderTop:"1px solid #f1f5f9" }}>
                <ScoreRing score={result.overallScore}    label="Overall" />
                <ScoreRing score={result.safetyScore}     label="Safety"  />
                <ScoreRing score={result.processingScore} label="Natural" />
              </div>
            </div>

            {/* Suitability */}
            <div style={{ background:"#fff", borderRadius:18, padding:16, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", border:"1px solid #e2e8f0", marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:800, letterSpacing:"0.12em", textTransform:"uppercase", color:"#94a3b8", marginBottom:12 }}>Suitability</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                {Object.entries(result.suitableFor||{}).map(([key,val]) => (
                  <div key={key} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:9, background:"#f8fafc", border:"1px solid #f1f5f9" }}>
                    <span style={{ fontSize:16, fontWeight:800, color:suitColor(val) }}>{suitIcon(val)}</span>
                    <span style={{ fontSize:13, color:"#475569", fontWeight:500, textTransform:"capitalize" }}>{key.replace(/([A-Z])/g," $1").trim()}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div style={{ background:"#fff", borderRadius:18, boxShadow:"0 1px 4px rgba(0,0,0,0.07)", border:"1px solid #e2e8f0", overflow:"hidden" }}>
              <div style={{ display:"flex", borderBottom:"1px solid #f1f5f9", background:"#f8fafc", overflowX:"auto" }}>
                {tabs.map(tab => (
                  <button key={tab.id} className="tab-btn" onClick={() => setActiveTab(tab.id)} style={{ flexShrink:0, flex:1, padding:"12px 6px", border:"none", background:activeTab===tab.id?"#fff":"transparent", color:activeTab===tab.id?"#1d4ed8":"#64748b", fontWeight:activeTab===tab.id?700:500, fontSize:11, cursor:"pointer", borderBottom:activeTab===tab.id?"2px solid #2563eb":"2px solid transparent", transition:"all 0.15s", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div style={{ padding:16 }}>

                {activeTab==="overview" && (
                  <div>
                    {result.positives?.length>0 && (
                      <div style={{ marginBottom:16 }}>
                        <div style={{ fontSize:11, fontWeight:800, color:"#16a34a", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>✅ Positives</div>
                        {result.positives.map((p,i) => (
                          <div key={i} style={{ padding:"9px 12px", background:"#f0fdf4", borderRadius:9, borderLeft:"3px solid #22c55e", marginBottom:6 }}>
                            <span style={{ fontSize:13, color:"#166534", lineHeight:1.5 }}>{p}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {result.concerns?.length>0 && (
                      <div>
                        <div style={{ fontSize:11, fontWeight:800, color:"#dc2626", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>⚠️ Concerns</div>
                        {result.concerns.map((c,i) => (
                          <div key={i} style={{ padding:"9px 12px", background:"#fef2f2", borderRadius:9, borderLeft:"3px solid #ef4444", marginBottom:6 }}>
                            <span style={{ fontSize:13, color:"#7f1d1d", lineHeight:1.5 }}>{c}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab==="kpis" && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>Key Indicators — {result.productType}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      {result.kpis?.map((kpi,i) => (
                        <div key={i} className="kpi-card" style={{ padding:12, borderRadius:12, background:kpiBg(kpi.level), border:`1px solid ${kpiBorder(kpi.level)}` }}>
                          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{kpi.label}</div>
                          <div style={{ fontSize:18, fontWeight:800, color:kpiColor(kpi.level), marginBottom:4 }}>{kpi.value}</div>
                          <div style={{ fontSize:11, color:"#64748b", lineHeight:1.4 }}>{kpi.note}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab==="ingredients" && (
                  <div>
                    <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                      {["green","yellow","red"].map(f => (
                        <div key={f} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, color:"#64748b", fontWeight:600 }}>
                          <div style={{ width:9, height:9, borderRadius:"50%", background:flagDot(f) }} />
                          {f==="green"?"Safe":f==="yellow"?"Moderate":"Concern"}
                          <span style={{ color:flagDot(f) }}>({result.ingredients?.filter(i=>i.flag===f).length})</span>
                        </div>
                      ))}
                    </div>
                    {result.ingredients?.map((ing,i) => (
                      <div key={i} className="ing-card" style={{ padding:"10px 12px", borderRadius:10, marginBottom:8, background:flagBg(ing.flag), border:`1px solid ${flagBorder(ing.flag)}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                          <div style={{ width:8, height:8, borderRadius:"50%", background:flagDot(ing.flag), flexShrink:0 }} />
                          <span style={{ fontSize:13, fontWeight:700, color:"#1e293b" }}>{ing.name}</span>
                          <span style={{ fontSize:10, color:"#94a3b8", fontWeight:600, marginLeft:"auto" }}>{ing.category}</span>
                        </div>
                        <div style={{ paddingLeft:15, marginBottom:4 }}>
                          {ing.officialSource ? (
                            <span title={ing.officialSourceDetails?.sourceLinks?.map(s=>s.body).join(", ")}
                              style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, color:"#15803d", background:"#dcfce7", border:"1px solid #bbf7d0", borderRadius:6, padding:"2px 7px" }}>
                              ✓ Verified · {Object.keys(ing.officialSourceDetails?.regulatory || {}).filter(k=>ing.officialSourceDetails.regulatory[k]).join("/")}
                            </span>
                          ) : (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, fontWeight:700, color:"#92400e", background:"#fef3c7", border:"1px solid #fde68a", borderRadius:6, padding:"2px 7px" }}>
                              AI-assessed · no official record matched
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color:"#64748b", marginBottom:4, paddingLeft:15 }}>{ing.flagReason}</div>
                        <div style={{ fontSize:12, color:"#475569", lineHeight:1.5, paddingLeft:15 }}>{ing.healthImpact}</div>
                        {ing.officialSource && ing.officialSourceDetails?.knownConcerns && (
                          <div style={{ marginTop:8, paddingLeft:15 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#15803d", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:3 }}>Regulatory note</div>
                            <div style={{ fontSize:12, color:"#14532d", lineHeight:1.5, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:7, padding:"6px 10px" }}>{ing.officialSourceDetails.knownConcerns}</div>
                          </div>
                        )}
                        {ing.composition && (
                          <div style={{ marginTop:8, paddingLeft:15 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#7c3aed", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:3 }}>What it's made of</div>
                            <div style={{ fontSize:12, color:"#4c1d95", lineHeight:1.5, background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:7, padding:"6px 10px" }}>{ing.composition}</div>
                          </div>
                        )}
                        {ing.sideEffects && (
                          <div style={{ marginTop:6, paddingLeft:15 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:"#b45309", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:3 }}>Known side effects</div>
                            <div style={{ fontSize:12, color:"#78350f", lineHeight:1.5, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:7, padding:"6px 10px" }}>{ing.sideEffects}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {activeTab==="advice" && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:"#1d4ed8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:12 }}>💡 Recommendations</div>
                    {result.recommendations?.map((r,i) => (
                      <div key={i} style={{ display:"flex", gap:10, marginBottom:10, padding:"10px 12px", background:"#eff6ff", borderRadius:10, borderLeft:"3px solid #3b82f6" }}>
                        <span style={{ fontSize:13, fontWeight:800, color:"#1d4ed8", minWidth:22 }}>{i+1}.</span>
                        <span style={{ fontSize:13, color:"#1e3a8a", lineHeight:1.6 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab==="alternatives" && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:"#7c3aed", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:4 }}>✨ Cleaner Alternatives</div>
                    <div style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>Suggested because overall score is below 70</div>
                    {result.alternatives?.map((alt,i) => (
                      <div key={i} className="alt-card" style={{ padding:14, borderRadius:12, marginBottom:10, background:"#faf5ff", border:"1px solid #e9d5ff" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                          <span style={{ fontSize:14, fontWeight:700, color:"#4c1d95" }}>{alt.name}</span>
                          <span style={{ fontSize:10, fontWeight:700, background:alt.type==="brand"?"#7c3aed":"#2563eb", color:"#fff", padding:"2px 8px", borderRadius:10, textTransform:"uppercase", letterSpacing:"0.06em", flexShrink:0 }}>
                            {alt.type}
                          </span>
                        </div>
                        <div style={{ fontSize:12, color:"#6d28d9", lineHeight:1.5, marginBottom:12 }}>{alt.reason}</div>
                        {/* Shopping links */}
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          <a href={amazonSearchUrl(alt.name,"in")} target="_blank" rel="noopener noreferrer" className="shop-btn"
                            style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#FF9900", color:"#111", fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, textDecoration:"none", transition:"opacity 0.2s" }}>
                            🛒 Amazon India
                          </a>
                          <a href={amazonSearchUrl(alt.name,"com")} target="_blank" rel="noopener noreferrer" className="shop-btn"
                            style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#232f3e", color:"#fff", fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, textDecoration:"none", transition:"opacity 0.2s" }}>
                            🛒 Amazon Global
                          </a>
                          <a href={`https://www.flipkart.com/search?q=${encodeURIComponent(alt.name)}`} target="_blank" rel="noopener noreferrer" className="shop-btn"
                            style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#2874f0", color:"#fff", fontSize:11, fontWeight:700, padding:"5px 12px", borderRadius:8, textDecoration:"none", transition:"opacity 0.2s" }}>
                            🛒 Flipkart
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>

            <div style={{ textAlign:"center", fontSize:11, color:"#94a3b8", marginTop:14, lineHeight:1.6 }}>
              Analysis by Llama 3.1 8B via Groq · Shopping links open search results · For clinical decisions, consult a qualified professional.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
