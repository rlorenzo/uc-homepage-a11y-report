export const CAMPUS_NAMES = {
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

// Canonical campus order with any unknown slugs appended at the end.
// Used by the filter bar, grouped table, and trend chart — keeping it
// centralized means a new campus only needs to appear in CAMPUS_NAMES.
export function orderedCampuses(slugsLike) {
  const set = slugsLike instanceof Set ? slugsLike : new Set(slugsLike);
  const known = Object.keys(CAMPUS_NAMES).filter((s) => set.has(s));
  const extra = [...set].filter((s) => !Object.hasOwn(CAMPUS_NAMES, s)).sort();
  return known.concat(extra);
}

export const CATEGORY_LABELS = {
  homepage: "Campus homepages",
  admissions: "Admissions",
  business: "Business",
  engineering: "Engineering & computing",
  law: "Law",
  "medicine-health": "Medicine & health sciences",
  "humanities-arts": "Humanities & arts",
  "social-sciences": "Social sciences",
  "natural-sciences": "Natural sciences",
  education: "Education",
  "environment-design": "Environment & design",
  information: "Information & journalism",
  library: "Libraries",
  it: "IT & technology",
  disability: "Disability services",
  registrar: "Registrars",
  "financial-aid": "Financial aid",
  health: "Student health",
  housing: "Student housing",
};

export const categoryLabel = (key) => CATEGORY_LABELS[key] || key;

// Category values that have their own top-level View chip. These should
// NOT appear in the discipline dropdown (redundant with the chip) and
// should NOT be accepted as `cat=` URL parameters (cat= is for discipline
// filtering within a type, not for switching between type chips).
export const CHIP_CATEGORIES = new Set([
  "homepage",
  "admissions",
  "library",
  "it",
  "disability",
  "registrar",
  "financial-aid",
  "health",
  "housing",
]);

export const TYPE_ALL = "all";
export const TYPE_HOMEPAGES = "homepages";
export const TYPE_ADMISSIONS = "admissions";
export const TYPE_SCHOOLS = "schools";
export const TYPE_LIBRARIES = "libraries";
export const TYPE_IT = "it";
export const TYPE_DISABILITY = "disability";
export const TYPE_REGISTRARS = "registrars";
export const TYPE_FINANCIAL_AID = "financial-aid";
export const TYPE_HEALTH = "health";
export const TYPE_HOUSING = "housing";

export const TYPE_ORDER = [
  TYPE_ALL,
  TYPE_HOMEPAGES,
  TYPE_ADMISSIONS,
  TYPE_SCHOOLS,
  TYPE_LIBRARIES,
  TYPE_IT,
  TYPE_DISABILITY,
  TYPE_REGISTRARS,
  TYPE_FINANCIAL_AID,
  TYPE_HEALTH,
  TYPE_HOUSING,
];

export const TYPE_LABELS = {
  [TYPE_ALL]: "All",
  [TYPE_HOMEPAGES]: "Homepages",
  [TYPE_ADMISSIONS]: "Admissions",
  [TYPE_SCHOOLS]: "Schools & colleges",
  [TYPE_LIBRARIES]: "Libraries",
  [TYPE_IT]: "IT & technology",
  [TYPE_DISABILITY]: "Disability services",
  [TYPE_REGISTRARS]: "Registrars",
  [TYPE_FINANCIAL_AID]: "Financial aid",
  [TYPE_HEALTH]: "Student health",
  [TYPE_HOUSING]: "Student housing",
};

// axe-core impact levels in severity order (worst → least). Used by
// derive.js for aggregation and by render modules for stacking.
export const IMPACT_KEYS = ["critical", "serious", "moderate", "minor", "unknown"];

export const RULE_DESCRIPTIONS = {
  "color-contrast": "Text is hard to read against its background",
  "link-name": "Link has no accessible name",
  "button-name": "Button has no accessible name",
  "image-alt": "Image is missing alt text",
  "input-button-name": "Button input has no accessible name",
  "target-size": "Tap target is smaller than 24×24 pixels",
  "aria-prohibited-attr": "An ARIA attribute is used where it's not allowed",
  "aria-allowed-attr": "An ARIA attribute doesn't belong on this element",
  "aria-command-name": "Button, link, or menuitem has no accessible name",
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
  "aria-input-field-name": "Input field has no accessible name via ARIA",
  "aria-required-children": "ARIA role is missing required child roles",
  "aria-required-parent": "Element with ARIA role lacks its required parent",
  "aria-roles": "ARIA role is invalid or misspelled",
  // axe-core 4.12 added aria-tab-name. No UC site currently has a role="tab"
  // element, so it flags nothing today — described up front so the first site
  // that adds tabs gets real copy instead of the generic fallback.
  "aria-tab-name": "Tab has no accessible name",
  "aria-valid-attr": "ARIA attribute name is invalid or misspelled",
  "aria-valid-attr-value": "ARIA attribute has an invalid value",
  "color-contrast-enhanced": "Text doesn't meet AAA enhanced contrast (7:1)",
  "definition-list": "<dl> markup is structurally broken",
  "frame-title": "<iframe> is missing a title",
  "link-in-text-block": "Link in text isn't distinguishable without color",
  "nested-interactive": "Interactive element is nested inside another",
  "role-img-alt": "Element with role=\"img\" has no accessible name",
  "scrollable-region-focusable": "Scrollable area can't be reached by keyboard",
};

export const ruleFriendly = (rule) =>
  RULE_DESCRIPTIONS[rule] || "Automated accessibility rule violation";

const RULE_IMPACT = {
  "color-contrast":
    "Low-contrast text is a barrier for anyone with low vision, color blindness, or age-related vision loss, roughly 1 in 12 people.",
  "link-name":
    'A link without an accessible name is announced as "link, link, link" to a screen reader. Fixing it gives every assistive-tech user a clear sense of where they are going.',
  "button-name":
    "A button with no accessible name is invisible to screen reader users. It also confuses voice-control software that tries to match the button label.",
  "image-alt":
    "Missing alt text means a screen reader user hears nothing, or worse, the file name. Good alt text lets everyone in on what the image conveys.",
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

export const ruleImpact = (rule) =>
  RULE_IMPACT[rule] ||
  "Accessibility rules exist because real people rely on the things they check. Every fix widens who your site works for.";

// Base palette — 11 entries, one per campus. render/trend-chart.js
// extends with HSL rotation when per-site mode needs more lines.
export const CHART_COLORS = [
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
