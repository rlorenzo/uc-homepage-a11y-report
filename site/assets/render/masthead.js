import { countUp, prettyMonth } from "../utils/format.js";

function renderHero(totalErrors) {
  const heroNumEl = document.getElementById("hero-number");
  const heroWordEl = document.getElementById("hero-number-word");
  if (totalErrors === null) {
    heroNumEl.textContent = "No data";
    heroWordEl.textContent = "yet";
    return;
  }
  if (totalErrors === 0) {
    heroNumEl.textContent = "0";
    heroWordEl.textContent = "axe issues found,";
    document.getElementById("hero-coda").textContent =
      "and plenty of room to keep pushing deeper with manual testing.";
    return;
  }
  countUp(heroNumEl, totalErrors);
  heroWordEl.textContent = totalErrors === 1 ? "opportunity" : "opportunities";
}

export function renderMasthead(ctx) {
  const { latest, currentRows, okRows, totalErrors } = ctx;
  const sampleRow = currentRows[0];
  const engineVersion = sampleRow ? sampleRow.axe_version : "unknown";

  document.getElementById("masthead-date").textContent = prettyMonth(latest);
  document.getElementById("byline-date").textContent = prettyMonth(latest);
  document.getElementById("byline-engine").textContent = `axe-core ${engineVersion}`;
  document.getElementById("byline-sites").textContent =
    `${okRows.length} of ${currentRows.length} scanned`;

  document.getElementById("hero-site-count").textContent = currentRows.length;
  renderHero(totalErrors);
}
