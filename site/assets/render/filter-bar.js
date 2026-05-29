import {
  CAMPUS_NAMES,
  categoryLabel,
  CHIP_CATEGORIES,
  orderedCampuses,
  TYPE_ALL,
  TYPE_LABELS,
  TYPE_ORDER,
  TYPE_SCHOOLS,
} from "../data/constants.js";
import {
  applyFilter,
  describeFilter,
  getFilterState,
  isDefaultState,
  resetFilters,
  selectAllCampuses,
  setCategory,
  setType,
  subscribe,
  toggleCampus,
} from "../state/filters.js";

function makeChip(className, label, dataset, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = className;
  for (const [key, value] of Object.entries(dataset)) btn.dataset[key] = value;
  btn.setAttribute("aria-pressed", "false");
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildTypeChips(container) {
  for (const key of TYPE_ORDER) {
    container.appendChild(
      makeChip("chip chip-type", TYPE_LABELS[key], { type: key }, () => setType(key)),
    );
  }
}

function buildCampusChips(container, campusSlugs) {
  // Leading "All campuses" chip mirrors the View row's "All" chip: it is
  // the resting/default selection and the one-click way back to it. Without
  // it, the only way to clear a multi-campus selection was to toggle every
  // chip off, and the default state lit all eleven chips at once.
  container.appendChild(
    makeChip("chip chip-campus chip-campus-all", "All campuses", { campusAll: "true" }, () =>
      selectAllCampuses(),
    ),
  );
  for (const slug of campusSlugs) {
    container.appendChild(
      makeChip("chip chip-campus", CAMPUS_NAMES[slug] || slug, { campus: slug }, () =>
        toggleCampus(slug, campusSlugs),
      ),
    );
  }
}

function buildCategoryOptions(select, categories) {
  const ordered = [...categories].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b)));
  for (const key of ordered) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = categoryLabel(key);
    select.appendChild(opt);
  }
}

// Toggle .active + aria-pressed on every chip in a container from a
// predicate, so the active-state logic stays declarative per chip group.
function syncChips(container, isActive) {
  for (const btn of container.querySelectorAll(".chip")) {
    const active = isActive(btn);
    btn.setAttribute("aria-pressed", String(active));
    btn.classList.toggle("active", active);
  }
}

export function renderFilterBar(ctx) {
  const { currentRows } = ctx;

  // Fall back to r.site for legacy rows that predate the campus field
  // — mirrors the fallback applyFilter() uses when matching campus
  // membership. Without it, pre-expansion homepage rows would fail to
  // contribute a chip even though the filter would still match them.
  const campusUniverse = new Set(currentRows.map((r) => r.campus || r.site).filter(Boolean));
  const campusSlugs = orderedCampuses(campusUniverse);

  // Dropdown lists discipline categories only — any category that has
  // its own View chip is excluded here to avoid a redundant second path
  // to the same filter.
  const disciplineCategories = new Set(
    currentRows.map((r) => r.category).filter((c) => c && !CHIP_CATEGORIES.has(c)),
  );

  const typeChipContainer = document.getElementById("filter-type-chips");
  const campusChipContainer = document.getElementById("filter-campus-chips");
  const categorySelect = document.getElementById("filter-category-select");
  const resetBtn = document.getElementById("filter-reset");
  const summaryEl = document.getElementById("filter-summary");

  buildTypeChips(typeChipContainer);
  buildCampusChips(campusChipContainer, campusSlugs);
  buildCategoryOptions(categorySelect, disciplineCategories);
  categorySelect.addEventListener("change", (e) => setCategory(e.target.value || null));
  resetBtn.addEventListener("click", () => resetFilters());

  function syncUI(state) {
    syncChips(typeChipContainer, (btn) => btn.dataset.type === state.type);
    // Empty campuses set means "all": light up only the dedicated All chip
    // so individual chips read as the unselected affordances they are.
    // Clicking a campus then filters TO it. This is what stops the default
    // state from rendering eleven identical solid-blue pills.
    syncChips(campusChipContainer, (btn) =>
      btn.dataset.campusAll ? state.campuses.size === 0 : state.campuses.has(btn.dataset.campus),
    );

    categorySelect.value = state.category || "";
    // Discipline dropdown only applies when browsing all sites or the
    // schools & colleges bucket; every other chip type is already its
    // own filter.
    categorySelect.disabled = state.type !== TYPE_ALL && state.type !== TYPE_SCHOOLS;

    resetBtn.hidden = isDefaultState();

    const filtered = applyFilter(currentRows, state);
    const desc = describeFilter(state);
    summaryEl.textContent = desc
      ? `Showing ${filtered.length} of ${currentRows.length} UC sites · ${desc}`
      : `Showing ${filtered.length} of ${currentRows.length} UC sites`;
  }

  syncUI(getFilterState());
  subscribe(syncUI);
}
