import { ruleFriendly } from "../data/constants.js";
import { computeAggregates } from "../data/derive.js";
import { applyFilter, describeFilter, getFilterState, subscribe } from "../state/filters.js";
import { countUp, deltaEl, prettyMonth } from "../utils/format.js";

function makeStatCard(
  statGrid,
  { label, badge, value, unit, caption, delta, klass, animate = true },
) {
  const card = document.createElement("div");
  const reveal = animate ? ` reveal reveal-${(statGrid.children.length % 7) + 1}` : "";
  card.className = `stat ${klass || ""}${reveal}`;
  card.setAttribute("role", "listitem");

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
  // sibling unit span intact.
  const valueEl = document.createElement("span");
  valueEl.className =
    klass === "stat-third" || klass === "stat-half" ? "stat-value small" : "stat-value";
  const numNode = document.createElement("span");
  numNode.className = "stat-num";
  valueEl.appendChild(numNode);
  if (typeof value === "number") {
    if (animate) {
      numNode.textContent = "0";
      requestAnimationFrame(() => countUp(numNode, value));
    } else {
      numNode.textContent = String(value);
    }
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

export function renderStats(ctx) {
  const { currentRows, prevRows, prev } = ctx;
  const statGrid = document.getElementById("stat-grid");

  let firstPaint = true;

  function paint(state) {
    // Filter both months so the delta compares like-for-like — "law
    // schools this month" vs "law schools last month", not "law schools
    // now" vs "everything last month".
    const filteredCurrent = applyFilter(currentRows, state);
    const filteredPrev = applyFilter(prevRows, state);
    const okRows = filteredCurrent.filter((r) => r.status === "ok");
    const prevOkRows = filteredPrev.filter((r) => r.status === "ok");

    const {
      totalErrors,
      prevTotalErrors,
      cleanRows,
      impactTotals,
      topImpactKey,
      topRuleEntry,
      topReachRuleEntry,
      mobileViolationsTotal,
      systemTrend,
    } = computeAggregates({ okRows, prevOkRows, prev });

    const filterDesc = describeFilter(state);
    const scopeSuffix = filterDesc ? ` · ${filterDesc}` : "";
    const scopeNote = filterDesc ? ` (${filterDesc})` : " across the system";
    const animate = firstPaint;

    statGrid.textContent = "";

    // Card 1: Total issues
    const totalCaption = document.createElement("span");
    if (totalErrors === null) {
      totalCaption.textContent = "No successful scans in the current filter.";
    } else if (totalErrors === 0) {
      totalCaption.textContent = `No axe-core violations across ${okRows.length} of ${filteredCurrent.length} matching UC sites this month${scopeSuffix}. A strong start; keep going with manual testing.`;
    } else {
      totalCaption.appendChild(document.createTextNode("Flagged by axe-core across "));
      const strong = document.createElement("strong");
      strong.textContent = `${okRows.length} of ${filteredCurrent.length} UC sites${scopeSuffix}`;
      totalCaption.appendChild(strong);
      totalCaption.appendChild(
        document.createTextNode(
          ". Each one is an opportunity to make the UC web more accessible for someone.",
        ),
      );
    }
    const totalCard = makeStatCard(statGrid, {
      badge: "01",
      label: "Issues flagged",
      value: totalErrors !== null ? totalErrors : "n/a",
      caption: totalCaption,
      delta: prev ? deltaEl(totalErrors, prevTotalErrors) : null,
      klass: "stat-big",
      animate,
    });
    if (mobileViolationsTotal > 0) {
      const footnote = document.createElement("p");
      footnote.className = "stat-mobile-footnote";
      footnote.textContent = `${mobileViolationsTotal.toLocaleString()} mobile issues across all sites`;
      totalCard.appendChild(footnote);
    }
    statGrid.appendChild(totalCard);

    // Card 2: Clean scans
    const cleanCaption = document.createElement("span");
    if (cleanRows.length) {
      cleanCaption.appendChild(
        document.createTextNode("A clean axe-core scan is a great floor, not the ceiling. "),
      );
      cleanCaption.appendChild(document.createTextNode("Automated tools still miss "));
      const strong = document.createElement("strong");
      strong.textContent = "60 to 70 percent";
      cleanCaption.appendChild(strong);
      cleanCaption.appendChild(document.createTextNode(" of real barriers."));
    } else {
      cleanCaption.textContent = okRows.length
        ? "Every matching UC site had at least one flag this month. The top rule below is a good place to start."
        : "No clean scans in the current filter.";
    }
    statGrid.appendChild(
      makeStatCard(statGrid, {
        badge: "02",
        label: "Clean scans",
        value: cleanRows.length,
        unit: ` of ${okRows.length}`,
        caption: cleanCaption,
        klass: "stat-half",
        animate,
      }),
    );

    // Card 3: Month over month
    let momValue = "–";
    let momCaption =
      "This is the first scan on record. Once there is a second month, the trend lands here.";
    if (systemTrend) {
      if (systemTrend.delta < 0) {
        momValue = `▼ ${Math.abs(systemTrend.delta)}`;
        momCaption = `Fewer issues than ${prettyMonth(prev)}${scopeNote}. Collective progress.`;
      } else if (systemTrend.delta > 0) {
        momValue = `▲ ${systemTrend.delta}`;
        momCaption = `More issues than ${prettyMonth(prev)}${scopeNote}. New content often adds new opportunities to improve.`;
      } else {
        momValue = "0";
        momCaption = `The same total as ${prettyMonth(prev)}${scopeNote}. Steady.`;
      }
    }
    statGrid.appendChild(
      makeStatCard(statGrid, {
        badge: "03",
        label: "Month over month",
        value: momValue,
        caption: momCaption,
        klass: "stat-half",
        animate,
      }),
    );

    // Card 4: Top rule flagged
    const ruleCaption = document.createElement("span");
    const displayRule = topRuleEntry || topReachRuleEntry;
    const displayRuleIsReach = !topRuleEntry && Boolean(topReachRuleEntry);
    if (displayRule) {
      const strong = document.createElement("strong");
      strong.textContent = ruleFriendly(displayRule[0]);
      ruleCaption.appendChild(strong);
      ruleCaption.appendChild(
        document.createTextNode(
          displayRuleIsReach
            ? ". No required-level rules flagged; this is the top reach-goal rule."
            : ". Fixing this pattern first tends to have the widest benefit.",
        ),
      );
    } else {
      ruleCaption.textContent = "No rules were flagged in the current filter.";
    }
    statGrid.appendChild(
      makeStatCard(statGrid, {
        badge: "04",
        label: displayRuleIsReach ? "Top rule (reach)" : "Top rule flagged",
        value: displayRule ? displayRule[0] : "–",
        unit: displayRule ? ` · ${displayRule[1]} instances` : "",
        caption: ruleCaption,
        klass: "stat-third",
        animate,
      }),
    );

    // Card 5: Issue density
    const avgDensity = okRows.length
      ? okRows.reduce((s, r) => s + r.error_density, 0) / okRows.length
      : null;
    let densityValue = "n/a";
    let densityCaption = "No data in the current filter.";
    if (avgDensity !== null) {
      if (avgDensity === 0) {
        densityValue = "0";
        densityCaption = `Zero axe-core flags per element across ${okRows.length} matching sites this month.`;
      } else if (avgDensity >= 1) {
        // Multiple rules can hit the same element, so density can
        // exceed 1 per element. Flip the phrasing so the number
        // stays meaningful instead of rounding "1 in N" down to zero.
        densityValue = avgDensity.toFixed(2);
        densityCaption = `On average, axe-core flags ${avgDensity.toFixed(2)} issues for every DOM element it inspects. Some elements get flagged by more than one rule at once.`;
      } else {
        const oneIn = Math.round(1 / avgDensity);
        densityValue = `1 in ${oneIn.toLocaleString()}`;
        densityCaption = `On average, axe-core flags one issue for every ${oneIn.toLocaleString()} DOM elements it inspects. Raw density: ${avgDensity.toFixed(4)}.`;
      }
    }
    statGrid.appendChild(
      makeStatCard(statGrid, {
        badge: "05",
        label: "Issue density",
        value: densityValue,
        caption: densityCaption,
        klass: "stat-third",
        animate,
      }),
    );

    // Card 6: Severity mix
    const totalImpact = Object.values(impactTotals).reduce((a, b) => a + b, 0);
    const mixCaption = document.createElement("span");
    if (totalImpact && topImpactKey && topImpactKey[1] > 0) {
      const pct = Math.round((topImpactKey[1] / totalImpact) * 100);
      mixCaption.appendChild(document.createTextNode("Most flags are "));
      const strong = document.createElement("strong");
      strong.textContent = topImpactKey[0];
      mixCaption.appendChild(strong);
      mixCaption.appendChild(
        document.createTextNode(
          ` (${pct} percent). Severity is what axe-core reports; real user impact can be different.`,
        ),
      );
    } else {
      mixCaption.textContent = "No issues flagged in the current filter.";
    }
    statGrid.appendChild(
      makeStatCard(statGrid, {
        badge: "06",
        label: "Severity mix",
        value: totalImpact && topImpactKey ? topImpactKey[0] : "–",
        unit: totalImpact && topImpactKey ? ` · ${topImpactKey[1]}` : "",
        caption: mixCaption,
        klass: "stat-third",
        animate,
      }),
    );

    firstPaint = false;
  }

  paint(getFilterState());
  subscribe(paint);
}
