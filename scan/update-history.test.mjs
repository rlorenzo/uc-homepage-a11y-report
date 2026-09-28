import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { updateHistory } from "./update-history.mjs";

// Regression: updateHistory carries forward rows the current scan doesn't
// replace. Before, only the incoming rows were sanitized, so an older row
// with a live Zoom passcode would be republished unchanged on every later
// run that didn't happen to rescan that same (month, site).
test("redacts a Zoom passcode in a row retained from a prior run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "history-test-"));
  const historyPath = join(dir, "history.json");
  try {
    const oldRow = {
      month: "2026-05",
      site: "ucsf-financial-aid",
      status: "ok",
      note: "https://ucsf.zoom.us/j/123?pwd=SECRET",
    };
    await writeFile(historyPath, `${JSON.stringify([oldRow], null, 2)}\n`);

    // This run only produces a row for a different site, so the May
    // ucsf-financial-aid row above is carried forward, not replaced.
    const newRow = { month: "2026-06", site: "some-other-site", status: "ok" };
    await updateHistory([newRow], historyPath);

    const merged = JSON.parse(await readFile(historyPath, "utf-8"));
    const carried = merged.find((r) => r.site === "ucsf-financial-aid");
    assert.ok(carried, "retained row should still be present");
    assert.match(carried.note, /pwd=REDACTED/);
    assert.doesNotMatch(carried.note, /pwd=SECRET/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
