import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = join(__dirname, '..', 'data', 'history.json');

/**
 * Append summary rows for the current month to history.json.
 * If rows already exist for a given (month, site) pair (e.g. because someone
 * manually re-triggered the workflow), those rows are replaced rather than
 * duplicated. Rows from other months are never touched.
 */
export async function updateHistory(newRows) {
  let history = [];
  try {
    history = JSON.parse(await readFile(HISTORY_PATH, 'utf-8'));
  } catch {
    // File missing or empty; start fresh.
  }

  // Build a set of (month, site) keys that are being written this run.
  const incoming = new Set(newRows.map((r) => `${r.month}::${r.site}`));

  // Keep all existing rows that are NOT being replaced by this run.
  const kept = history.filter((r) => !incoming.has(`${r.month}::${r.site}`));

  const merged = [...kept, ...newRows];

  // Sort chronologically, then alphabetically by site within a month.
  merged.sort((a, b) => a.month.localeCompare(b.month) || a.site.localeCompare(b.site));

  await writeFile(HISTORY_PATH, JSON.stringify(merged, null, 2) + '\n');
  console.log(`history.json updated: ${merged.length} total rows (${newRows.length} new/replaced)`);
}
