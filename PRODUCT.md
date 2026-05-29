# Product

## Register

product

## Users

UC web developers, accessibility coordinators, and campus IT staff who own the
183 scanned properties. They open the report monthly (or right after shipping a
fix) to see where their campus stands, which sites regressed or improved, and
which specific rule violations to tackle first. Their context is operational:
they need to filter to their own campus or site type, read severity at a glance,
and leave with a short list of real issues to act on.

Secondary readers: UC leadership tracking systemwide progress over time, and the
public, students, and disability advocates viewing the record in the open. When
needs conflict, the teams who act on the findings win.

## Product Purpose

A monthly, automated accessibility report covering 183 UC web properties (campus
homepages, admissions sites, schools and colleges, and key student services)
across all 10 University of California campuses and the Office of the President.
On the 1st of each month a GitHub Actions workflow loads each property in
headless Chromium, runs axe-core at mobile and desktop widths, and publishes the
results to GitHub Pages.

Violations are bucketed into **Required** (WCAG 2.0 and 2.1 Level A & AA, the
baseline under ADA Title II and Section 508) and **Reach** (WCAG 2.1 AAA and all
of WCAG 2.2, tracked as aspirational). Success is that a web or accessibility
team can land on the report, narrow to their sites, and walk away knowing what
to fix first, while the systemwide month-over-month trend keeps accessibility
visible and moving in the right direction.

## Brand Personality

Editorial, institutional, calm. A record rather than a pitch. The voice is plain,
specific, and non-punitive: it informs and encourages. Three words: civic, exact,
unhurried. The emotional goal is that a reader trusts the numbers and feels
invited to act, never judged or ranked against a rival campus.

## Anti-references

- No dark "data dashboard" theme, neon-on-charcoal, or anything guessable from
  the word "dashboard." This is a paper-white civic record.
- No gradient hero-metric template (a giant gradient number with supporting stats).
- No glassmorphism, decorative blur, or gradient text.
- No endless identical icon-heading-text card grids.
- Not a marketing landing page, and not a campus-versus-campus leaderboard built
  to shame. The data is presented to inform, not to rank for sport.

## Design Principles

1. **The artifact is the argument.** A report about accessibility must itself be
   the most accessible page in the room. When accessibility and any aesthetic
   impulse collide, accessibility wins, every time.
2. **A checkpoint, not a scoreboard.** Inform and encourage. Present findings as
   shared opportunities to improve, framed in language that invites action rather
   than a ranking engineered to embarrass a campus.
3. **Built for the people who fix it.** The primary readers are UC web and
   accessibility teams. Every view, filter, and number earns its place by helping
   them locate, prioritize, and act on real issues on the sites they own.
4. **Honest about its limits.** Automated scanning catches only 30 to 40 percent
   of real accessibility issues. Credibility comes from stating that plainly and
   never overclaiming; the report is a useful lower bound, not a verdict.
5. **A durable institutional record.** It reads as a systemwide civic document
   shared by all ten campuses, not a one-off pitch. Month-over-month continuity
   and a neutral, common identity matter more than novelty.

## Accessibility & Inclusion

WCAG 2.2 AA is the firm, non-negotiable commitment for the artifact itself; given
the subject, anything less undermines the report. AAA-grade touches are welcome
where practical (the loud 3px focus ring, severity colors darkened until they
clear AA on white) but AA is the stated bar, not AAA.

Concretely: full keyboard operability, semantic data tables that keep their
`columnheader` / `aria-sort` roles, a 44x44px minimum hit target, a skip link,
`prefers-reduced-motion` honored completely (no smooth scroll, no transitions),
and color never used as the sole information channel (severity always carries a
text label, not just a hue). The page must not shift on font swap; CLS is treated
as an accessibility regression.
