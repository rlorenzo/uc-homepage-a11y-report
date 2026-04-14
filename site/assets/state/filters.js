import {
  CAMPUS_NAMES,
  CATEGORY_LABELS,
  TYPE_ADMISSIONS,
  TYPE_ALL,
  TYPE_HOMEPAGES,
  TYPE_LABELS,
  TYPE_ORDER,
  TYPE_SCHOOLS,
} from "../data/constants.js";

// filterState shape:
//   type:     TYPE_ALL | TYPE_HOMEPAGES | TYPE_ADMISSIONS | TYPE_SCHOOLS
//   campuses: Set<slug>  — empty means "all campuses"
//   category: string | null
const DEFAULTS = () => ({
  type: TYPE_ALL,
  campuses: new Set(),
  category: null,
});

const state = DEFAULTS();
const subscribers = new Set();

// Section bookmark state. Lives alongside filter state in the hash so
// deep links can combine a filter view with a specific section anchor,
// but is kept separate from filter state because the two are orthogonal:
// jumping to a section never resets filters, and changing filters never
// clears a section anchor.
let currentSection = null;
const sectionSubscribers = new Set();

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  // Hand subscribers a snapshot so a buggy listener can't mutate the
  // internal state and bypass writeHash() / invariants.
  const snapshot = getFilterState();
  for (const fn of subscribers) fn(snapshot);
}

export function getFilterState() {
  return {
    type: state.type,
    campuses: new Set(state.campuses),
    category: state.category,
  };
}

export function isDefaultState() {
  return state.type === TYPE_ALL && state.campuses.size === 0 && state.category === null;
}

export function setType(type) {
  if (state.type === type) return;
  state.type = type;
  if (type !== TYPE_ALL && type !== TYPE_SCHOOLS) state.category = null;
  writeHash();
  notify();
}

export function setCategory(category) {
  const next = category || null;
  if (state.category === next) return;
  state.category = next;
  writeHash();
  notify();
}

// "Empty set = all" convention: the first toggle off an active chip has
// to materialize the explicit list minus the clicked slug; the last
// toggle that would re-select everything collapses back to empty. The
// caller passes the full campus universe so this module doesn't need
// to know it separately.
export function toggleCampus(slug, allCampuses) {
  if (state.campuses.size === 0) {
    state.campuses = new Set(allCampuses);
    state.campuses.delete(slug);
  } else if (state.campuses.has(slug)) {
    state.campuses.delete(slug);
  } else {
    state.campuses.add(slug);
    if (state.campuses.size === allCampuses.length) state.campuses = new Set();
  }
  writeHash();
  notify();
}

export function resetFilters() {
  const fresh = DEFAULTS();
  state.type = fresh.type;
  state.campuses = fresh.campuses;
  state.category = fresh.category;
  writeHash();
  notify();
}

// Serialize the full filter + section hash string (without the leading
// "#"). Exported so the app can rewrite static section-link hrefs as
// filter state changes — otherwise Cmd/Ctrl-click "open in new tab"
// and "copy link address" would lose the current filter context.
export function buildSectionHash(sectionId) {
  const params = new URLSearchParams();
  if (state.type !== TYPE_ALL) params.set("type", state.type);
  // Sort the campus list before serializing so deep links stay
  // deterministic regardless of the order chips were toggled.
  if (state.campuses.size > 0) params.set("campus", [...state.campuses].sort().join(","));
  if (state.category) params.set("cat", state.category);
  if (sectionId) params.set("section", sectionId);
  return params.toString();
}

function writeHash(historyMode = "replace") {
  const hash = buildSectionHash(currentSection);
  const url = window.location.pathname + window.location.search + (hash ? `#${hash}` : "");
  window.history[historyMode === "push" ? "pushState" : "replaceState"](null, "", url);
}

export function readHashIntoState() {
  const fresh = DEFAULTS();
  state.type = fresh.type;
  state.campuses = fresh.campuses;
  state.category = fresh.category;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const type = params.get("type");
  if (type && TYPE_ORDER.includes(type)) state.type = type;
  const campus = params.get("campus");
  if (campus) {
    const validCampuses = new Set(Object.keys(CAMPUS_NAMES));
    const selected = campus
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && validCampuses.has(s));
    if (selected.length) state.campuses = new Set(selected);
  }
  const cat = params.get("cat");
  // homepage/admissions are exposed as their own View chips, so the
  // discipline dropdown — and by extension the hash — must not accept
  // them as category values. Otherwise #cat=homepage would set a
  // filter the UI can't represent.
  if (
    cat &&
    (state.type === TYPE_ALL || state.type === TYPE_SCHOOLS) &&
    CATEGORY_LABELS[cat] &&
    cat !== "homepage" &&
    cat !== "admissions"
  ) {
    state.category = cat;
  }
  currentSection = params.get("section") || null;
}

export function getSection() {
  return currentSection;
}

export function setSection(id) {
  if (currentSection === (id || null)) return;
  currentSection = id || null;
  writeHash("push");
  for (const fn of sectionSubscribers) fn(currentSection);
}

export function subscribeSection(fn) {
  sectionSubscribers.add(fn);
  return () => sectionSubscribers.delete(fn);
}

// Re-hydrate when the user uses browser back/forward or edits the hash
// manually — without this, deep links work but history navigation
// desyncs the UI from the URL.
window.addEventListener("hashchange", () => {
  const prevSection = currentSection;
  readHashIntoState();
  notify();
  if (currentSection !== prevSection) {
    for (const fn of sectionSubscribers) fn(currentSection);
  }
});

export function describeFilter(s) {
  const parts = [];
  if (s.type !== TYPE_ALL) parts.push(TYPE_LABELS[s.type]);
  if (s.campuses.size > 0) {
    // Sort so the summary reads the same regardless of chip toggle
    // order, matching the deterministic URL hash.
    const names = [...s.campuses].sort().map((slug) => CAMPUS_NAMES[slug] || slug);
    parts.push(names.length <= 3 ? names.join(", ") : `${names.length} campuses`);
  }
  if (s.category) parts.push(CATEGORY_LABELS[s.category] || s.category);
  return parts.join(" · ");
}

function rowTypeBucket(row) {
  const t = row.type || "homepage";
  if (t === "homepage") return TYPE_HOMEPAGES;
  if (t === "admissions") return TYPE_ADMISSIONS;
  return TYPE_SCHOOLS;
}

// Rows missing classification fields (pre-expansion months) fall back
// to homepage/homepage so they still surface under the default view
// rather than vanishing silently when someone backfills history.
export function applyFilter(rows, s = state) {
  return rows.filter((r) => {
    if (s.type !== TYPE_ALL && rowTypeBucket(r) !== s.type) return false;
    if (s.campuses.size > 0) {
      const c = r.campus || r.site;
      if (!s.campuses.has(c)) return false;
    }
    if (s.category) {
      const cat = r.category || "homepage";
      if (cat !== s.category) return false;
    }
    return true;
  });
}
