import {
  CAMPUS_NAMES,
  categoryLabel,
  orderedCampuses,
  TYPE_ADMISSIONS,
  TYPE_HOMEPAGES,
  TYPE_LABELS,
  TYPE_ORDER,
} from "../data/constants.js";
import {
  applyFilter,
  describeFilter,
  getFilterState,
  isDefaultState,
  resetFilters,
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

  // Dropdown lists discipline categories only — homepage and admissions
  // already have their own View chip, so surfacing them here would be a
  // redundant second path to the same filter.
  const disciplineCategories = new Set(
    currentRows.map((r) => r.category).filter((c) => c && c !== "homepage" && c !== "admissions"),
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

    // Empty campuses set means "all", so every chip lights up.
    const allActive = state.campuses.size === 0;
    for (const btn of campusChipContainer.querySelectorAll(".chip-campus")) {
      const active = allActive || state.campuses.has(btn.dataset.campus);
      btn.setAttribute("aria-pressed", String(active));
      btn.classList.toggle("active", active);
    }

    categorySelect.value = state.category || "";
    categorySelect.disabled = state.type === TYPE_HOMEPAGES || state.type === TYPE_ADMISSIONS;

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
