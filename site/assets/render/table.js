import {
  CAMPUS_NAMES,
  categoryLabel,
  IMPACT_KEYS,
  orderedCampuses,
  ruleFriendly,
  TYPE_ALL,
  TYPE_SCHOOLS,
} from "../data/constants.js";
import { applyFilter, getFilterState, subscribe } from "../state/filters.js";
import { deltaEl, displayHostname, siteDisplayName } from "../utils/format.js";

const CHEVRON_SVG_16 =
  '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CHEVRON_SVG_14 =
  '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const TABLE_COL_COUNT = 8;

const IMPACT_CSS_CLASS = {
  critical: "crit",
  serious: "ser",
  moderate: "mod",
  minor: "min",
  unknown: "unk",
};

const IMPACT_LABEL = {
  critical: "Critical",
  serious: "Serious",
  moderate: "Moderate",
  minor: "Minor",
  unknown: "Unknown",
};

function mergeImpact(desktop, mobile) {
  const merged = {};
  for (const k of IMPACT_KEYS) merged[k] = (desktop[k] || 0) + (mobile?.[k] || 0);
  return merged;
}

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

// The category tag is redundant whenever the current filter state
// already narrows the view to a single category: either an explicit
// `cat=` filter, or a top-level View chip that maps 1:1 to one
// category. Only TYPE_ALL and TYPE_SCHOOLS span multiple categories
// (Schools & colleges buckets engineering, law, business, etc.).
function shouldShowCategoryTag(state) {
  if (state.category) return false;
  return state.type === TYPE_ALL || state.type === TYPE_SCHOOLS;
}

function makeCategoryTag(row) {
  if (!row.category) return null;
  const tag = document.createElement("span");
  tag.className = "category-tag";
  tag.textContent = categoryLabel(row.category);
  return tag;
}

// Build the Deque University rule doc URL for a given rule ID. Axe's
// doc URL format is stable: /rules/axe/<major.minor>/<rule-id>. The
// exact axe-core version that produced the scan is recorded on the
// row, so we pin the doc link to the same version the numbers came
// from (a later axe version can rename or merge rules).
function dequeRuleUrl(ruleId, axeVersion) {
  const version = (axeVersion || "").split(".").slice(0, 2).join(".") || "latest";
  return `https://dequeuniversity.com/rules/axe/${version}/${ruleId}`;
}

function appendRuleList(wrap, title, ruleEntries, kind, axeVersion) {
  if (!ruleEntries.length) return;
  const strong = document.createElement("strong");
  strong.textContent = title;
  if (kind === "reach") strong.classList.add("reach-heading");
  wrap.appendChild(strong);

  const ul = document.createElement("ul");
  for (const entry of ruleEntries.slice(0, 10)) {
    const li = document.createElement("li");
    const ruleWrap = document.createElement("div");
    ruleWrap.className = "rule-info";

    // Rule ID links to the Deque University docs for that rule so
    // anyone unfamiliar with a rule can click through to the
    // canonical explanation and fix guidance.
    const codeLink = document.createElement("a");
    codeLink.className = "rule-code-link";
    codeLink.href = dequeRuleUrl(entry.id, axeVersion);
    codeLink.target = "_blank";
    codeLink.rel = "noopener noreferrer";
    codeLink.setAttribute("aria-label", `Learn more about ${entry.id} (opens in new tab)`);
    const code = document.createElement("code");
    code.textContent = entry.id;
    codeLink.appendChild(code);
    ruleWrap.appendChild(codeLink);

    // Viewport pills — show where this rule was flagged.
    // Single-viewport rules show just "Desktop" or "Mobile" (the
    // total count is already visible on the right). Mixed rules
    // show "Desktop N" / "Mobile N" so readers can see the split.
    const pillWrap = document.createElement("span");
    pillWrap.className = "viewport-pills";
    const mixed = entry.desktop_count > 0 && entry.mobile_count > 0;
    if (entry.desktop_count > 0) {
      const dPill = document.createElement("span");
      dPill.className = "pill-desktop";
      dPill.textContent = mixed ? `Desktop ${entry.desktop_count.toLocaleString()}` : "Desktop";
      pillWrap.appendChild(dPill);
    }
    if (entry.mobile_count > 0) {
      const mPill = document.createElement("span");
      mPill.className = "pill-mobile";
      mPill.textContent = mixed ? `Mobile ${entry.mobile_count.toLocaleString()}` : "Mobile";
      pillWrap.appendChild(mPill);
    }
    ruleWrap.appendChild(pillWrap);

    // Impact pill — required rules only. Reach-goal rules (WCAG AAA /
    // WCAG 2.2) are aspirational and axe's severity on them is mostly
    // noise for that audience, so we skip the pill there.
    if (kind === "required" && entry.impact) {
      const pill = document.createElement("span");
      pill.className = `impact-pill ${IMPACT_CSS_CLASS[entry.impact] || "unk"}`;
      pill.textContent = IMPACT_LABEL[entry.impact] || entry.impact;
      ruleWrap.appendChild(pill);
    }

    const desc = document.createElement("span");
    desc.className = "rule-desc";
    desc.textContent = ruleFriendly(entry.id);
    ruleWrap.appendChild(desc);
    li.appendChild(ruleWrap);

    const num = document.createElement("span");
    num.className = "count";
    num.textContent = String(entry.desktop_count + entry.mobile_count);
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

  const requiredRules = row.required_rules || [];
  const reachRules = row.reach_rules || [];

  if (!requiredRules.length && !reachRules.length) {
    const strong = document.createElement("strong");
    strong.textContent = "A clean axe-core run";
    wrap.appendChild(strong);
    const p = document.createElement("p");
    p.textContent = "No required or reach-goal rules flagged. Next step: manual testing.";
    wrap.appendChild(p);
    return wrap;
  }

  appendRuleList(
    wrap,
    "Required (WCAG 2.0/2.1 Level A/AA)",
    requiredRules,
    "required",
    row.axe_version,
  );
  appendRuleList(
    wrap,
    "Reach goals (WCAG 2.1 Level AAA & WCAG 2.2)",
    reachRules,
    "reach",
    row.axe_version,
  );
  return wrap;
}

function buildTableRow(row, prevRow, showCategoryTag) {
  const failed = row.status === "error";
  const pr = prevRow(row.site);
  const name = siteDisplayName(row);
  const isClean = !failed && row.violations_total === 0 && (row.mobile_violations_total || 0) === 0;
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
  const slugRow = document.createElement("div");
  slugRow.className = "campus-slug-row";
  const slugLink = document.createElement("a");
  slugLink.className = "campus-slug campus-link";
  slugLink.href = row.url;
  slugLink.rel = "noopener";
  slugLink.textContent = hostname;
  slugLink.setAttribute("aria-label", `Visit ${name}: ${hostname}`);
  slugRow.appendChild(slugLink);
  if (showCategoryTag) {
    const tag = makeCategoryTag(row);
    if (tag) slugRow.appendChild(tag);
  }
  tdName.appendChild(slugRow);
  tr.appendChild(tdName);

  if (failed) {
    tr.appendChild(naCell());
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

    const mobileTd = document.createElement("td");
    const mobileCount = row.mobile_violations_total || 0;
    const mobileSpan = document.createElement("span");
    mobileSpan.className = mobileCount > 0 ? "mobile-num" : "big-num";
    mobileSpan.textContent = mobileCount;
    mobileTd.appendChild(mobileSpan);
    tr.appendChild(mobileTd);

    const tdReach = document.createElement("td");
    const reachNum = document.createElement("span");
    reachNum.className = "reach-num";
    reachNum.textContent = row.reach_violations_total + (row.mobile_reach_violations_total || 0);
    tdReach.appendChild(reachNum);
    tr.appendChild(tdReach);

    const tdImpact = document.createElement("td");
    tdImpact.appendChild(
      makeImpactBar(mergeImpact(row.violations_by_impact, row.mobile_violations_by_impact)),
    );
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

function buildMobileCard(row, prevRow, showCategoryTag) {
  const failed = row.status === "error";
  const pr = prevRow(row.site);
  const name = siteDisplayName(row);
  const isClean = !failed && row.violations_total === 0 && (row.mobile_violations_total || 0) === 0;
  const hostname = displayHostname(row.url);

  const card = document.createElement("article");
  card.className = "campus-card";
  if (failed) card.classList.add("error-row");

  const cardHeader = document.createElement("header");
  const hBlock = document.createElement("div");
  const h3 = document.createElement("h3");
  h3.textContent = name;
  hBlock.appendChild(h3);
  const slugRow = document.createElement("div");
  slugRow.className = "campus-slug-row";
  const hSlug = document.createElement("a");
  hSlug.className = "campus-slug campus-link";
  hSlug.href = row.url;
  hSlug.rel = "noopener";
  hSlug.textContent = hostname;
  hSlug.setAttribute("aria-label", `Visit ${name}: ${hostname}`);
  slugRow.appendChild(hSlug);
  if (showCategoryTag) {
    const tag = makeCategoryTag(row);
    if (tag) slugRow.appendChild(tag);
  }
  hBlock.appendChild(slugRow);
  cardHeader.appendChild(hBlock);
  card.appendChild(cardHeader);

  if (!failed) {
    const desktopCount = row.violations_total || 0;
    const mobileCount = row.mobile_violations_total || 0;
    if (desktopCount > 0 || mobileCount > 0) {
      const badges = document.createElement("div");
      badges.className = "card-viewport-badges";
      if (desktopCount > 0) {
        const dBadge = document.createElement("span");
        dBadge.className = "pill-desktop";
        dBadge.textContent = `Desktop ${desktopCount}`;
        badges.appendChild(dBadge);
      }
      if (mobileCount > 0) {
        const mBadge = document.createElement("span");
        mBadge.className = "pill-mobile";
        mBadge.textContent = `Mobile ${mobileCount}`;
        badges.appendChild(mBadge);
      }
      card.appendChild(badges);
    }
  }

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
    const cardBar = makeImpactBar(
      mergeImpact(row.violations_by_impact, row.mobile_violations_by_impact),
    );
    cardBar.style.margin = "0 0 var(--space-4)";
    card.appendChild(cardBar);
  }

  const meta = document.createElement("dl");
  meta.className = "card-meta";
  const metaDefs = failed
    ? [["Status", "Failed"]]
    : [
        [
          "Reach issues",
          String(row.reach_violations_total + (row.mobile_reach_violations_total || 0)),
        ],
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
  const okRows = rows.filter((r) => r.status === "ok");
  const required = okRows.reduce((s, r) => s + (r.violations_total || 0), 0);
  const reach = okRows.reduce((s, r) => s + (r.reach_violations_total || 0), 0);
  const word = rows.length === 1 ? "site" : "sites";
  const failed = rows.length - okRows.length;
  const failedSuffix = failed > 0 ? ` · ${failed} failed` : "";
  return `${rows.length} ${word} · ${required} required · ${reach} reach${failedSuffix}`;
}

// Anchor link that sits alongside the collapse button in a group
// header. Clicking it fires the section-link handler in app.js, which
// updates the hash and smooth-scrolls to the group. It lives outside
// the collapse <button> so we aren't nesting interactive elements.
function buildGroupAnchor(campus) {
  const anchor = document.createElement("a");
  anchor.className = "group-anchor";
  anchor.href = `#section=group-${campus}`;
  anchor.dataset.sectionLink = `group-${campus}`;
  anchor.setAttribute("aria-label", `Link to ${CAMPUS_NAMES[campus] || campus} section`);
  anchor.innerHTML = "§";
  return anchor;
}

function buildGroupHeaderRow(campus, rows, onToggle, isCollapsed) {
  const tr = document.createElement("tr");
  tr.className = "campus-group-header";
  tr.id = `group-${campus}-row`;
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
  td.appendChild(buildGroupAnchor(campus));
  tr.appendChild(td);
  return tr;
}

function buildGroupHeaderCard(campus, rows, onToggle, isCollapsed) {
  const wrap = document.createElement("div");
  wrap.className = "campus-group-card-header";
  wrap.id = `group-${campus}-card`;
  if (isCollapsed) wrap.classList.add("collapsed");

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
  wrap.appendChild(btn);
  wrap.appendChild(buildGroupAnchor(campus));
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
    const showTag = shouldShowCategoryTag(state);

    tbody.textContent = "";
    cardsContainer.textContent = "";

    if (filtered.length === 0) {
      renderEmptyState();
      return;
    }

    if (isGroupedView(state)) {
      renderGrouped(filtered, showTag);
    } else {
      renderFlat(filtered, showTag);
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

  function renderFlat(rows, showTag) {
    const sorted = sortRows(rows, sortKey, sortDir);
    for (const row of sorted) {
      const [tr, detailTr] = buildTableRow(row, prevRow, showTag);
      tbody.appendChild(tr);
      tbody.appendChild(detailTr);
      cardsContainer.appendChild(buildMobileCard(row, prevRow, showTag));
    }
  }

  function renderGrouped(rows, showTag) {
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
        const [tr, detailTr] = buildTableRow(row, prevRow, showTag);
        tr.classList.add("in-group");
        tbody.appendChild(tr);
        tbody.appendChild(detailTr);
        const card = buildMobileCard(row, prevRow, showTag);
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
