import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, "..", "data", "history.json");

/**
 * Append summary rows for the current month to history.json.
 * If rows already exist for a given (month, site) pair (e.g. because someone
 * manually re-triggered the workflow), those rows are replaced rather than
 * duplicated — with one exception: an incoming error row never replaces an
 * existing ok row, so a rerun with a transient failure (bot block, timeout)
 * can't downgrade a month that already scanned clean. Rows from other months
 * are never touched.
 */
export async function updateHistory(newRows) {
  let history = [];
  try {
    const raw = await readFile(HISTORY_PATH, "utf-8");
    if (raw.trim()) {
      history = JSON.parse(raw);
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      throw err;
    }
  }

  const keyOf = (r) => `${r.month}::${r.site}`;
  const existingByKey = new Map(history.map((r) => [keyOf(r), r]));

  // Drop incoming error rows that would replace an ok row. The failure is
  // still archived in data/runs/<month>/<slug>.json; only the summary table
  // keeps the earlier successful scan.
  const downgrades = newRows.filter(
    (r) => r.status === "error" && existingByKey.get(keyOf(r))?.status === "ok",
  );
  const rows = newRows.filter((r) => !downgrades.includes(r));
  if (downgrades.length) {
    console.warn(
      `Kept ${downgrades.length} existing ok row(s) over incoming error row(s): ` +
        downgrades.map((r) => r.site).join(", "),
    );
  }

  // Build a set of (month, site) keys that are being written this run.
  const incoming = new Set(rows.map(keyOf));

  // Keep all existing rows that are NOT being replaced by this run.
  const kept = history.filter((r) => !incoming.has(keyOf(r)));

  const merged = [...kept, ...rows];

  // Sort chronologically, then alphabetically by site within a month.
  merged.sort((a, b) => a.month.localeCompare(b.month) || a.site.localeCompare(b.site));

  await writeFile(HISTORY_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`history.json updated: ${merged.length} total rows (${rows.length} new/replaced)`);
}
