import { IMPACT_KEYS } from "./constants.js";

const emptyImpact = () => ({ critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 });

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
    systemTrend,
  };
}

export function deriveAggregates(ctx) {
  return Object.assign(ctx, computeAggregates(ctx));
}
