---
name: UC Homepage Accessibility Report
description: A systemwide monthly accessibility report rendered as an editorial, blue-and-gold civic broadsheet.
colors:
  uc-blue: "#1295D8"
  uc-gold: "#FFB511"
  uc-blue-secondary: "#005581"
  uc-light-blue: "#72CDF4"
  uc-extra-light-blue: "#BDE3F6"
  uc-gold-bright: "#FFD200"
  uc-light-gold: "#FFE552"
  uc-teal: "#00778B"
  uc-light-teal: "#00A3AD"
  uc-pink: "#E44C9A"
  uc-orange: "#FF6E1B"
  uc-dark-blue: "#002033"
  uc-gray: "#4C4C4C"
  uc-gray-mid: "#7C7E7F"
  ink: "#002033"
  ink-muted: "#3E5566"
  paper: "#FFFFFF"
  tint: "#F3F9FD"
  tint-2: "#E8F2FA"
  rule: "#D6E3EC"
  impact-critical: "#8E0C0C"
  impact-serious: "#7A2A0A"
  impact-moderate: "#54430B"
  impact-minor: "#1F4426"
typography:
  display:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(3rem, 8vw + 1rem, 7rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
  headline:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2rem, 4vw + 1rem, 3.5rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(1.5rem, 1.5vw + 1rem, 2rem)"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  stat:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(2.75rem, 5vw + 1rem, 4.5rem)"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Source Sans 3, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Source Sans 3, Helvetica Neue, Arial, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.18em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.5rem"
  "6": "2rem"
  "7": "3rem"
  "8": "4rem"
  "9": "6rem"
components:
  chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.uc-blue-secondary}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1rem"
  chip-selected:
    backgroundColor: "{colors.uc-blue-secondary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0.75rem 1rem"
  category-tag:
    backgroundColor: "{colors.tint-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "1px 8px 2px"
  button-ghost:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    size: "44px"
  impact-pill:
    backgroundColor: "{colors.impact-serious}"
    textColor: "{colors.paper}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
---

# Design System: UC Homepage Accessibility Report

## 1. Overview

**Creative North Star: "The Accessible Broadsheet"**

This is a public, monthly record of how the University of California's homepages, admissions sites, and schools-and-colleges measure up on accessibility. It carries the systemwide identity that all ten campuses share, so it reads as an institutional document, not a marketing page. The metaphor is a printed broadsheet: a two-rule masthead, a serif voice for headlines, fluid display numerals that behave like a front-page figure, and generous column measure. Authority comes from typography and restraint, never from decoration.

The palette is the official UC systemwide blue and gold, applied with discipline. Blue and gold are the unifying brand element; every other hue is a supporting voice that appears only when data needs to be told apart. The surface is paper white with the faintest cool blue tint, so the page feels like stock, not screen. Color is information here: an "impact" hue means a severity, never a flourish.

Because the subject is accessibility, the artifact must be the most accessible page in the room. That is the discipline that overrides every aesthetic impulse: a 3px focus ring that is impossible to miss, severity colors deliberately darkened from the bright brand palette until they clear WCAG AA on white, semantic tables that keep their `columnheader`/`aria-sort` roles, 44px minimum hit targets, and motion that disappears entirely under `prefers-reduced-motion`. This system explicitly rejects the dashboard reflexes of its category: no dark "data" theme, no neon-on-charcoal, no gradient hero metric, no glassmorphism, no identical card grid.

**Key Characteristics:**
- Editorial, institutional, calm; a record rather than a pitch.
- Official UC blue-and-gold as the spine; secondary hues only as data legends.
- Paper-white surface, hairline rules, near-flat elevation.
- Serif display voice over humanist-sans body.
- Accessibility is a visible design feature, not an afterthought.

## 2. Colors

The palette is the University of California systemwide brand, hex-exact, with a small set of derived working tokens for surface and severity.

### Primary
- **UC Blue** (#1295D8): The signature systemwide blue. Charts, the primary data accent, and brand moments. Used by all ten campuses, so it carries identity, not just emphasis.
- **UC Gold** (#FFB511): The systemwide gold. Reserved for the rare highlight, positive marker, or paired accent against blue. Never body text (it cannot meet contrast on white).

### Secondary
- **UC Blue (Secondary)** (#005581): The interactive ink. Links, chip borders, filter affordances, and the focus-ring color. This is the workhorse blue, dark enough for AA text on paper.
- **UC Light Blue** (#72CDF4) and **UC Extra Light Blue** (#BDE3F6): Chart fills, hovered surfaces, and sparing decorative tint.
- **UC Bright Gold** (#FFD200) / **UC Light Gold** (#FFE552): Secondary gold steps for data series only.

### Tertiary
- **UC Teal** (#00778B), **UC Light Teal** (#00A3AD), **UC Pink** (#E44C9A), **UC Orange** (#FF6E1B): The expanded data palette. Each enters only to distinguish a category, campus group, or chart series; never as ambient color.

### Neutral
- **UC Dark Blue / Ink** (#002033): The primary text color and strong rules. The deepest brand blue, used where most systems would reach for black.
- **Ink Muted** (#3E5566): Secondary text, eyebrows, captions, ghost-button labels.
- **Paper** (#FFFFFF) with **Tint** (#F3F9FD) and **Tint-2** (#E8F2FA): The page stock and its faint cool washes for raised or grouped surfaces.
- **Rule** (#D6E3EC): The hairline border and divider, a cool blue-gray that reads as printed rule.
- **UC Gray** (#4C4C4C) / **UC Gray Mid** (#7C7E7F): Muted metadata and the "unknown" severity.

### Severity (semantic, derived)
- **Critical** (#8E0C0C), **Serious** (#7A2A0A), **Moderate** (#54430B), **Minor** (#1F4426): Accessibility-impact severities. Deliberately darkened from the bright UC palette so each clears WCAG AA against white when carrying white pill text and when used as label color.

### Named Rules
**The Blue-and-Gold Spine Rule.** UC Blue and UC Gold are the only colors permitted to carry identity. Every secondary and tertiary hue must justify itself as data, not decoration. If a color is not distinguishing one thing from another, it does not belong on the page.

**The Contrast-First Rule.** Severity and text colors are chosen for WCAG AA on paper first, brand vibrancy second. Never use raw UC Orange (#FF6E1B), UC Gold (#FFB511), or UC Light Blue (#72CDF4) as text or small-pill fills on white; reach for the darkened severity tokens instead.

## 3. Typography

**Display Font:** Source Serif 4 (with Iowan Old Style, Georgia, serif)
**Body Font:** Source Sans 3 (with Helvetica Neue, Arial, sans-serif)
**Label/Mono Font:** `ui-monospace`, SFMono-Regular, Menlo for figures in tabular contexts.

**Character:** A humanist serif for headlines and figures paired with a humanist sans for reading. Source Sans 3 stands in for UC's proprietary wordmark face, Kievit, sharing its contemporary-but-rooted humanist bones; Source Serif 4 gives the report its broadsheet authority. Both ship with self-hosted `*-Fallback` metrics-matched faces to hold layout steady and avoid font-swap shift.

### Hierarchy
- **Display** (600, `clamp(3rem, 8vw + 1rem, 7rem)`, line-height 1): The front-page figure and hero title. Fluid, so it behaves like a printed headline at any width.
- **Stat** (600, `clamp(2.75rem, 5vw + 1rem, 4.5rem)`, line-height 1, tight tracking): Big quantitative values in the stat grid; the serif lends gravity to a number.
- **Headline** (600, `clamp(2rem, 4vw + 1rem, 3.5rem)`, line-height 1.1): Major section openers.
- **Title** (600, `clamp(1.5rem, 1.5vw + 1rem, 2rem)`, line-height 1.2): Subsection and card headings (`h2`).
- **Body** (400, 1.0625rem / 17px, line-height 1.6): Reading text. Hold measure to the narrow content column (760px, roughly 65 to 75ch).
- **Label** (600, 0.8125rem / 13px, letter-spacing 0.18em, uppercase): Eyebrows, filter labels, and pill text. The wide tracking is the broadsheet's small-caps voice.

### Named Rules
**The Serif-for-Significance Rule.** Serif (Source Serif 4) carries headlines and figures; sans (Source Sans 3) carries everything you actually read. Do not set body copy in the serif or section figures in the sans.

**The Steady-Metrics Rule.** Always load the metrics-matched `Source Sans 3 Fallback` / `Source Serif 4 Fallback` faces. Web fonts must never cause layout shift on this page; CLS is an accessibility regression.

## 4. Elevation

The system is near-flat. Depth is conveyed by hairline rules and faint tint layering, not by floating shadows. The shadow tokens that do exist are hybrids: a barely-there ambient shadow combined with a `0 0 0 1px` ring in the **Rule** color, so an element reads as a crisp printed panel rather than a lifted card. Surfaces sit on paper; they do not hover over it.

### Shadow Vocabulary
- **Subtle** (`box-shadow: 0 1px 2px rgba(0,32,51,0.05), 0 0 0 1px var(--rule)`): Default panel definition; mostly the ring does the work.
- **Raised** (`box-shadow: 0 2px 8px rgba(0,32,51,0.06), 0 0 0 1px var(--rule)`): Interactive groups and hovered surfaces.
- **Lifted** (`box-shadow: 0 12px 32px rgba(0,32,51,0.1), 0 0 0 1px var(--rule)`): The single most prominent surface only (e.g. a sticky control), used sparingly.

All shadows tint toward the deep brand blue (`rgba(0,32,51,...)`), never neutral gray-black.

### Named Rules
**The Printed-Panel Rule.** Borders before shadows. A surface earns its edge from the 1px **Rule** ring; ambient shadow is a whisper, never a drop. If a panel looks like it is floating, the shadow is too strong.

## 5. Components

### Chips (filter toggles)
- **Style:** Fully rounded pill (999px), paper background, **1.5px solid UC Blue (Secondary)** (#005581) border, secondary-blue label in body sans at 500 weight.
- **State:** Selected inverts to a solid #005581 fill with paper text. The 1.5px border (not a 1px hairline) gives the unselected pill enough presence to read as tappable.
- **Use:** Category and campus filtering in the filter bar.

### Category Tag
- **Style:** Compact pill, **Tint-2** (#E8F2FA) background, 1px **Rule** border, **Ink** text at micro size (13px), 500 weight.
- **Use:** Inline, non-interactive classification labels. Distinct from chips: tags inform, chips act.

### Impact Pill (severity badge)
- **Style:** Small rectangle (4px radius), severity-color fill, **paper** text, uppercase 11px at 0.06em tracking.
- **Color:** Always one of the darkened severity tokens (Critical/Serious/Moderate/Minor), chosen so white text clears AA.

### Buttons
- **Shape:** 8px radius for ghost controls; pill (999px) for the reset link.
- **Ghost (expand/disclosure):** Transparent background, 1px **Rule** border, **Ink Muted** label, minimum 44x44px target. Hover warms the background and deepens the label. This is the default low-emphasis button.
- **Sort button:** A real `<button>` filling the table header cell, transparent and inheriting the header's type, so the `<th>` keeps its `columnheader` semantics and `aria-sort` while the click target stays native.
- **Filter reset:** Underlined link-style pill (transparent, #005581 text, 3px underline offset), low emphasis by design.
- **Hover/Focus:** Transitions run on `background` and `color` over 180ms with the standard ease. Focus is governed globally (see Do's).

### Cards / Containers
- **Corner Style:** 8px (`--radius`).
- **Background:** Paper (#FFFFFF).
- **Border:** 1px solid **Rule** (#D6E3EC). This single hairline is the card's definition.
- **Shadow Strategy:** None at rest; see Elevation. Cards are flat printed panels.
- **Internal Padding:** `--space-5` (1.5rem).
- **Note:** Cards are used only where a campus or hall is a genuine discrete record. Never nest a card inside a card.

### Navigation / Masthead
- **Style:** A two-column grid (brand left, meta right), baseline-aligned, closed by a **2px solid Ink** bottom rule, the broadsheet nameplate.
- **Typography:** Brand set in the display serif; meta in muted sans.

### Hero
- **Eyebrow:** Uppercase label (13px, 0.18em tracking, Ink Muted) flanked by `::before`/`::after` rules, the dateline of the broadsheet.
- **Title:** Display serif at the largest fluid step.
- **Measure:** Lede held to the narrow content column.

### Focus & Skip Link (signature, accessibility-first)
- **Focus ring:** Global `:focus-visible` is a **3px solid UC Blue (Secondary)** outline at 3px offset. Loud on purpose; this is the most important visual affordance on the site.
- **Skip link:** A real skip-to-content link that surfaces on focus against an **Ink** background.

## 6. Do's and Don'ts

### Do:
- **Do** treat UC Blue (#1295D8) and UC Gold (#FFB511) as the identity spine and keep every other hue earning its place as data (the Blue-and-Gold Spine Rule).
- **Do** pick text and small-pill colors for WCAG AA on paper first; use the darkened severity tokens (#8E0C0C / #7A2A0A / #54430B / #1F4426), never raw bright-brand hues, for text and fills on white (the Contrast-First Rule).
- **Do** keep the global 3px `:focus-visible` ring at 3px offset on every interactive element. It is a feature, not chrome.
- **Do** load the metrics-matched fallback fonts so the page never shifts on font swap (CLS is an accessibility regression).
- **Do** define surfaces with the 1px **Rule** ring and keep ambient shadow to a whisper (the Printed-Panel Rule).
- **Do** keep interactive targets at a 44x44px minimum and let real `<button>`/`<th>` semantics carry sort and disclosure state.
- **Do** honor `prefers-reduced-motion`: disable smooth scroll and transitions entirely.
- **Do** set headlines and figures in Source Serif 4 and reading text in Source Sans 3 (the Serif-for-Significance Rule); hold body to roughly 65 to 75ch.

### Don't:
- **Don't** use side-stripe borders: a `border-left`/`border-right` greater than 1px as a colored accent on cards, rows, or callouts. Replace with a full border, a background tint, or a leading severity pill. (The legacy `.campus-card.error-row { border-left: 4px }` is the lone exception and is slated to migrate to a full-border or tint treatment.)
- **Don't** ship a dark "data dashboard" theme, neon-on-charcoal, or any palette guessable from the word "dashboard." This is a paper-white civic record.
- **Don't** build the hero-metric template (giant gradient number, label, supporting stats). Figures live in the serif stat grid, in flat brand color.
- **Don't** use gradient text (`background-clip: text`), glassmorphism, or decorative blur. Emphasis comes from scale, weight, and the serif.
- **Don't** repeat identical icon-heading-text card grids. Cards appear only for genuine discrete records, and never nested.
- **Don't** color anything for vibrancy alone, and never use UC Gold for text on white.
- **Don't** animate layout properties or use bounce/elastic easing; transitions ease out (`cubic-bezier(0.2, 0.7, 0.2, 1)`) on `background`, `color`, and `transform` only.
- **Don't** use em dashes in interface copy; use commas, colons, or parentheses.
