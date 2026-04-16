import { IMPACT_KEYS } from "./constants.js";

const emptyImpact = () => ({ critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 });

// ---------------------------------------------------------------------------
// Per-rule viewport classification
// ---------------------------------------------------------------------------

function classifyRules(desktopByRule, mobileByRule, desktopRuleImpact, mobileRuleImpact) {
  const allRuleIds = new Set([
    ...Object.keys(desktopByRule),
    ...Object.keys(mobileByRule),
  ]);

  const rules = [];
  for (const id of allRuleIds) {
    const desktop_count = desktopByRule[id] || 0;
    const mobile_count = mobileByRule[id] || 0;

    let viewport;
    if (desktop_count > 0 && mobile_count > 0) viewport = "both";
    else if (mobile_count > 0) viewport = "mobile-exclusive";
    else viewport = "desktop-exclusive";

    rules.push({
      id,
      desktop_count,
      mobile_count,
      viewport,
      impact: desktopRuleImpact[id] || mobileRuleImpact[id] || "unknown",
    });
  }

  // Sort by total count descending for consistent display
  rules.sort((a, b) => (b.desktop_count + b.mobile_count) - (a.desktop_count + a.mobile_count));
  return rules;
}

function derivePerRowRules(rows) {
  for (const row of rows) {
    if (row.status !== "ok") continue;

    row.required_rules = classifyRules(
      row.violations_by_rule || {},
      row.mobile_violations_by_rule || {},
      row.violations_rule_impact || {},
      row.mobile_violations_rule_impact || {},
    );

    row.reach_rules = classifyRules(
      row.reach_violations_by_rule || {},
      row.mobile_reach_violations_by_rule || {},
      row.reach_violations_rule_impact || {},
      row.mobile_reach_violations_rule_impact || {},
    );

    // Pre-compute mobile-exclusive totals for this row
    row.mobile_exclusive_total = row.required_rules
      .filter((r) => r.viewport === "mobile-exclusive")
      .reduce((sum, r) => sum + r.mobile_count, 0);

    row.mobile_exclusive_reach_total = row.reach_rules
      .filter((r) => r.viewport === "mobile-exclusive")
      .reduce((sum, r) => sum + r.mobile_count, 0);
  }
}

// ---------------------------------------------------------------------------
// Aggregate computation
// ---------------------------------------------------------------------------

export function computeAggregates({ okRows, prevOkRows, prev }) {
  const totalErrors = okRows.length ? okRows.reduce((s, r) => s + r.violations_total, 0) : null;
  const prevTotalErrors = prevOkRows.length
    ? prevOkRows.reduce((s, r) => s + r.violations_total, 0)
    : null;

  const cleanRows = okRows.filter((r) => r.violations_total === 0);

  const impactTotals = emptyImpact();
  for (const row of okRows) {
    const by = row.violations_by_impact;
    for (const k of IMPACT_KEYS) impactTotals[k] += by[k] || 0;
  }
  const topImpactKey = Object.entries(impactTotals).sort((a, b) => b[1] - a[1])[0];

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

  const currentReachRuleTotals = {};
  for (const row of okRows) {
    for (const [rule, count] of Object.entries(row.reach_violations_by_rule)) {
      currentReachRuleTotals[rule] = (currentReachRuleTotals[rule] || 0) + count;
    }
  }
  const topReachRuleEntry = Object.entries(currentReachRuleTotals).sort((a, b) => b[1] - a[1])[0];

  // history.json carries per-rule totals and per-impact totals separately,
  // not crossed. We attribute each rule's count proportionally to the row's
  // impact mix so the stacked rule chart is directionally correct — the
  // shape is right and the relative ordering is stable, but raw numbers
  // are rounded.
  const currentRuleImpact = {};
  for (const row of okRows) {
    const rowTotal = row.violations_total;
    if (rowTotal === 0) continue;
    const rowImpact = row.violations_by_impact;
    for (const [rule, count] of Object.entries(row.violations_by_rule)) {
      if (!currentRuleImpact[rule]) currentRuleImpact[rule] = emptyImpact();
      for (const k of IMPACT_KEYS) {
        currentRuleImpact[rule][k] += (count * (rowImpact[k] || 0)) / rowTotal;
      }
    }
  }

  // Mobile aggregates
  let mobileViolationsTotal = 0;
  for (const row of okRows) {
    mobileViolationsTotal += row.mobile_violations_total || 0;
  }

  const currentMobileRuleTotals = {};
  for (const row of okRows) {
    for (const [rule, count] of Object.entries(row.mobile_violations_by_rule || {})) {
      currentMobileRuleTotals[rule] = (currentMobileRuleTotals[rule] || 0) + count;
    }
  }

  let systemTrend = null;
  if (prev && totalErrors !== null && prevTotalErrors !== null) {
    systemTrend = {
      from: prevTotalErrors,
      to: totalErrors,
      delta: totalErrors - prevTotalErrors,
    };
  }

  return {
    totalErrors,
    prevTotalErrors,
    cleanRows,
    impactTotals,
    topImpactKey,
    currentRuleTotals,
    prevRuleTotals,
    topRuleEntry,
    currentReachRuleTotals,
    topReachRuleEntry,
    currentRuleImpact,
    mobileViolationsTotal,
    currentMobileRuleTotals,
    systemTrend,
  };
}

export function deriveAggregates(ctx) {
  // Attach per-row rule classification before aggregation so that
  // mobile-exclusive totals are available in computeAggregates.
  derivePerRowRules(ctx.currentRows);
  if (ctx.prevRows.length) derivePerRowRules(ctx.prevRows);

  return Object.assign(ctx, computeAggregates(ctx));
}
