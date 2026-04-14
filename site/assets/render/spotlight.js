import { ruleFriendly, ruleImpact } from "../data/constants.js";
import { prettyMonth } from "../utils/format.js";

function makeHallCard(hall, { label, headline, detail, accent = false }) {
  const card = document.createElement("div");
  card.className = `hall-card${accent ? " champion" : ""} reveal reveal-${(hall.children.length % 7) + 1}`;
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

export function renderSpotlight(ctx) {
  const { topRuleEntry, topReachRuleEntry, systemTrend, prev } = ctx;
  const hall = document.getElementById("hall");

  // Spotlight stays system-wide and is not filter-aware on purpose: it
  // is the editorial voice of the report, while filters change the data
  // view alongside it.
  if (topRuleEntry) {
    const headline = ruleFriendly(topRuleEntry[0]);
    hall.appendChild(
      makeHallCard(hall, {
        accent: true,
        label: "Where the impact is",
        headline,
        detail: `${ruleImpact(topRuleEntry[0])} This month axe-core flagged it ${topRuleEntry[1]}${topRuleEntry[1] === 1 ? " time" : " times"} across the UC web presence.`,
      }),
    );
  } else if (topReachRuleEntry) {
    const headline = ruleFriendly(topReachRuleEntry[0]);
    hall.appendChild(
      makeHallCard(hall, {
        accent: true,
        label: "Reach-goal opportunity",
        headline,
        detail: `Zero required-level issues across the system this month — a strong baseline. The top reach-goal rule is ${headline.toLowerCase()}, flagged ${topReachRuleEntry[1]} times. ${ruleImpact(topReachRuleEntry[0])}`,
      }),
    );
  } else {
    hall.appendChild(
      makeHallCard(hall, {
        accent: true,
        label: "Where the impact is",
        headline: "No automated flags this month",
        detail:
          "Nothing flagged in the required or reach-goal buckets. The next step is manual review: keyboard navigation, screen reader testing, and real users.",
      }),
    );
  }

  if (systemTrend) {
    if (systemTrend.delta < 0) {
      hall.appendChild(
        makeHallCard(hall, {
          label: "System-wide trend",
          headline: `${Math.abs(systemTrend.delta)} fewer issues than last month`,
          detail: `Across the full UC web presence, the total went from ${systemTrend.from} to ${systemTrend.to}. Small, consistent improvements are how we move the needle.`,
        }),
      );
    } else if (systemTrend.delta > 0) {
      hall.appendChild(
        makeHallCard(hall, {
          label: "System-wide trend",
          headline: `${systemTrend.delta} more issues than last month`,
          detail: `Totals went from ${systemTrend.from} to ${systemTrend.to}. New content, new components, and routine updates can all surface new opportunities. The rule list below shows where to look first.`,
        }),
      );
    } else {
      hall.appendChild(
        makeHallCard(hall, {
          label: "System-wide trend",
          headline: "Holding steady",
          detail: `The same system-wide total as ${prettyMonth(prev)}. Consistency is not nothing — and there is always room to widen who the web works for.`,
        }),
      );
    }
  } else {
    hall.appendChild(
      makeHallCard(hall, {
        label: "Baseline month",
        headline: "First recorded scan",
        detail:
          "Once a second month of data is in, the system-wide trend shows up here. Until then, treat this run as a baseline.",
      }),
    );
  }
}
