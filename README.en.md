# Security Scheduler · 保全排班工具

> A side project showcasing **PM × AI collaboration** — from a 30-minute user interview to a shipped product in ~6 hours.

**Language**: English (this page) · [中文](./README.md)

🔗 **[Live Demo](https://basil-guard-scheduler.vercel.app)** · [GitHub](https://github.com/) <!-- TODO: add GitHub repo link -->

![Hero screenshot](./docs/hero-matrix.png)

---

## TL;DR

|  |  |
|---|---|
| **User** | A family member of mine, a senior security supervisor |
| **Pain** | 1–2 hrs/month spent manually scheduling in Excel, 6 rules to juggle, full re-do whenever someone takes leave |
| **Investment** | 30-min interview + 6 hrs of development (1h planning / 3h UI / 2h implementation) |
| **Output** | Auto-scheduling, rule validation, swap wizard, typhoon-day handling, Taiwan holiday API |
| **Quality** | Full-year 2026 benchmark across 12 months: hard violations **0/12**, hour spread ≤12h **12/12** |
| **Feedback** | *"It works. I no longer have to think about scheduling — I just review before sending it out."* |

---

## 1. The Problem

A family member of mine is a senior security supervisor who spends **1–2 hours every month** building next month's roster in Excel. The schedule has to satisfy 6 rules (max consecutive workdays, post rotation, weekend alternation, hour balance, ...), all easy to get wrong by hand. Worse: any mid-month leave request can force a re-do of the entire second half of the month.

This is a textbook automation candidate: **high-frequency × well-defined rules × repetitive labor**.

## 2. My Approach

### A 30-minute interview → a verifiable spec

I sat down with the user for 30 minutes and pinned down:

- 6 hard rules (consecutive days, post rotation, weekend alternation, hour balance, post fairness, ...)
- 7 posts with different hour values (weekday A/B/C 10h, D/E 12h; weekend F/G 12h)
- Special handling for typhoon days (cancel A/B/C, reassign D/E to F/G)
- The "swap" workflow: someone needs unexpected leave → find a substitute → agree on a payback date

### 6 hours of development

| Phase | Time | Content |
|---|---|---|
| Planning | 1h | Spec, tech choices, task decomposition |
| Implementation | 2h | Scheduling algorithm, rule validator, swap system, localStorage |
| UI/UX | 3h | Design tokens, matrix + calendar dual views, swap wizard, warm design system |

> Note that **UI took half the time — but not because the product needed it**. This is an internal-use tool; the user only cares whether it solves the problem, and the functional core was done in 2 hours. The extra 3 hours on UI were a personal experiment: Claude Design had just launched, and I used this project as an opportunity to test "how far AI can go beyond pure code logic, into UI and visual design."
>
> In other words, this side project served two purposes for me: **a scheduling tool for the user, and an AI-collaboration sandbox for myself**.

## 3. Three Key PM Decisions

### a. Pure frontend + localStorage, no backend

Only one user. No accounts, no collaboration, no cloud sync needed. Cutting the backend is what made it possible to ship in 6 hours instead of 6 hours of auth plumbing. **Scope control is PM work.**

### b. Wrote a custom CSP backtracker instead of using an off-the-shelf LP solver

Scheduling is a textbook constraint satisfaction problem and mature solvers exist. I chose to write my own because:

- **Explainability**: When the schedule violates something, I need to point at "rule #N" specifically. Black-box solvers don't do this well.
- **Custom rules**: Some of the 6 rules are soft constraints (e.g. hour spread ≤12h). General-purpose solvers don't always model these naturally.
- **Performance was never the bottleneck**: At 6 people × 30 days, random-restart backtracking solves in 50–200ms.

Validated: 12-month benchmark — 0 hard violations, 100% pass on soft constraints.

### c. Swaps are "minimal-edit", not "re-run the whole month"

The naïve approach to a swap is to re-run the scheduler. But that scrambles every shift in the rest of the month — the user has memorized next week's schedule, may have already requested leave around it. The cost of a full reshuffle is enormous in human terms.

So I modeled swaps as a **constrained problem**: lock all shifts before the borrow date + the 4 cells of the borrow/payback days as a baseline, then the algorithm only searches inside that envelope. **The fewer cells that move, the better** — that's the user's mental model, not just a technical convenience.

![Swap drawer](./docs/swap-drawer.png)

## 4. The AI Collaboration Method

9 years as a PM. Almost all the code in this project was produced by Claude. My role was: **defining the problem, designing the acceptance criteria, making technical decisions, and judging trade-offs**. AI flattens the implementation barrier, but not the judgment one. What I actually did:

- **Defined acceptance criteria**: 12-month benchmark + 27 unit tests. If AI output doesn't pass the benchmark, redo. **Don't let AI grade itself.**
- **Decomposed tasks**: Every prompt was sized to "one commit" (30–60 min, independently verifiable)
- **Made the trade-offs**: The 3 decisions above are PM work — AI won't make them for you
- **Designed the UX**: Design tokens, interaction flow, copy tone — all PM perspective

## 5. Outcome

- **Live**: [basil-guard-scheduler.vercel.app](https://basil-guard-scheduler.vercel.app)
- **Algorithm quality**: Full-year 2026 benchmark, 0/12 hard violations, 12/12 hour spread ≤12h
- **User feedback**: *"It works. I no longer have to think about scheduling — I just review before sending it out."*
- **Codebase**: ~5,500 lines of TypeScript / 31 components / 27 unit tests

## 6. What I Learned

1. **The PM's value is in defining the problem and the acceptance criteria.** AI flattens the implementation barrier but not the judgment one.
2. **A real user is 10× more important than I expected.** Without one, scope expands without bound.
3. **AI's maturity varies wildly across domains.** AI is rock-solid at writing program logic, but UI / visual design only caught up recently (Claude Design and similar tools). Side projects are the best sandbox for a PM to test these boundaries.
4. **Acceptance criteria must be machine-checkable.** Benchmarks and unit tests are the leash that keeps AI on track — without them, AI keeps producing plausible-but-wrong code.

---

## Tech Spec

### Stack
- **Frontend**: React 19 + TypeScript + Vite
- **Styling**: Custom design tokens (CSS variables)
- **Storage**: localStorage (frontend only, no backend)
- **Deployment**: Vercel
- **External data**: Taiwan public holiday API (api.pin-yi.me)

### Scheduling Rules

| # | Rule | Type |
|---|------|------|
| 1 | Max 6 consecutive workdays | Hard |
| 2 | No same post on adjacent days | Hard |
| 3 | Weekend day alternation (Sat ↔ Sun) | Hard |
| 4 | Weekend post alternation (F ↔ G) | Hard |
| 5 | Monthly hour spread ≤12h per person | Soft |
| 6 | Per-post assignment spread ≤1 | Soft |

### Posts

| Post | Type | Hours |
|------|------|-------|
| A / B / C | Weekday | 10h |
| D / E | Weekday | 12h |
| F / G | Weekend | 12h |

### Algorithm
- **Method**: Random-restart CSP backtracking (mulberry32 seedable RNG)
- **Phase 1**: `calcTargetCounts` — assign quotas per post in order
- **Phase 2**: N attempts, each does day-by-day backtracking (dynamic most-constrained-first)
- **Objective** (lexicographic): hard violations → hour over-quota → post over-quota → hour spread → sum of post spreads

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Tests

```bash
npm test                  # 27 unit tests
npm test -- benchmark     # Full-year 2026 benchmark
```
