// Personal profiles: stored only in this browser (never sent to the server), and
// checked against each analysis with simple, explainable rules.

const STORAGE_KEY = "ii.profile.v1";

export const PROFILE_GROUPS = [
  {
    id: "diet", title: "Diet", options: [
      { id: "vegetarian", label: "Vegetarian" },
      { id: "vegan", label: "Vegan" },
      { id: "jain", label: "Jain" },
    ],
  },
  {
    id: "health", title: "Health", options: [
      { id: "diabetic", label: "Diabetic / low sugar" },
      { id: "pregnancy", label: "Pregnant" },
      { id: "sensitiveSkin", label: "Sensitive skin" },
    ],
  },
  {
    id: "allergies", title: "Allergies", options: [
      { id: "peanut", label: "Peanut" },
      { id: "treeNuts", label: "Tree nuts" },
      { id: "milk", label: "Milk / dairy" },
      { id: "egg", label: "Egg" },
      { id: "gluten", label: "Gluten" },
      { id: "soy", label: "Soy" },
      { id: "sesame", label: "Sesame" },
      { id: "mustard", label: "Mustard" },
      { id: "shellfish", label: "Fish / shellfish" },
    ],
  },
  {
    id: "avoid", title: "I prefer to avoid", options: [
      { id: "artificialColours", label: "Artificial colours" },
      { id: "artificialSweeteners", label: "Artificial sweeteners" },
      { id: "preservatives", label: "Preservatives" },
      { id: "palmOil", label: "Palm oil" },
      { id: "fragrance", label: "Added fragrance" },
      { id: "parabensSulfates", label: "Parabens & sulfates" },
    ],
  },
];

export const ALL_OPTIONS = PROFILE_GROUPS.flatMap((g) => g.options);
export const optionLabel = (id) => (ALL_OPTIONS.find((o) => o.id === id) || {}).label || id;

export function loadProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.selected) ? parsed : { selected: [] };
  } catch (_) {
    return { selected: [] };
  }
}

export function saveProfile(profile) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); } catch (_) { /* private mode */ }
}

// ---- Rules -----------------------------------------------------------------
// Each keyword list is matched against ingredient names as whole words.
const KW = {
  meatFish: ["gelatin", "gelatine", "lard", "tallow", "suet", "beef", "pork", "chicken", "mutton", "meat", "fish", "anchovy", "isinglass", "shellac", "cochineal", "carmine", "carminic acid", "animal fat", "bone char", "collagen"],
  maybeAnimal: ["rennet", "l-cysteine", "lecithin", "mono- and diglycerides", "mono and diglycerides", "glycerin", "glycerine", "natural flavour", "natural flavor", "stearic acid", "vitamin d3"],
  egg: ["egg", "eggs", "albumin", "albumen", "egg white", "egg yolk", "lysozyme", "ovalbumin"],
  dairy: ["milk", "milk solids", "skimmed milk", "whey", "casein", "caseinate", "lactose", "butter", "ghee", "cream", "cheese", "curd", "yogurt", "yoghurt", "paneer", "khoa", "milk fat", "lactalbumin"],
  beeAndOther: ["honey", "beeswax", "royal jelly", "propolis", "lanolin", "carmine", "silk"],
  jainRoots: ["onion", "garlic", "potato", "carrot", "beetroot", "radish", "ginger", "turnip", "sweet potato", "yam", "shallot", "leek"],
  sugars: ["sugar", "sucrose", "glucose", "glucose syrup", "dextrose", "fructose", "high fructose corn syrup", "corn syrup", "invert sugar", "jaggery", "maltodextrin", "maltose", "honey", "liquid glucose", "cane sugar", "brown sugar"],
  pregnancy: ["caffeine", "alcohol", "ethanol", "quinine", "retinol", "retinyl palmitate", "retinyl acetate", "salicylic acid", "saccharin", "hydroquinone", "liquorice", "licorice"],
  peanut: ["peanut", "peanuts", "groundnut", "groundnuts", "arachis oil"],
  treeNuts: ["almond", "almonds", "cashew", "cashews", "walnut", "walnuts", "hazelnut", "hazelnuts", "pistachio", "pistachios", "pecan", "macadamia", "brazil nut", "pine nut", "badam", "kaju", "akhrot"],
  gluten: ["wheat", "barley", "rye", "oats", "malt", "malt extract", "semolina", "maida", "atta", "sooji", "suji", "spelt", "gluten", "wheat flour", "refined wheat flour"],
  soy: ["soy", "soya", "soybean", "soybeans", "soy lecithin", "soya lecithin", "tofu", "edamame"],
  sesame: ["sesame", "til", "tahini", "gingelly"],
  mustard: ["mustard", "mustard oil", "rai", "sarson"],
  shellfish: ["fish", "shrimp", "prawn", "crab", "lobster", "shellfish", "anchovy", "fish sauce", "fish oil", "squid", "oyster"],
  sweeteners: ["aspartame", "sucralose", "acesulfame", "acesulfame k", "acesulfame potassium", "saccharin", "neotame", "advantame", "cyclamate", "sodium cyclamate"],
  palm: ["palm", "palm oil", "palmolein", "palm olein", "palm kernel", "palmitate", "hydrogenated vegetable oil"],
  fragrance: ["fragrance", "parfum", "perfume", "aroma"],
  parabensSulfates: ["paraben", "methylparaben", "propylparaben", "butylparaben", "ethylparaben", "sodium lauryl sulfate", "sodium laureth sulfate", "sls", "sles", "ammonium lauryl sulfate"],
  skinIrritants: ["fragrance", "parfum", "alcohol denat", "denatured alcohol", "sodium lauryl sulfate", "menthol", "essential oil", "limonene", "linalool", "methylisothiazolinone"],
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const hasWord = (text, words) => {
  const t = ` ${String(text || "").toLowerCase()} `;
  return words.find((w) => new RegExp(`(^|[^a-z])${escapeRe(w)}([^a-z]|$)`).test(t)) || null;
};

const cat = (ing) => String(ing.category || "").toLowerCase();
const diet = (ing) => (ing.dataFacts && ing.dataFacts.diet) || {};

// Returns { selected, conflicts: [{ingredient, reason, level, option}], fits }
// level: "avoid" (clear conflict) or "caution" (may conflict / check the source).
export function evaluateProfile(result, profile) {
  const sel = new Set((profile && profile.selected) || []);
  const conflicts = [];
  if (!result || !sel.size) return { selected: [...sel], conflicts, fits: true };

  const add = (ingredient, option, level, reason) => {
    if (!conflicts.some((c) => c.ingredient === ingredient && c.option === option)) {
      conflicts.push({ ingredient, option, level, reason });
    }
  };
  const ings = result.ingredients || [];
  const suit = result.suitableFor || {};

  ings.forEach((ing, idx) => {
    const name = ing.name || "";
    const d = diet(ing);
    const c = cat(ing);
    let w;

    if (sel.has("vegetarian") || sel.has("vegan") || sel.has("jain")) {
      const opt = sel.has("vegan") ? "vegan" : sel.has("jain") ? "jain" : "vegetarian";
      if ((w = hasWord(name, KW.meatFish)) || d.vegetarian === "no") add(name, opt, "avoid", "Animal-derived (not vegetarian)");
      else if (d.vegetarian === "maybe" || (w = hasWord(name, KW.maybeAnimal))) add(name, opt, "caution", "Can be animal- or plant-derived; check with the brand");
      if ((w = hasWord(name, KW.egg))) add(name, opt, sel.has("vegan") || sel.has("jain") ? "avoid" : "caution", "Contains egg");
    }
    if (sel.has("vegan")) {
      if ((w = hasWord(name, KW.dairy))) add(name, "vegan", "avoid", "Dairy-derived");
      else if ((w = hasWord(name, KW.beeAndOther))) add(name, "vegan", "avoid", "Animal-derived (not vegan)");
      else if (d.vegan === "no") add(name, "vegan", "avoid", "Not vegan (open data)");
      else if (d.vegan === "maybe") add(name, "vegan", "caution", "May not be vegan; check with the brand");
    }
    if (sel.has("jain")) {
      if ((w = hasWord(name, KW.jainRoots))) add(name, "jain", "avoid", "Root vegetable");
      if (hasWord(name, ["honey"])) add(name, "jain", "avoid", "Honey");
    }
    if (sel.has("diabetic") && (w = hasWord(name, KW.sugars))) {
      add(name, "diabetic", idx < 3 ? "avoid" : "caution", idx < 3 ? "Added sugar near the top of the list" : "Contains added sugar");
    }
    if (sel.has("pregnancy") && (w = hasWord(name, KW.pregnancy))) {
      add(name, "pregnancy", "caution", "Often advised to limit in pregnancy; ask your doctor");
    }
    const allergy = [["peanut", KW.peanut], ["treeNuts", KW.treeNuts], ["milk", KW.dairy], ["egg", KW.egg], ["gluten", KW.gluten], ["soy", KW.soy], ["sesame", KW.sesame], ["mustard", KW.mustard], ["shellfish", KW.shellfish]];
    for (const [opt, words] of allergy) {
      if (sel.has(opt) && (w = hasWord(name, words))) add(name, opt, "avoid", `Allergen: ${optionLabel(opt).toLowerCase()}`);
    }
    if (sel.has("artificialColours") && (c.includes("artificial color") || c.includes("artificial colour"))) add(name, "artificialColours", "avoid", "Artificial colour");
    if (sel.has("artificialSweeteners") && (w = hasWord(name, KW.sweeteners))) add(name, "artificialSweeteners", "avoid", "Artificial sweetener");
    if (sel.has("preservatives") && c.includes("preservative")) add(name, "preservatives", "avoid", "Preservative");
    if (sel.has("palmOil")) {
      if ((w = hasWord(name, KW.palm)) || d.fromPalmOil === "yes") add(name, "palmOil", "avoid", "Palm oil");
      else if (d.fromPalmOil === "maybe") add(name, "palmOil", "caution", "May be made from palm oil");
    }
    if (sel.has("fragrance") && (c.includes("fragrance") || hasWord(name, KW.fragrance))) add(name, "fragrance", "avoid", "Added fragrance");
    if (sel.has("parabensSulfates") && hasWord(name, KW.parabensSulfates)) add(name, "parabensSulfates", "avoid", "Paraben or sulfate");
    if (sel.has("sensitiveSkin") && (c.includes("skin irritant") || c.includes("allergen") || hasWord(name, KW.skinIrritants))) add(name, "sensitiveSkin", "caution", "Common skin irritant");
  });

  // Product-level signals from the analysis itself.
  if (sel.has("vegetarian") && suit.vegetarian === false) add("Whole product", "vegetarian", "avoid", "Marked not vegetarian in the analysis");
  if (sel.has("vegan") && suit.vegan === false) add("Whole product", "vegan", "avoid", "Marked not vegan in the analysis");
  if (sel.has("gluten") && suit.glutenFree === false) add("Whole product", "gluten", "avoid", "Marked not gluten-free in the analysis");
  if (sel.has("diabetic") && suit.diabetic === false) add("Whole product", "diabetic", "avoid", "Marked not diabetic-friendly in the analysis");

  conflicts.sort((a, b) => (a.level === b.level ? 0 : a.level === "avoid" ? -1 : 1));
  return { selected: [...sel], conflicts, fits: !conflicts.some((c) => c.level === "avoid") };
}
