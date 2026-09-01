# Business Simulator — Advanced Entrepreneurship (Classroom Edition)

An interactive, browser-based business simulation engine for Advanced Entrepreneurship classes,
built from the [Business Simulator Master Prompt](docs/MASTER_PROMPT.md).

Students **found, run, and grow a business of their own design** — with genuine freedom of
choice — while the engine keeps every consequence grounded in how business actually works.
Every decision trades off against something: cash, time, team morale, brand reputation, or
competitive position. A business that runs out of cash fails. That's the lesson.

## Quick start

No build step and no dependencies — it's a plain static site.

```bash
npm run serve          # serves on http://0.0.0.0:8021
# or: python3 -m http.server 8021
```

Then open `http://localhost:8021` in a browser.

## What's implemented

- **Step 0 — Business Creation Wizard.** Students describe any idea (product, service, app,
  store, subscription, marketplace...), their customer, their unfair advantage, the revenue
  model, and how they're funding it. The engine sets a realistic starting position and
  **shows its reasoning**.
- **Persistent Business State** — the exact template from the master prompt (Finance,
  Product, Marketing & Sales, Operations & People, Market & Competition, Risk Flags),
  updated every round and rendered as a live dashboard.
- **The Freedom Principle.** Actions are typed in free text ("spend $800 on TikTok ads",
  "hire a barista", "raise prices 10%", "pivot to subscriptions"). A keyword/intent parser
  maps them onto realistic outcomes; when an action is too vague to resolve, the engine asks
  1–2 clarifying questions, just like the prompt requires. Four suggested directions are
  always offered (Beginner mode styling), and free text is never closed off.
- **Random Event Engine.** ~1-in-3 chance per round of an industry-relevant outside event
  (econ shifts, competitor moves, supply chain, PR, regulation, talent, customer behavior).
  Severity scales with how well the business is run.
- **Realism Guardrails.** Starting-capital ranges per funding route, industry gross-margin
  bands, industry-scaled CAC, 5–15% organic monthly growth ceilings (20%+ only with a
  catalyst), macro drift, and honest bankruptcy when cash hits zero. Dollar figures are
  rounded like a real income statement.
- **Mode 1 — Beginner.** Four headline numbers (Cash, Revenue, Expenses, Customers),
  plain-language explanations, glossary tooltips for every business term.
- **Mode 2 — Advanced.** Real lingo — CAC, LTV:CAC, burn, runway, MRR/ARR, churn, margins,
  EBITDA, valuation, dilution — plus a mini P&L, simplified balance sheet, cap table,
  simulated investor term sheets with negotiation, and rival-company dynamics.
- **Mode 3 — Teacher Scenario.** The teacher injects any scenario, the class submits one
  collective decision, and the engine shows the outcome **plus 1–2 counterfactuals** ("what
  if the class had chosen differently?").
- **Mode 4 — Team vs. Team.** 2–6 teams share one simulated market: pricing, ad spend and
  quality genuinely affect each other (ad-cost inflation, customer stealing, price wars).
  Decisions are resolved simultaneously; a leaderboard updates each round; internal numbers
  stay private while market-visible signals (pricing, ads, press) are public.
- **Capstone: Exit Day.** Final valuation (transparent formula), exit paths (acquisition
  offers, raise-and-grow, lifestyle business, wind-down) and an auto-generated investor memo.
- **Teacher Tools.** One click generates a grading rubric with evidence, per-team debriefs
  (best/worst decision), and a printable case study with discussion questions.
- **Persistence.** Autosaves to the browser; export a save file or a running text log to
  resume next class period exactly where you left off.

## Project layout

```
index.html            app shell
css/styles.css        styling
js/
  main.js             boot + screen router
  util.js, rng.js     money math/formatting, seeded RNG
  glossary.js         business term definitions (tooltips + rubric vocab scan)
  industries.js       industry presets: margins, CAC, startup costs, valuation multiples
  state.js            game/business state shapes + save/load/export
  engine.js           core monthly simulation (freedom-principle resolution, guardrails)
  actions.js          free-text action parsing + clarifying questions + effect bundles
  events.js           random event engine
  advanced.js         P&L, balance sheet, fundraising, cap table, competitors
  team.js             shared-market team-vs-team resolution + leaderboard
  teacher.js          teacher scenario mode + counterfactuals
  exitday.js          valuations, exit offers, investor memo
  reports.js          status reports, running log, rubric/debrief/case-study generators
  ui/                 screens: home, wizard, dashboard, team mode, exit day
tests/engine.test.mjs headless engine tests (node --test)
docs/MASTER_PROMPT.md the original master prompt this app implements
```

## Tests

```bash
npm test               # runs headless simulation-engine tests with node --test
```

## Classroom tips

- Run one mode per session; you can start Beginner and replay the same unit in Advanced.
- Use **Export save / log** at the end of class and **Import** next period to continue.
- If anything feels off mid-game, the teacher can open the action console and type a
  correction (e.g. "adjust: growth seems too high") — or simply discuss it as a class.
- Remind students: they can try *anything*, and the simulation will always show the
  realistic result — including when a bold idea backfires. That tension is the point.
