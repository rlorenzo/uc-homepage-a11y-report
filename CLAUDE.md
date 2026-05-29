# CLAUDE.md

Guidance for agents working in this repo. See `README.md` for what the project
is and how to run it.

## Design Context

This project carries two root context files that every design or UI task should
read first:

- **`PRODUCT.md`** — the strategic brief: register, users, purpose, brand
  personality, anti-references, design principles, and the accessibility
  commitment. Answers who/what/why.
- **`DESIGN.md`** — the visual system: color palette, typography, components,
  layout, and named rules. Answers how it looks.

Quick orientation (read the files for the full picture):

- **Register:** `product`. The editorial "Accessible Broadsheet" styling is a
  treatment; the job is a data tool for the UC web and accessibility teams who
  own and fix the scanned sites.
- **Primary users:** UC web developers, accessibility coordinators, and campus
  IT staff who act on the findings. When needs conflict, they win.
- **Stance:** a shared checkpoint, not a scoreboard. Inform and encourage; never
  rank to shame.
- **Accessibility bar:** WCAG 2.2 AA is the firm, non-negotiable commitment.
  AAA touches are welcome where practical, but AA is the stated bar, not AAA.
  The report about accessibility must itself be the most accessible page in the
  room: a11y beats any aesthetic impulse.

Design and UI work is driven through the impeccable skill (`/impeccable`). Run a
sub-command (`critique`, `audit`, `polish`, etc.) against a specific surface,
e.g. `site/index.html`.
