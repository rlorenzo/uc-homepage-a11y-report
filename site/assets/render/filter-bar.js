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

  for (const key of TYPE_ORDER) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip chip-type";
    btn.dataset.type = key;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = TYPE_LABELS[key];
    btn.addEventListener("click", () => setType(key));
    typeChipContainer.appendChild(btn);
  }

  // Leading "All campuses" chip mirrors the View row's "All" chip: it is
  // the resting/default selection and the one-click way back to it. Without
  // it, the only way to clear a multi-campus selection was to toggle every
  // chip off, and the default state lit all eleven chips at once.
  const allCampusBtn = document.createElement("button");
  allCampusBtn.type = "button";
  allCampusBtn.className = "chip chip-campus chip-campus-all";
  allCampusBtn.dataset.campusAll = "true";
  allCampusBtn.setAttribute("aria-pressed", "false");
  allCampusBtn.textContent = "All campuses";
  allCampusBtn.addEventListener("click", () => selectAllCampuses());
  campusChipContainer.appendChild(allCampusBtn);

  for (const slug of campusSlugs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip chip-campus";
    btn.dataset.campus = slug;
    btn.setAttribute("aria-pressed", "false");
    btn.textContent = CAMPUS_NAMES[slug] || slug;
    btn.addEventListener("click", () => toggleCampus(slug, campusSlugs));
    campusChipContainer.appendChild(btn);
  }

  const orderedCategoryKeys = [...disciplineCategories].sort((a, b) =>
    categoryLabel(a).localeCompare(categoryLabel(b)),
  );
  for (const key of orderedCategoryKeys) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = categoryLabel(key);
    categorySelect.appendChild(opt);
  }
  categorySelect.addEventListener("change", (e) => setCategory(e.target.value || null));

  resetBtn.addEventListener("click", () => resetFilters());

  function syncUI(state) {
    for (const btn of typeChipContainer.querySelectorAll(".chip-type")) {
      const active = btn.dataset.type === state.type;
      btn.setAttribute("aria-pressed", String(active));
      btn.classList.toggle("active", active);
    }

    // Empty campuses set means "all": light up only the dedicated All chip
    // so individual chips read as the unselected affordances they are.
    // Clicking a campus then filters TO it. This is what stops the default
    // state from rendering eleven identical solid-blue pills.
    const allActive = state.campuses.size === 0;
    const allBtn = campusChipContainer.querySelector(".chip-campus-all");
    if (allBtn) {
      allBtn.setAttribute("aria-pressed", String(allActive));
      allBtn.classList.toggle("active", allActive);
    }
    for (const btn of campusChipContainer.querySelectorAll(".chip-campus[data-campus]")) {
      const active = state.campuses.has(btn.dataset.campus);
      btn.setAttribute("aria-pressed", String(active));
      btn.classList.toggle("active", active);
    }

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
