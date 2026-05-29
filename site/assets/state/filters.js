import {
  CAMPUS_NAMES,
  CATEGORY_LABELS,
  CHIP_CATEGORIES,
  TYPE_ADMISSIONS,
  TYPE_ALL,
  TYPE_DISABILITY,
  TYPE_FINANCIAL_AID,
  TYPE_HEALTH,
  TYPE_HOMEPAGES,
  TYPE_HOUSING,
  TYPE_IT,
  TYPE_LABELS,
  TYPE_LIBRARIES,
  TYPE_ORDER,
  TYPE_REGISTRARS,
  TYPE_SCHOOLS,
} from "../data/constants.js";

// filterState shape:
//   type:     one of TYPE_ORDER (see data/constants.js)
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

// "Empty set = all" convention: an empty selection means every campus is
// shown, and the dedicated "All campuses" chip (see selectAllCampuses) is
// the affordance that returns to it. Clicking an individual chip filters
// TO that campus rather than removing it, mirroring the View row: from the
// default "all" state the first click selects only the clicked campus,
// further clicks add to the selection, and clicking a selected chip toggles
// it back off. Selecting the whole universe collapses back to empty so the
// All chip lights up instead of all eleven. The caller passes the full
// campus universe so this module doesn't need to know it separately.
export function toggleCampus(slug, allCampuses) {
  if (state.campuses.has(slug)) {
    state.campuses.delete(slug);
  } else if (state.campuses.size === 0) {
    state.campuses = new Set([slug]);
  } else {
    state.campuses.add(slug);
    if (state.campuses.size === allCampuses.length) state.campuses = new Set();
  }
  writeHash();
  notify();
}

// Return to the "all campuses" default. Backs the dedicated All chip so a
// multi-campus selection can be cleared in one click without toggling each
// chip off individually.
export function selectAllCampuses() {
  if (state.campuses.size === 0) return;
  state.campuses = new Set();
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
// Four independent optional params put this at cyclomatic 5; a data-driven
// rewrite only trades the ifs for ternaries and reads worse, so the linear
// form stays and the complexity check is suppressed deliberately.
// fallow-ignore-next-line complexity
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

// Parse a campus= value into a selection set, dropping any slug not in the
// known campus map so URL input can never leak through verbatim. Returns
// null when the param is absent or yields no valid slugs (i.e. "all").
function parseCampusParam(raw) {
  if (!raw) return null;
  const validCampuses = new Set(Object.keys(CAMPUS_NAMES));
  const selected = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && validCampuses.has(s));
  return selected.length ? new Set(selected) : null;
}

// cat= only applies within the "all" or "schools" views; every other view
// is already its own filter.
function categoryAppliesToType(type) {
  return type === TYPE_ALL || type === TYPE_SCHOOLS;
}

// A cat= value is honored only if it names a real discipline that doesn't
// have its own View chip — the discipline dropdown can't represent chip
// categories, so #cat=homepage would set a filter the UI can't expose.
function isDisciplineCategory(cat) {
  return Boolean(cat && CATEGORY_LABELS[cat]) && !CHIP_CATEGORIES.has(cat);
}

function readTypeParam(params) {
  const type = params.get("type");
  return type && TYPE_ORDER.includes(type) ? type : TYPE_ALL;
}

function readCategoryParam(params, type) {
  if (!categoryAppliesToType(type)) return null;
  const cat = params.get("cat");
  return isDisciplineCategory(cat) ? cat : null;
}

export function readHashIntoState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  state.type = readTypeParam(params);
  state.campuses = parseCampusParam(params.get("campus")) || new Set();
  state.category = readCategoryParam(params, state.type);
  currentSection = params.get("section") || null;
}

export function getSection() {
  return currentSection;
}

export function setSection(id) {
  const next = id || null;
  if (currentSection === next) return;
  currentSection = next;
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

// Sort so the summary reads the same regardless of chip toggle order,
// matching the deterministic URL hash. Drop any slug not in the known
// campus map so URL-hash input can never leak through verbatim into the
// DOM. Returns null for the "all campuses" case.
function describeCampusFilter(campuses) {
  if (campuses.size === 0) return null;
  const names = [...campuses]
    .sort()
    .map((slug) => CAMPUS_NAMES[slug])
    .filter(Boolean);
  if (!names.length) return null;
  return names.length <= 3 ? names.join(", ") : `${names.length} campuses`;
}

function categoryFilterLabel(category) {
  return category && CATEGORY_LABELS[category] ? CATEGORY_LABELS[category] : null;
}

export function describeFilter(s) {
  const parts = [];
  if (s.type !== TYPE_ALL) parts.push(TYPE_LABELS[s.type]);
  const campusPart = describeCampusFilter(s.campuses);
  if (campusPart) parts.push(campusPart);
  const categoryPart = categoryFilterLabel(s.category);
  if (categoryPart) parts.push(categoryPart);
  return parts.join(" · ");
}

// Raw site `type` → View-chip bucket. Anything not listed (schools,
// divisions, or an unknown type) falls through to the schools & colleges
// bucket, and a missing type defaults to homepage, matching the filter
// fallback in applyFilter().
const ROW_TYPE_BUCKETS = {
  homepage: TYPE_HOMEPAGES,
  admissions: TYPE_ADMISSIONS,
  library: TYPE_LIBRARIES,
  it: TYPE_IT,
  disability: TYPE_DISABILITY,
  registrar: TYPE_REGISTRARS,
  "financial-aid": TYPE_FINANCIAL_AID,
  health: TYPE_HEALTH,
  housing: TYPE_HOUSING,
};

function rowTypeBucket(row) {
  return ROW_TYPE_BUCKETS[row.type || "homepage"] || TYPE_SCHOOLS;
}

const matchesType = (row, s) => s.type === TYPE_ALL || rowTypeBucket(row) === s.type;
const matchesCampus = (row, s) => s.campuses.size === 0 || s.campuses.has(row.campus || row.site);
// Rows missing a category (pre-expansion months) fall back to homepage so
// they still surface under the default view rather than vanishing silently
// when someone backfills history.
const matchesCategory = (row, s) => !s.category || (row.category || "homepage") === s.category;

export function applyFilter(rows, s = state) {
  return rows.filter((r) => matchesType(r, s) && matchesCampus(r, s) && matchesCategory(r, s));
}
