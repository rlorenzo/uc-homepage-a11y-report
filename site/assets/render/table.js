import {
  CAMPUS_NAMES,
  IMPACT_KEYS,
  orderedCampuses,
  ruleFriendly,
  TYPE_ALL,
  TYPE_SCHOOLS,
} from "../data/constants.js";
import { applyFilter, getFilterState, subscribe } from "../state/filters.js";
import { deltaEl, displayHostname, siteDisplayName, topEntries } from "../utils/format.js";

const CHEVRON_SVG_16 =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHEVRON_SVG_14 =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const TABLE_COL_COUNT = 7;

const IMPACT_CSS_CLASS = {
  critical: "crit",
  serious: "ser",
  moderate: "mod",
  minor: "min",
  unknown: "unk",
};

function makeImpactBar(impact) {
  const bar = document.createElement("span");
  bar.className = "impact-bar";
  bar.setAttribute("role", "img");

  const sum = IMPACT_KEYS.reduce((a, k) => a + (impact[k] || 0), 0);
  if (sum === 0) {
    bar.setAttribute("aria-label", "No violations");
    return bar;
  }

  const labelParts = [];
  for (const k of IMPACT_KEYS) {
    const count = impact[k] || 0;
    if (count === 0) continue;
    const seg = document.createElement("span");
    seg.className = IMPACT_CSS_CLASS[k];
    seg.style.flex = String(count);
    seg.title = `${count} ${k}`;
    bar.appendChild(seg);
    labelParts.push(`${count} ${k}`);
  }
  bar.setAttribute("aria-label", `Impact breakdown: ${labelParts.join(", ")}`);
  return bar;
}

function naCell() {
  const td = document.createElement("td");
  const span = document.createElement("span");
  span.className = "na";
  span.textContent = "n/a";
  td.appendChild(span);
  return td;
}

function sortRows(rows, key, dir) {
  return [...rows].sort((a, b) => {
    // Failed scans always sink to the bottom of any sort.
    const aFailed = a.status === "error" ? 1 : 0;
    const bFailed = b.status === "error" ? 1 : 0;
    if (aFailed !== bFailed) return aFailed - bFailed;

    if (key === "name") {
      const av = siteDisplayName(a).toLowerCase();
      const bv = siteDisplayName(b).toLowerCase();
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    // ?? 0 keeps error rows (which lack the numeric fields) from
    // poisoning the sort comparator if they slip past the failed check.
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    return dir === "asc" ? av - bv : bv - av;
  });
}

function appendRuleList(wrap, title, entries, kind) {
  if (!entries.length) return;
  const strong = document.createElement("strong");
  strong.textContent = title;
  if (kind === "reach") strong.classList.add("reach-heading");
  wrap.appendChild(strong);

  const ul = document.createElement("ul");
  for (const [rule, count] of entries.slice(0, 10)) {
    const li = document.createElement("li");
    const ruleWrap = document.createElement("div");
    const code = document.createElement("code");
    code.textContent = rule;
    ruleWrap.appendChild(code);
    const desc = document.createElement("span");
    desc.className = "rule-desc";
    desc.textContent = ruleFriendly(rule);
    ruleWrap.appendChild(desc);
    li.appendChild(ruleWrap);

    const num = document.createElement("span");
    num.className = "count";
    num.textContent = String(count);
    li.appendChild(num);
    ul.appendChild(li);
  }
  wrap.appendChild(ul);
}

function buildRuleDetail(row) {
  const wrap = document.createElement("div");
  wrap.className = "rule-detail";
  if (row.status === "error") {
    const strong = document.createElement("strong");
    strong.textContent = "Scan error";
    wrap.appendChild(strong);
    const p = document.createElement("p");
    p.textContent = row.error || "Unknown error";
    wrap.appendChild(p);
    return wrap;
  }

  const requiredRules = topEntries(row.violations_by_rule);
  const reachRules = topEntries(row.reach_violations_by_rule);

  if (!requiredRules.length && !reachRules.length) {
    const strong = document.createElement("strong");
    strong.textContent = "A clean axe-core run";
    wrap.appendChild(strong);
    const p = document.createElement("p");
    p.textContent = "No required or reach-goal rules flagged. Next step: manual testing.";
    wrap.appendChild(p);
    return wrap;
  }

  appendRuleList(wrap, "Required (WCAG 2.0/2.1 Level A/AA)", requiredRules, "required");
  appendRuleList(wrap, "Reach goals (WCAG 2.1 Level AAA & WCAG 2.2)", reachRules, "reach");
  return wrap;
}

function buildTableRow(row, prevRow) {
  const failed = row.status === "error";
  const pr = prevRow(row.site);
  const name = siteDisplayName(row);
  const isClean = !failed && row.violations_total === 0;
  const hostname = displayHostname(row.url);

  const tr = document.createElement("tr");
  tr.className = "campus-row";
  if (failed) tr.classList.add("error-row");

  const tdName = document.createElement("td");
  const nameBlock = document.createElement("div");
  nameBlock.className = "campus-name";
  nameBlock.appendChild(document.createTextNode(name));
  if (isClean) {
    const badge = document.createElement("span");
    badge.className = "zero-badge";
    badge.textContent = "Meets A/AA";
    nameBlock.appendChild(badge);
  }
  if (failed) {
    const note = document.createElement("span");
    note.className = "campus-slug";
    note.textContent = "scan failed";
    nameBlock.appendChild(document.createElement("br"));
    nameBlock.appendChild(note);
  }
  tdName.appendChild(nameBlock);
  const slugLink = document.createElement("a");
  slugLink.className = "campus-slug campus-link";
  slugLink.href = row.url;
  slugLink.rel = "noopener";
  slugLink.textContent = hostname;
  slugLink.setAttribute("aria-label", `Visit ${name}: ${hostname}`);
  tdName.appendChild(slugLink);
  tr.appendChild(tdName);

  if (failed) {
    tr.appendChild(naCell());
    tr.appendChild(naCell());
    tr.appendChild(naCell());
    tr.appendChild(naCell());
    tr.appendChild(naCell());
  } else {
    const tdErr = document.createElement("td");
    const num = document.createElement("span");
    num.className = "big-num";
    num.textContent = row.violations_total;
    tdErr.appendChild(num);
    tr.appendChild(tdErr);

    const tdReach = document.createElement("td");
    const reachNum = document.createElement("span");
    reachNum.className = "reach-num";
    reachNum.textContent = row.reach_violations_total;
    tdReach.appendChild(reachNum);
    tr.appendChild(tdReach);

    const tdImpact = document.createElement("td");
    tdImpact.appendChild(makeImpactBar(row.violations_by_impact));
    tr.appendChild(tdImpact);

    const tdElem = document.createElement("td");
    tdElem.textContent = row.element_count.toLocaleString();
    tr.appendChild(tdElem);

    const tdChange = document.createElement("td");
    tdChange.appendChild(deltaEl(row.violations_total, pr ? pr.violations_total : null));
    tr.appendChild(tdChange);
  }

  const tdBtn = document.createElement("td");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "expand-btn";
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("aria-label", `Show rule details for ${name}`);
  btn.innerHTML = CHEVRON_SVG_16;
  tdBtn.appendChild(btn);
  tr.appendChild(tdBtn);

  const detailTr = document.createElement("tr");
  detailTr.className = "detail-row";
  detailTr.style.display = "none";
  const detailTd = document.createElement("td");
  detailTd.colSpan = TABLE_COL_COUNT;
  detailTr.appendChild(detailTd);
  detailTr.id = `detail-${row.site}`;
  btn.setAttribute("aria-controls", detailTr.id);

  let built = false;
  btn.addEventListener("click", () => {
    if (!built) {
      detailTd.appendChild(buildRuleDetail(row));
      built = true;
    }
    const open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!open));
    detailTr.style.display = open ? "none" : "table-row";
    btn.setAttribute("aria-label", `${open ? "Show" : "Hide"} rule details for ${name}`);
  });

  return [tr, detailTr];
}

function buildMobileCard(row, prevRow) {
  const failed = row.status === "error";
  const pr = prevRow(row.site);
  const name = siteDisplayName(row);
  const isClean = !failed && row.violations_total === 0;
  const hostname = displayHostname(row.url);

  const card = document.createElement("article");
  card.className = "campus-card";
  if (failed) card.classList.add("error-row");

  const cardHeader = document.createElement("header");
  const hBlock = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = name;
  hBlock.appendChild(h3);
  const hSlug = document.createElement("a");
  hSlug.className = "campus-slug campus-link";
  hSlug.href = row.url;
  hSlug.rel = "noopener";
  hSlug.textContent = hostname;
  hSlug.setAttribute("aria-label", `Visit ${name}: ${hostname}`);
  hBlock.appendChild(hSlug);
  cardHeader.appendChild(hBlock);

  const errCount = document.createElement("div");
  errCount.className = "card-error-count";
  errCount.textContent = failed ? "—" : String(row.violations_total);
  cardHeader.appendChild(errCount);
  card.appendChild(cardHeader);

  if (isClean) {
    const badge = document.createElement("span");
    badge.className = "zero-badge";
    badge.textContent = "Meets A/AA";
    card.appendChild(badge);
    card.appendChild(document.createElement("br"));
    card.appendChild(document.createElement("br"));
  } else if (failed) {
    const msg = document.createElement("p");
    msg.className = "stat-caption";
    msg.textContent = `Scan failed: ${row.error || "Unknown error"}`;
    card.appendChild(msg);
  } else {
    const cardBar = makeImpactBar(row.violations_by_impact);
    cardBar.style.margin = "0 0 var(--space-4)";
    card.appendChild(cardBar);
  }

  const meta = document.createElement("dl");
  meta.className = "card-meta";
  const metaDefs = failed
    ? [["Status", "Failed"]]
    : [
        ["Reach issues", String(row.reach_violations_total)],
        ["Elements", row.element_count.toLocaleString()],
        ["Change", null],
      ];
  for (const [k, v] of metaDefs) {
    const wrap = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    if (v === null && k === "Change") {
      dd.appendChild(deltaEl(row.violations_total, pr ? pr.violations_total : null));
    } else {
      dd.textContent = v;
    }
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    meta.appendChild(wrap);
  }
  card.appendChild(meta);

  const cardBtn = document.createElement("button");
  cardBtn.type = "button";
  cardBtn.className = "expand-btn";
  cardBtn.setAttribute("aria-expanded", "false");
  const cardBtnLabel = document.createElement("span");
  cardBtnLabel.textContent = "Show rule details";
  cardBtn.appendChild(cardBtnLabel);
  cardBtn.insertAdjacentHTML("beforeend", ` ${CHEVRON_SVG_14}`);

  const cardDetail = document.createElement("div");
  cardDetail.style.display = "none";
  cardDetail.id = `card-detail-${row.site}`;
  cardBtn.setAttribute("aria-controls", cardDetail.id);

  let built = false;
  cardBtn.addEventListener("click", () => {
    if (!built) {
      cardDetail.appendChild(buildRuleDetail(row));
      built = true;
    }
    const open = cardBtn.getAttribute("aria-expanded") === "true";
    cardBtn.setAttribute("aria-expanded", String(!open));
    cardDetail.style.display = open ? "none" : "block";
    cardBtnLabel.textContent = open ? "Show rule details" : "Hide rule details";
  });

  card.appendChild(cardBtn);
  card.appendChild(cardDetail);
  return card;
}

function groupSummaryText(rows) {
  const required = rows.reduce((s, r) => s + (r.violations_total || 0), 0);
  const reach = rows.reduce((s, r) => s + (r.reach_violations_total || 0), 0);
  const word = rows.length === 1 ? "site" : "sites";
  return `${rows.length} ${word} · ${required} required · ${reach} reach`;
}

function buildGroupHeaderRow(campus, rows, onToggle, isCollapsed) {
  const tr = document.createElement("tr");
  tr.className = "campus-group-header";
  if (isCollapsed) tr.classList.add("collapsed");

  const td = document.createElement("td");
  td.colSpan = TABLE_COL_COUNT;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "group-toggle";
  btn.setAttribute("aria-expanded", String(!isCollapsed));

  const chevron = document.createElement("span");
  chevron.className = "group-chevron";
  chevron.innerHTML = CHEVRON_SVG_14;
  btn.appendChild(chevron);

  const nameSpan = document.createElement("span");
  nameSpan.className = "group-name";
  nameSpan.textContent = CAMPUS_NAMES[campus] || campus;
  btn.appendChild(nameSpan);

  const countSpan = document.createElement("span");
  countSpan.className = "group-count";
  countSpan.textContent = groupSummaryText(rows);
  btn.appendChild(countSpan);

  btn.addEventListener("click", () => onToggle(campus));
  td.appendChild(btn);
  tr.appendChild(td);
  return tr;
}

function buildGroupHeaderCard(campus, rows, onToggle, isCollapsed) {
  const wrap = document.createElement("div");
  wrap.className = "campus-group-card-header";
  if (isCollapsed) wrap.classList.add("collapsed");

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "group-toggle";
  btn.setAttribute("aria-expanded", String(!isCollapsed));

  const chevron = document.createElement("span");
  chevron.className = "group-chevron";
  chevron.innerHTML = CHEVRON_SVG_14;
  btn.appendChild(chevron);

  const h = document.createElement("h3");
  h.textContent = CAMPUS_NAMES[campus] || campus;
  btn.appendChild(h);

  const countSpan = document.createElement("span");
  countSpan.className = "group-count";
  countSpan.textContent = groupSummaryText(rows);
  btn.appendChild(countSpan);

  btn.addEventListener("click", () => onToggle(campus));
  wrap.appendChild(btn);
  return wrap;
}

export function renderTable(ctx) {
  const { currentRows, prevRow } = ctx;
  const tbody = document.getElementById("campus-tbody");
  const cardsContainer = document.getElementById("campus-cards");
  const table = document.getElementById("campus-table");

  let sortKey = "name";
  let sortDir = "asc";
  // Session-only collapse memory — does not persist across reloads so
  // shareable URLs always start with everything visible.
  const collapsedCampuses = new Set();
  // Escape hatch: clicking the Campus header inside a grouped view
  // flips to flat global sort for the next render. Filter changes
  // reset it back to grouped.
  let forceFlat = false;

  function isGroupedView(state) {
    if (forceFlat) return false;
    return state.type === TYPE_SCHOOLS || state.type === TYPE_ALL;
  }

  function render() {
    const state = getFilterState();
    const filtered = applyFilter(currentRows, state);

    tbody.textContent = "";
    cardsContainer.textContent = "";

    if (filtered.length === 0) {
      renderEmptyState();
      return;
    }

    if (isGroupedView(state)) {
      renderGrouped(filtered);
    } else {
      renderFlat(filtered);
    }
  }

  function renderEmptyState() {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    const td = document.createElement("td");
    td.colSpan = TABLE_COL_COUNT;
    td.className = "empty-state";
    td.textContent = "No sites match the current filters. Try widening the selection or hit Reset.";
    tr.appendChild(td);
    tbody.appendChild(tr);

    const card = document.createElement("p");
    card.className = "empty-state";
    card.textContent = "No sites match the current filters.";
    cardsContainer.appendChild(card);
  }

  function renderFlat(rows) {
    const sorted = sortRows(rows, sortKey, sortDir);
    for (const row of sorted) {
      const [tr, detailTr] = buildTableRow(row, prevRow);
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
      cardsContainer.appendChild(buildMobileCard(row, prevRow));
    }
  }

  function renderGrouped(rows) {
    const byCampus = new Map();
    for (const r of rows) {
      const c = r.campus || r.site;
      if (!byCampus.has(c)) byCampus.set(c, []);
      byCampus.get(c).push(r);
    }

    for (const campus of orderedCampuses(byCampus.keys())) {
      const groupRows = byCampus.get(campus);
      const sorted = sortRows(groupRows, sortKey, sortDir);
      const isCollapsed = collapsedCampuses.has(campus);

      tbody.appendChild(buildGroupHeaderRow(campus, sorted, toggleGroup, isCollapsed));
      cardsContainer.appendChild(buildGroupHeaderCard(campus, sorted, toggleGroup, isCollapsed));

      if (isCollapsed) continue;

      for (const row of sorted) {
        const [tr, detailTr] = buildTableRow(row, prevRow);
        tr.classList.add("in-group");
        tbody.appendChild(tr);
        tbody.appendChild(detailTr);
        const card = buildMobileCard(row, prevRow);
        card.classList.add("in-group");
        cardsContainer.appendChild(card);
      }
    }
  }

  function toggleGroup(campus) {
    if (collapsedCampuses.has(campus)) collapsedCampuses.delete(campus);
    else collapsedCampuses.add(campus);
    render();
  }

  function updateSortIndicators() {
    for (const th of table.querySelectorAll("thead th.sortable")) {
      const isActive = th.dataset.sort === sortKey;
      th.setAttribute(
        "aria-sort",
        isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none",
      );
    }
  }

  for (const th of table.querySelectorAll("thead th.sortable")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-btn";
    while (th.firstChild) button.appendChild(th.firstChild);
    th.appendChild(button);
    th.setAttribute("aria-sort", "none");

    button.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (k === "name" && isGroupedView(getFilterState())) forceFlat = true;
      if (sortKey === k) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = k;
        sortDir = k === "name" ? "asc" : "desc";
      }
      updateSortIndicators();
      render();
    });
  }

  render();
  updateSortIndicators();
  subscribe(() => {
    forceFlat = false;
    collapsedCampuses.clear();
    render();
  });
}
