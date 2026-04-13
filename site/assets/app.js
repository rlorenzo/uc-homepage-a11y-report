(async () => {
  const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 1. Load data ----------
  let history;
  try {
    const resp = await fetch("data/history.json");
    history = await resp.json();
  } catch {
    document.getElementById("byline-date").textContent =
      "Could not load data/history.json. Run a scan first.";
    return;
  }

  if (!history.length) {
    document.getElementById("byline-date").textContent =
      "No scan data yet. Run a scan to populate the report.";
    return;
  }

  // ---------- 2. Shared data derivations ----------
  const months = [...new Set(history.map((r) => r.month))].sort();
  const latest = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;

  const currentRows = history.filter((r) => r.month === latest);
  const prevRows = prev ? history.filter((r) => r.month === prev) : [];
  const okRows = currentRows.filter((r) => r.status === "ok");
  const prevOkRows = prevRows.filter((r) => r.status === "ok");

  const prevRow = (slug) => prevRows.find((r) => r.site === slug);

  const CAMPUS_NAMES = {
    berkeley: "UC Berkeley",
    ucdavis: "UC Davis",
    uci: "UC Irvine",
    ucla: "UCLA",
    ucmerced: "UC Merced",
    ucop: "UC Office of the President",
    ucr: "UC Riverside",
    ucsb: "UC Santa Barbara",
    ucsc: "UC Santa Cruz",
    ucsd: "UC San Diego",
    ucsf: "UC San Francisco",
  };
  const campusName = (slug) => CAMPUS_NAMES[slug] || slug;

  // Plain-language explainers for common axe rules.
  const RULE_DESCRIPTIONS = {
    "color-contrast": "Text is hard to read against its background",
    "link-name": "Link has no accessible name",
    "button-name": "Button has no accessible name",
    "image-alt": "Image is missing alt text",
    "input-button-name": "Button input has no accessible name",
    "target-size": "Tap target is smaller than 24×24 pixels",
    "aria-prohibited-attr": "An ARIA attribute is used where it's not allowed",
    "aria-allowed-attr": "An ARIA attribute doesn't belong on this element",
    "aria-required-attr": "A required ARIA attribute is missing",
    "aria-hidden-focus": "Focusable element is hidden from assistive tech",
    label: "Form control has no label",
    list: "List markup is structurally broken",
    listitem: "List item is not inside a list",
    "select-name": "Select control has no accessible name",
    "heading-order": "Heading levels skip (e.g. h2 → h4)",
    "landmark-one-main": "Page is missing a <main> landmark",
    region: "Content lives outside any landmark",
    "document-title": "Page has no <title>",
    "html-has-lang": "<html> element has no lang attribute",
    "duplicate-id": "Element id is used more than once",
    "duplicate-id-aria": "id referenced by ARIA is duplicated",
    "meta-viewport": "Viewport meta tag prevents zooming",
  };

  const ruleFriendly = (rule) =>
    RULE_DESCRIPTIONS[rule] || "Automated accessibility rule violation";

  // ---------- 3. Formatting helpers ----------
  function deltaEl(current, previous) {
    if (current === null || current === undefined || previous === null || previous === undefined) {
      const s = document.createElement("span");
      s.className = "delta neutral";
      s.textContent = "n/a";
      return s;
    }
    const diff = current - previous;
    const s = document.createElement("span");
    if (diff === 0) {
      s.className = "delta neutral";
      s.textContent = "0";
    } else if (diff < 0) {
      s.className = "delta improved";
      s.textContent = `▼ ${Math.abs(diff)}`;
    } else {
      s.className = "delta regressed";
      s.textContent = `▲ ${diff}`;
    }
    return s;
  }

  function countUp(el, target, suffix = "") {
    if (REDUCED_MOTION || typeof target !== "number" || !isFinite(target)) {
      el.textContent = target + suffix;
      return;
    }
    const duration = 900;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      const val = Math.round(from + (target - from) * eased);
      el.textContent = val + suffix;
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- 4. Aggregations ----------
  const totalErrors = okRows.length ? okRows.reduce((s, r) => s + r.violations_total, 0) : null;
  const prevTotalErrors = prevOkRows.length
    ? prevOkRows.reduce((s, r) => s + r.violations_total, 0)
    : null;

  const cleanRows = okRows.filter((r) => r.violations_total === 0);

  // Aggregate impact mix across every successfully scanned campus.
  const impactTotals = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  for (const row of okRows) {
    const by = row.violations_by_impact || {};
    for (const k of Object.keys(impactTotals)) {
      impactTotals[k] += by[k] || 0;
    }
  }
  const topImpactKey = Object.entries(impactTotals).sort((a, b) => b[1] - a[1])[0];

  // Rule aggregation across current month — required bucket.
  const currentRuleTotals = {};
  for (const row of okRows) {
    for (const [rule, count] of Object.entries(row.violations_by_rule)) {
      currentRuleTotals[rule] = (currentRuleTotals[rule] || 0) + count;
    }
  }
  const prevRuleTotals = {};
  for (const row of prevOkRows) {
    for (const [rule, count] of Object.entries(row.violations_by_rule)) {
      prevRuleTotals[rule] = (prevRuleTotals[rule] || 0) + count;
    }
  }
  const topRuleEntry = Object.entries(currentRuleTotals).sort((a, b) => b[1] - a[1])[0];

  // Rule aggregation across current month — reach bucket.
  const currentReachRuleTotals = {};
  for (const row of okRows) {
    for (const [rule, count] of Object.entries(row.reach_violations_by_rule)) {
      currentReachRuleTotals[rule] = (currentReachRuleTotals[rule] || 0) + count;
    }
  }
  const topReachRuleEntry = Object.entries(currentReachRuleTotals).sort((a, b) => b[1] - a[1])[0];

  // Trend direction across the whole system (not any one campus).
  let systemTrend = null;
  if (prev && totalErrors !== null && prevTotalErrors !== null) {
    systemTrend = {
      from: prevTotalErrors,
      to: totalErrors,
      delta: totalErrors - prevTotalErrors,
    };
  }

  // ---------- 5. Masthead / hero ----------
  const sampleRow = currentRows[0];
  const engineVersion = sampleRow ? sampleRow.axe_version : "unknown";

  function prettyMonth(monthStr) {
    const [y, m] = monthStr.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  document.getElementById("masthead-date").textContent = prettyMonth(latest);
  document.getElementById("byline-date").textContent = prettyMonth(latest);
  document.getElementById("byline-engine").textContent = `axe-core ${engineVersion}`;
  document.getElementById("byline-sites").textContent =
    `${okRows.length} of ${currentRows.length} scanned`;

  document.getElementById("hero-site-count").textContent = currentRows.length;
  const heroNumEl = document.getElementById("hero-number");
  const heroWordEl = document.getElementById("hero-number-word");
  if (totalErrors === null) {
    heroNumEl.textContent = "No data";
    heroWordEl.textContent = "yet";
  } else if (totalErrors === 0) {
    heroNumEl.textContent = "0";
    heroWordEl.textContent = "axe issues found —";
    document.getElementById("hero-coda").textContent =
      "and plenty of room to keep pushing deeper with manual testing.";
  } else {
    countUp(heroNumEl, totalErrors);
    heroWordEl.textContent = totalErrors === 1 ? "opportunity" : "opportunities";
  }

  // ---------- 6. Stat grid ----------
  const statGrid = document.getElementById("stat-grid");

  function makeStatCard({
    label,
    badge,
    value,
    unit,
    caption,
    delta,
    klass,
    big = false,
    small = false,
  }) {
    const card = document.createElement("div");
    card.className = `stat ${klass || ""} reveal reveal-${(statGrid.children.length % 7) + 1}`;
    card.setAttribute("role", "listitem");
    if (big) card.classList.add("stat-big");

    const labelEl = document.createElement("div");
    labelEl.className = "stat-label";
    if (badge) {
      const b = document.createElement("span");
      b.className = "num";
      b.textContent = badge;
      labelEl.appendChild(b);
    }
    labelEl.appendChild(document.createTextNode(label));
    card.appendChild(labelEl);

    // Wrap the animated number in its own inner span so countUp's
    // textContent assignments target only the number, leaving the
    // sibling unit span intact. Without this wrapper, the first
    // countUp frame wipes the unit.
    const valueEl = document.createElement("span");
    valueEl.className = `stat-value${small ? " small" : ""}`;
    const numNode = document.createElement("span");
    numNode.className = "stat-num";
    valueEl.appendChild(numNode);
    if (typeof value === "number") {
      numNode.textContent = "0";
      requestAnimationFrame(() => countUp(numNode, value));
    } else {
      numNode.textContent = value;
    }
    card.appendChild(valueEl);

    if (unit) {
      const u = document.createElement("span");
      u.className = "stat-unit";
      u.textContent = unit;
      valueEl.appendChild(u);
    }

    if (caption) {
      const cap = document.createElement("p");
      cap.className = "stat-caption";
      if (typeof caption === "string") cap.textContent = caption;
      else cap.appendChild(caption);
      card.appendChild(cap);
    }

    if (delta) {
      const d = document.createElement("div");
      d.className = "stat-delta";
      d.appendChild(document.createTextNode("vs. last month "));
      d.appendChild(delta);
      card.appendChild(d);
    }

    return card;
  }

  // Card 1: Total issues (big)
  const totalCaption = document.createElement("span");
  if (totalErrors === null) {
    totalCaption.textContent = "No successful scans this month.";
  } else if (totalErrors === 0) {
    totalCaption.textContent =
      "No axe-core violations across any of the UC homepages this month. A strong start — keep going with manual testing.";
  } else {
    totalCaption.appendChild(document.createTextNode("Flagged by axe-core across "));
    const strong = document.createElement("strong");
    strong.textContent = `${okRows.length} homepages`;
    totalCaption.appendChild(strong);
    totalCaption.appendChild(
      document.createTextNode(
        ". Each one is an opportunity to make a UC site easier to use for someone.",
      ),
    );
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "01",
      label: "Issues flagged",
      value: totalErrors !== null ? totalErrors : "n/a",
      caption: totalCaption,
      delta: prev ? deltaEl(totalErrors, prevTotalErrors) : null,
      klass: "stat-big",
      big: true,
    }),
  );

  // Card 2: Clean scans
  const cleanCaption = document.createElement("span");
  if (cleanRows.length) {
    cleanCaption.appendChild(
      document.createTextNode("A clean axe-core scan is a great floor — not the ceiling. "),
    );
    cleanCaption.appendChild(document.createTextNode("Automated tools still miss "));
    const strong = document.createElement("strong");
    strong.textContent = "60 to 70 percent";
    cleanCaption.appendChild(strong);
    cleanCaption.appendChild(document.createTextNode(" of real barriers."));
  } else {
    cleanCaption.textContent =
      "Every UC homepage had at least one flag this month. The top rule below is a good place to start.";
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "02",
      label: "Clean scans",
      value: cleanRows.length,
      unit: ` of ${okRows.length}`,
      caption: cleanCaption,
      klass: "stat-half",
    }),
  );

  // Card 3: Month over month
  let momValue = "—";
  let momCaption =
    "This is the first scan on record. Once there is a second month, the trend lands here.";
  if (systemTrend) {
    if (systemTrend.delta < 0) {
      momValue = `▼ ${Math.abs(systemTrend.delta)}`;
      momCaption = `Fewer issues than ${prettyMonth(prev)} across the system. Collective progress.`;
    } else if (systemTrend.delta > 0) {
      momValue = `▲ ${systemTrend.delta}`;
      momCaption =
        "More issues than " +
        prettyMonth(prev) +
        ". New content often adds new opportunities to improve.";
    } else {
      momValue = "0";
      momCaption = `The same total as ${prettyMonth(prev)}. Steady.`;
    }
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "03",
      label: "Month over month",
      value: momValue,
      caption: momCaption,
      klass: "stat-half",
      small: true,
    }),
  );

  // Card 4: Top rule flagged — required bucket first, reach as fallback
  const ruleCaption = document.createElement("span");
  const displayRule = topRuleEntry || topReachRuleEntry;
  const displayRuleIsReach = !topRuleEntry && Boolean(topReachRuleEntry);
  if (displayRule) {
    const strong = document.createElement("strong");
    strong.textContent = ruleFriendly(displayRule[0]);
    ruleCaption.appendChild(strong);
    if (displayRuleIsReach) {
      ruleCaption.appendChild(
        document.createTextNode(
          ". No required-level rules flagged — this is the top reach-goal rule.",
        ),
      );
    } else {
      ruleCaption.appendChild(
        document.createTextNode(". Fixing this pattern first tends to have the widest benefit."),
      );
    }
  } else {
    ruleCaption.textContent = "No rules were flagged this month, required or reach.";
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "04",
      label: displayRuleIsReach ? "Top rule (reach)" : "Top rule flagged",
      value: displayRule ? displayRule[0] : "—",
      unit: displayRule ? ` · ${displayRule[1]} instances` : "",
      caption: ruleCaption,
      klass: "stat-third",
      small: true,
    }),
  );

  // Card 5: Issue density as a fraction
  const avgDensity = okRows.length
    ? okRows.reduce((s, r) => s + r.error_density, 0) / okRows.length
    : null;
  let densityValue = "n/a";
  let densityCaption = "No data yet.";
  if (avgDensity !== null) {
    if (avgDensity === 0) {
      densityValue = "0";
      densityCaption = "Zero axe-core flags per element across the system this month.";
    } else {
      const oneIn = Math.round(1 / avgDensity);
      densityValue = `1 in ${oneIn.toLocaleString()}`;
      densityCaption =
        "On average, axe-core flags one issue for every " +
        oneIn.toLocaleString() +
        " DOM elements it inspects. Raw density: " +
        avgDensity.toFixed(4) +
        ".";
    }
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "05",
      label: "Issue density",
      value: densityValue,
      caption: densityCaption,
      klass: "stat-third",
      small: true,
    }),
  );

  // Card 6: Where the impact sits (severity mix)
  const totalImpact = Object.values(impactTotals).reduce((a, b) => a + b, 0);
  const mixCaption = document.createElement("span");
  if (totalImpact && topImpactKey && topImpactKey[1] > 0) {
    const pct = Math.round((topImpactKey[1] / totalImpact) * 100);
    mixCaption.appendChild(document.createTextNode("Most flags this month are "));
    const strong = document.createElement("strong");
    strong.textContent = topImpactKey[0];
    mixCaption.appendChild(strong);
    mixCaption.appendChild(
      document.createTextNode(
        " (" +
          pct +
          " percent). Severity is what axe-core reports — real user impact can be different.",
      ),
    );
  } else {
    mixCaption.textContent = "No issues flagged this month.";
  }
  statGrid.appendChild(
    makeStatCard({
      badge: "06",
      label: "Severity mix",
      value: totalImpact ? (topImpactKey ? topImpactKey[0] : "—") : "—",
      unit: totalImpact && topImpactKey ? ` · ${topImpactKey[1]}` : "",
      caption: mixCaption,
      klass: "stat-third",
      small: true,
    }),
  );

  // ---------- 7. Why it matters ----------
  const hall = document.getElementById("hall");

  function makeHallCard({ label, headline, detail, accent = false }) {
    const card = document.createElement("div");
    card.className =
      "hall-card" +
      (accent ? " champion" : "") +
      " reveal reveal-" +
      ((hall.children.length % 7) + 1);
    const l = document.createElement("p");
    l.className = "label";
    l.textContent = label;
    const h = document.createElement("p");
    h.className = "headline";
    h.textContent = headline;
    const d = document.createElement("p");
    d.className = "detail";
    if (typeof detail === "string") d.textContent = detail;
    else d.appendChild(detail);
    card.appendChild(l);
    card.appendChild(h);
    card.appendChild(d);
    return card;
  }

  // Human-impact framing for common axe rules.
  const RULE_IMPACT = {
    "color-contrast":
      "Low-contrast text is a barrier for anyone with low vision, color blindness, or age-related vision loss — roughly 1 in 12 people.",
    "link-name":
      'A link without an accessible name is announced as "link, link, link" to a screen reader. Fixing it gives every assistive-tech user a clear sense of where they are going.',
    "button-name":
      "A button with no accessible name is invisible to screen reader users. It also confuses voice-control software that tries to match the button label.",
    "image-alt":
      "Missing alt text means a screen reader user hears nothing — or worse, the file name. Good alt text lets everyone in on what the image conveys.",
    "target-size":
      "Small tap targets are a barrier for users with tremors, larger fingers, or motor conditions. Bigger targets help everyone, especially on mobile.",
    "aria-prohibited-attr":
      "When ARIA is applied where it does not belong, screen readers can announce confusing or misleading information. Removing the extra ARIA often clears things up.",
    "aria-allowed-attr":
      "ARIA attributes are powerful, but only on the right elements. When used incorrectly, they can silence otherwise-accessible controls.",
    label:
      "A form control without a label is unusable for anyone relying on a screen reader, and it is hard to fill out for anyone else too.",
    list: 'Broken list markup means screen readers do not announce "list of 5 items", so users lose an important cue about structure.',
    "select-name":
      "A select element with no label leaves screen reader users guessing what they are being asked to choose.",
    "heading-order":
      "Skipped heading levels break the document outline that many assistive-tech users rely on to navigate.",
    region:
      "Content that lives outside any landmark is harder for assistive-tech users to find, because landmark shortcuts skip over it.",
  };

  const ruleImpact = (rule) =>
    RULE_IMPACT[rule] ||
    "Accessibility rules exist because real people rely on the things they check. Every fix widens who your site works for.";

  // Card 1: The top issue + who it affects.
  // Prefer required-level rules (legal baseline). If none, surface the top
  // reach-goal rule and frame it as aspirational, not failing.
  if (topRuleEntry) {
    const headline = ruleFriendly(topRuleEntry[0]);
    hall.appendChild(
      makeHallCard({
        accent: true,
        label: "Where the impact is",
        headline,
        detail: `${ruleImpact(topRuleEntry[0])} This month axe-core flagged it ${topRuleEntry[1]}${topRuleEntry[1] === 1 ? " time" : " times"} across UC homepages.`,
      }),
    );
  } else if (topReachRuleEntry) {
    const headline = ruleFriendly(topReachRuleEntry[0]);
    hall.appendChild(
      makeHallCard({
        accent: true,
        label: "Reach-goal opportunity",
        headline,
        detail: `Zero required-level issues across the system this month — a strong baseline. The top reach-goal rule is ${headline.toLowerCase()}, flagged ${topReachRuleEntry[1]} times. ${ruleImpact(topReachRuleEntry[0])}`,
      }),
    );
  } else {
    hall.appendChild(
      makeHallCard({
        accent: true,
        label: "Where the impact is",
        headline: "No automated flags this month",
        detail:
          "Nothing flagged in the required or reach-goal buckets. The next step is manual review: keyboard navigation, screen reader testing, and real users.",
      }),
    );
  }

  // Card 2: The system-wide trend (no campus singled out)
  if (systemTrend) {
    if (systemTrend.delta < 0) {
      hall.appendChild(
        makeHallCard({
          label: "System-wide trend",
          headline: `${Math.abs(systemTrend.delta)} fewer issues than last month`,
          detail:
            "Across every UC homepage combined, the total went from " +
            systemTrend.from +
            " to " +
            systemTrend.to +
            ". Small, consistent improvements are how we move the needle.",
        }),
      );
    } else if (systemTrend.delta > 0) {
      hall.appendChild(
        makeHallCard({
          label: "System-wide trend",
          headline: `${systemTrend.delta} more issues than last month`,
          detail:
            "Totals went from " +
            systemTrend.from +
            " to " +
            systemTrend.to +
            ". New content, new components, and routine updates can all surface new opportunities. The rule list below shows where to look first.",
        }),
      );
    } else {
      hall.appendChild(
        makeHallCard({
          label: "System-wide trend",
          headline: "Holding steady",
          detail:
            "The same system-wide total as " +
            prettyMonth(prev) +
            ". Consistency is not nothing — and there is always room to widen who the web works for.",
        }),
      );
    }
  } else {
    hall.appendChild(
      makeHallCard({
        label: "Baseline month",
        headline: "First recorded scan",
        detail:
          "Once a second month of data is in, the system-wide trend shows up here. Until then, treat this run as a baseline.",
      }),
    );
  }

  // ---------- 8. Campus table + cards ----------
  const tbody = document.getElementById("campus-tbody");
  const cardsContainer = document.getElementById("campus-cards");

  function makeImpactBar(impact, _total) {
    const bar = document.createElement("span");
    bar.className = "impact-bar";
    bar.setAttribute("role", "img");

    const segs = [
      ["crit", "critical", impact.critical || 0],
      ["ser", "serious", impact.serious || 0],
      ["mod", "moderate", impact.moderate || 0],
      ["min", "minor", impact.minor || 0],
      ["unk", "unknown", impact.unknown || 0],
    ];

    const sum = segs.reduce((a, [, , c]) => a + c, 0);
    if (sum === 0) {
      bar.setAttribute("aria-label", "No violations");
      return bar;
    }

    const labelParts = [];
    for (const [klass, name, count] of segs) {
      if (count === 0) continue;
      const seg = document.createElement("span");
      seg.className = klass;
      seg.style.flex = String(count);
      seg.title = `${count} ${name}`;
      bar.appendChild(seg);
      labelParts.push(`${count} ${name}`);
    }
    bar.setAttribute("aria-label", `Impact breakdown: ${labelParts.join(", ")}`);
    return bar;
  }

  function sortRows(rows, key = "violations_total", dir = "desc") {
    return [...rows].sort((a, b) => {
      // Failed scans always last
      const aFailed = a.status === "error" ? 1 : 0;
      const bFailed = b.status === "error" ? 1 : 0;
      if (aFailed !== bFailed) return aFailed - bFailed;

      let av, bv;
      if (key === "name") {
        av = campusName(a.site).toLowerCase();
        bv = campusName(b.site).toLowerCase();
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      av = a[key] ?? 0;
      bv = b[key] ?? 0;
      return dir === "asc" ? av - bv : bv - av;
    });
  }

  let sortKey = "name";
  let sortDir = "asc";

  function renderRows() {
    const sorted = sortRows(currentRows, sortKey, sortDir);
    tbody.textContent = "";
    cardsContainer.textContent = "";

    for (const row of sorted) {
      const failed = row.status === "error";
      const pr = prevRow(row.site);
      const name = campusName(row.site);
      const isClean = !failed && row.violations_total === 0;
      const hostname = row.url.replace(/^https?:\/\//, "").replace(/\/$/, "");

      /* ----- Table row (desktop) ----- */
      const tr = document.createElement("tr");
      tr.className = "campus-row";
      if (failed) tr.classList.add("error-row");

      // Name cell
      const tdName = document.createElement("td");
      const nameBlock = document.createElement("div");
      nameBlock.className = "campus-name";
      nameBlock.appendChild(document.createTextNode(name));
      if (isClean) {
        const badge = document.createElement("span");
        badge.className = "zero-badge";
        badge.appendChild(document.createTextNode("Meets A/AA"));
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
      slugLink.setAttribute("aria-label", `Visit ${name} homepage: ${hostname}`);
      tdName.appendChild(slugLink);
      tr.appendChild(tdName);

      // Required count (headline)
      const tdErr = document.createElement("td");
      if (failed) {
        const na = document.createElement("span");
        na.className = "na";
        na.textContent = "n/a";
        tdErr.appendChild(na);
      } else {
        const num = document.createElement("span");
        num.className = "big-num";
        num.textContent = row.violations_total;
        tdErr.appendChild(num);
      }
      tr.appendChild(tdErr);

      // Reach count (aspirational)
      const tdReach = document.createElement("td");
      if (failed) {
        const na = document.createElement("span");
        na.className = "na";
        na.textContent = "n/a";
        tdReach.appendChild(na);
      } else {
        const num = document.createElement("span");
        num.className = "reach-num";
        num.textContent = row.reach_violations_total;
        tdReach.appendChild(num);
      }
      tr.appendChild(tdReach);

      // Impact mix (required only)
      const tdImpact = document.createElement("td");
      if (failed) {
        const na = document.createElement("span");
        na.className = "na";
        na.textContent = "n/a";
        tdImpact.appendChild(na);
      } else {
        tdImpact.appendChild(makeImpactBar(row.violations_by_impact, row.violations_total));
      }
      tr.appendChild(tdImpact);

      // Elements
      const tdElem = document.createElement("td");
      if (failed) {
        const na = document.createElement("span");
        na.className = "na";
        na.textContent = "n/a";
        tdElem.appendChild(na);
      } else {
        tdElem.textContent = row.element_count.toLocaleString();
      }
      tr.appendChild(tdElem);

      // Change
      const tdChange = document.createElement("td");
      if (failed) {
        const na = document.createElement("span");
        na.className = "na";
        na.textContent = "n/a";
        tdChange.appendChild(na);
      } else {
        tdChange.appendChild(deltaEl(row.violations_total, pr ? pr.violations_total : null));
      }
      tr.appendChild(tdChange);

      // Expand button
      const tdBtn = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "expand-btn";
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("aria-label", `Show rule details for ${name}`);
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      tdBtn.appendChild(btn);
      tr.appendChild(tdBtn);

      // Detail row
      const detailTr = document.createElement("tr");
      detailTr.className = "detail-row";
      detailTr.style.display = "none";
      const detailTd = document.createElement("td");
      detailTd.colSpan = 7;
      detailTd.appendChild(buildRuleDetail(row));
      detailTr.appendChild(detailTd);

      const detailId = `detail-${row.site}`;
      detailTr.id = detailId;
      btn.setAttribute("aria-controls", detailId);

      btn.addEventListener("click", () => {
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        detailTr.style.display = open ? "none" : "table-row";
        btn.setAttribute("aria-label", `${open ? "Show" : "Hide"} rule details for ${name}`);
      });

      tbody.appendChild(tr);
      tbody.appendChild(detailTr);

      /* ----- Mobile card ----- */
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
      hSlug.setAttribute("aria-label", `Visit ${name} homepage: ${hostname}`);
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
        const cardBar = makeImpactBar(row.violations_by_impact || {}, row.violations_total);
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
      const chevronSvg =
        '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      const cardBtnLabel = document.createElement("span");
      cardBtnLabel.textContent = "Show rule details";
      cardBtn.appendChild(cardBtnLabel);
      cardBtn.insertAdjacentHTML("beforeend", ` ${chevronSvg}`);
      const cardDetail = buildRuleDetail(row);
      cardDetail.style.display = "none";
      cardDetail.id = `card-detail-${row.site}`;
      cardBtn.setAttribute("aria-controls", cardDetail.id);

      cardBtn.addEventListener("click", () => {
        const open = cardBtn.getAttribute("aria-expanded") === "true";
        cardBtn.setAttribute("aria-expanded", String(!open));
        cardDetail.style.display = open ? "none" : "block";
        cardBtnLabel.textContent = open ? "Show rule details" : "Hide rule details";
      });

      card.appendChild(cardBtn);
      card.appendChild(cardDetail);
      cardsContainer.appendChild(card);
    }
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

    const requiredRules = Object.entries(row.violations_by_rule).sort((a, b) => b[1] - a[1]);
    const reachRules = Object.entries(row.reach_violations_by_rule).sort((a, b) => b[1] - a[1]);

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

  // Sortable headers — wrap the label text in a real <button> inside
  // the <th> so the cell keeps its native "columnheader" semantics, and
  // drive aria-sort on the <th> itself so assistive tech announces the
  // current sort state.
  function updateSortIndicators() {
    document.querySelectorAll("#campus-table thead th.sortable").forEach((th) => {
      const isActive = th.dataset.sort === sortKey;
      th.setAttribute(
        "aria-sort",
        isActive ? (sortDir === "asc" ? "ascending" : "descending") : "none",
      );
    });
  }

  document.querySelectorAll("#campus-table thead th.sortable").forEach((th) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-btn";
    while (th.firstChild) {
      button.appendChild(th.firstChild);
    }
    th.appendChild(button);
    th.setAttribute("aria-sort", "none");

    button.addEventListener("click", () => {
      const k = th.dataset.sort;
      if (sortKey === k) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = k;
        sortDir = k === "name" ? "asc" : "desc";
      }
      updateSortIndicators();
      renderRows();
    });
  });

  renderRows();
  updateSortIndicators();

  // ---------- 9. Chart.js theming ----------
  const CHART_COLORS = [
    "#005581",
    "#00778B",
    "#FF6E1B",
    "#E44C9A",
    "#002033",
    "#4C4C4C",
    "#7A0C0C",
    "#1F4426",
    "#4D3D0A",
    "#6B2308",
    "#1295D8",
  ];

  if (typeof Chart !== "undefined") {
    Chart.defaults.font.family = '"Source Sans 3", "Helvetica Neue", Arial, sans-serif';
    Chart.defaults.font.size = 13;
    Chart.defaults.color = "#3A4A5C";
    Chart.defaults.borderColor = "#E5DFD2";
  }

  function showChartFallback(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const p = document.createElement("p");
    p.className = "chart-fallback";
    p.textContent = message;
    wrap.replaceChild(p, canvas);
    // Class hook for CSS to collapse the wrapper's fixed height to its
    // natural size when a chart is replaced with fallback text.
    wrap.classList.add("chart-wrap--fallback");
  }

  // ---------- 10. Trend chart ----------
  const slugs = [...new Set(history.map((r) => r.site))].sort();
  const trendDatasets = slugs.map((slug, i) => ({
    label: campusName(slug),
    data: months.map((m) => {
      const r = history.find((h) => h.month === m && h.site === slug);
      return r && r.status === "ok" ? r.violations_total : null;
    }),
    borderColor: CHART_COLORS[i % CHART_COLORS.length],
    backgroundColor: `${CHART_COLORS[i % CHART_COLORS.length]}22`,
    borderWidth: 2,
    tension: 0.35,
    spanGaps: true,
    pointRadius: 3,
    pointHoverRadius: 6,
  }));

  if (typeof Chart === "undefined") {
    showChartFallback("trend-chart", "Chart could not be rendered (Chart.js failed to load).");
  } else {
    new Chart(document.getElementById("trend-chart"), {
      type: "line",
      data: { labels: months.map(prettyMonth), datasets: trendDatasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: REDUCED_MOTION ? false : { duration: 700 },
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 14, boxWidth: 14, boxHeight: 14 },
          },
          tooltip: {
            backgroundColor: "#002033",
            titleColor: "#FAF7F0",
            bodyColor: "#FAF7F0",
            padding: 12,
            cornerRadius: 6,
            titleFont: { family: '"Source Serif 4", Georgia, serif', size: 14, weight: "500" },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Errors", font: { weight: "600" } },
            grid: { color: "#EFE9D9" },
          },
          x: {
            grid: { display: false },
            title: { display: true, text: "Month", font: { weight: "600" } },
          },
        },
      },
    });
  }

  // ---------- 11. Rule chart ----------
  const top10Rules = Object.entries(currentRuleTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const ruleLabels = top10Rules.map((e) => e[0]);
  const ruleCurrentData = top10Rules.map((e) => e[1]);
  const rulePrevData = ruleLabels.map((r) => prevRuleTotals[r] || 0);

  const ruleDatasets = [
    {
      label: `Current (${prettyMonth(latest)})`,
      data: ruleCurrentData,
      backgroundColor: "#005581",
      borderRadius: 4,
    },
  ];
  if (prev && prevOkRows.length) {
    ruleDatasets.unshift({
      label: `Previous (${prettyMonth(prev)})`,
      data: rulePrevData,
      backgroundColor: "#00778B77",
      borderRadius: 4,
    });
  }

  if (typeof Chart === "undefined") {
    showChartFallback("rule-chart", "Chart could not be rendered (Chart.js failed to load).");
  } else if (!ruleLabels.length) {
    showChartFallback(
      "rule-chart",
      "No rule violations to chart — every campus is clean this month.",
    );
  } else {
    new Chart(document.getElementById("rule-chart"), {
      type: "bar",
      data: { labels: ruleLabels, datasets: ruleDatasets },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        animation: REDUCED_MOTION ? false : { duration: 700 },
        plugins: {
          legend: {
            position: "bottom",
            labels: { padding: 14, boxWidth: 14, boxHeight: 14 },
          },
          tooltip: {
            backgroundColor: "#002033",
            titleColor: "#FAF7F0",
            bodyColor: "#FAF7F0",
            padding: 12,
            cornerRadius: 6,
            titleFont: { family: '"Source Serif 4", Georgia, serif', size: 14, weight: "500" },
            callbacks: {
              afterLabel: (ctx) => ruleFriendly(ctx.label),
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            title: { display: true, text: "Total instances", font: { weight: "600" } },
            grid: { color: "#EFE9D9" },
          },
          y: { grid: { display: false } },
        },
      },
    });
  }
})();
