export async function fetchHistory() {
  const resp = await fetch("data/history.json");
  const history = await resp.json();

  if (!Array.isArray(history) || history.length === 0) {
    return { history: [], empty: true };
  }

  const months = [...new Set(history.map((r) => r.month))].sort();
  const latest = months[months.length - 1];
  const prev = months.length > 1 ? months[months.length - 2] : null;

  const currentRows = history.filter((r) => r.month === latest);
  const prevRows = prev ? history.filter((r) => r.month === prev) : [];
  const okRows = currentRows.filter((r) => r.status === "ok");
  const prevOkRows = prevRows.filter((r) => r.status === "ok");

  // Pre-index history by (month, slug) so trend-chart can look up each
  // cell in O(1). Without this, the chart's nested month × slug loop
  // degrades to a linear scan of the full history array per cell.
  const byMonthSlug = new Map();
  for (const row of history) {
    byMonthSlug.set(`${row.month}\u0000${row.site}`, row);
  }
  const rowFor = (month, slug) => byMonthSlug.get(`${month}\u0000${slug}`);

  const prevRow = (slug) => (prev ? rowFor(prev, slug) : undefined);

  return {
    empty: false,
    history,
    months,
    latest,
    prev,
    currentRows,
    prevRows,
    okRows,
    prevOkRows,
    rowFor,
    prevRow,
  };
}
