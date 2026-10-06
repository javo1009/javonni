# Ascent — UX & UI Design Spec

> **Note:** the visual design and navigation were replaced by the dark navy/cyan top-tab design of the sample study tracker. See [`TRACKER-CONCEPT.md`](TRACKER-CONCEPT.md). The accessibility and interaction principles here still apply.

**Draft v0.1 · 2026-10-06** · Companion to [`PLAN.md`](./PLAN.md)

Scope: experience principles, information architecture, design system, signature visuals, key screens with wireframes, interaction patterns, accessibility, and how we'll validate the design. Visual values are a starting point to be tested with real users (§8), not a final brand.

---

## 1. Experience principles

| # | Principle | In practice |
|---|---|---|
| 1 | **One clear "today"** | Students open the app to 2–4 concrete tasks and a time budget, not a menu. Everything else is one tap away. |
| 2 | **Progress has a shape** | The curriculum is a map, not a checklist. Topics are sized by exam weight, LOS are the dots inside, colour is mastery. Students see where the points are and where they are weak. |
| 3 | **Exceptions first (teacher)** | The teacher's home answers "who needs me?" before it shows any chart. Charts are for drilling in, not for greeting. |
| 4 | **Honest, not alarming** | Behind-plan states offer recovery options, not red banners. Readiness is a range with evidence, never a fake-precise number. |
| 5 | **Fast and keyboard-friendly** | Command palette, practice shortcuts, optimistic updates, autosave. A student with 20 minutes on a commute should get 15 of them as learning. |
| 6 | **Accessible by default** | WCAG 2.2 AA, colour-independent status, reduced-motion support, usable one-handed on a phone. |

---

## 2. Information architecture

**Student** (mobile-first: bottom tab bar on phones, left rail on desktop)

```
Today ─ Plan ─ Map ─ Practice ─ Homework
  │       │      │       │          └ Inbox · Submitted · Feedback
  │       │      │       └ Drills · Mixed review · Flashcards · Mock exams · Mistakes · Calculator drills
  │       │      └ Topics → Modules → LOS (notes, resources, Q&A)
  │       └ Week · Month · Phases · Recovery options · Time log
  └ Tasks · Countdown · Readiness · This week
(⌘K: search LOS, jump anywhere, start a drill, log time)  ·  Profile & settings
```

**Teacher** (desktop-first: left sidebar, responsive down to tablet)

```
Cockpit ─ Classes ─ Homework ─ Question bank ─ Insights ─ Messages
   │         │          │            │             └ Heatmap · LOS gaps · Item analysis · Reports
   │         │          │            └ Browse by LOS · Author · Review queue
   │         │          └ Builder · Active · Grading queue · Archive
   │         └ Roster · Groups · Plan template · Schedule
   └ Needs attention · KPIs · Today's deadlines
```

**Admin / content** adds Curriculum (import, versions, diff), Coverage report, Roles and org settings.

---

## 3. Design system

### 3.1 Colour tokens

Defined as CSS variables, with light and dark themes. Numbers below are contrast ratios I computed against the page surface (WCAG formula).

| Token | Light | Dark | Use | Contrast (text tokens) |
|---|---|---|---|---|
| `--canvas` | `#F5F7FA` | `#0A111A` | App background | |
| `--surface` | `#FFFFFF` | `#0E1722` | Cards, panels | |
| `--ink` | `#0B1F33` | `#E8EEF5` | Primary text | 16.7 / 15.4 |
| `--ink-2` | `#4A5B6E` | `#9FB0C3` | Secondary text | 7.0 / 8.1 |
| `--brand` | `#0F6F6A` | `#4FC3BB` | Primary actions, focus, links | 6.0 / 8.5 |
| `--warn` | `#9A4A00` | `#F0A24B` | Due soon, slipping | 6.3 / 8.6 |
| `--risk` | `#B42318` | `#FF8A7E` | At-risk, overdue | 6.6 / 7.9 |
| `--good` | `#1A7F4B` | (derive) | On track, done | 5.0 |

All text tokens clear WCAG AA (≥4.5:1) on their own surface. Dark `--good` is TBD in M0.

**Mastery scale** (one hue, light → dark, so it's safe for the common colour-vision deficiencies):

| Step | Hex | Meaning |
|---|---|---|
| `m0` | `#E5EAF1` | Not started, drawn with a diagonal hatch |
| `m1` | `#BFE3E0` | Studied |
| `m2` | `#7CC6C0` | Practiced, still building |
| `m3` | `#2F9E98` | Getting there |
| `m4` | `#0F6F6A` | Proficient |

**Known limitation, handled in the design:** `m0`–`m2` are 1.2–2.0:1 against a white surface, below the 3:1 needed for non-text indicators. So every mastery cell gets a 1px `--ink-2` outline, and never relies on fill alone. It also carries a second cue: hatch for not-started, a numeric label or tooltip, and a dot for `review_due`. Red/green is never the only signal.

Final values get re-validated with a contrast and colour-blind-simulation check in M0. Chart colour decisions should follow the project's `dataviz` skill.

### 3.2 Typography

- **UI:** Inter (variable), with `font-variant-numeric: tabular-nums` for every figure so tables and gauges don't jitter.
- **Display moments** (greeting, exam countdown): a refined serif such as Fraunces, used sparingly.
- Scale (px): 12 · 14 · 16 · 20 · 24 · 32 · 44. Body 16 on mobile, 14 allowed in dense teacher tables. Line height 1.5 body, 1.2 headings.

### 3.3 Space, shape, motion

- 4px base grid. Radius 8 (controls) / 12 (cards) / 20 (hero panels).
- Elevation: borders first, shadows only for overlays and drag states.
- Motion tokens: 120 ms (micro), 200 ms (panels), 320 ms (page-level), ease-out for entrances, ease-in-out for moves.
- `prefers-reduced-motion`: replace transitions with instant state changes. Never animate essential information only.

### 3.4 Core components

App shell, command palette, task card, progress ring, readiness gauge, stat tile, mastery cell / tile, curriculum treemap, heatmap grid, burn-up chart, week calendar (drag to reschedule), timer, question card, option list, flag/navigator rail, rubric editor, feedback thread, empty state, toast with undo, data table (sort, filter, sticky header, keyboard nav), avatar stack, segmented control, bottom sheet.

---

## 4. Signature visuals

| Visual | What it shows | Design notes |
|---|---|---|
| **Curriculum map** | Treemap of the 10 topics, area ∝ exam weight midpoint; inside each, one cell per LOS coloured by status | Hover/tap shows LOS code, status, last practiced; click drills in. A list view toggle gives screen-reader users an equivalent. |
| **Readiness gauge** | Readiness index as a band (e.g. 58–66) with a 6-week sparkline and "evidence: moderate" | Never a single decimal. Tapping shows the topics pulling it down. |
| **Plan burn-up** | Cumulative planned vs actual hours, with the "required pace" line to exam day | Gap shaded with `--warn`, not red. Click opens recovery options. |
| **Cohort heatmap** | Students × 10 topics. Cell = mastery with evidence hatch | Sort by any column. Click a cell for LOS drill-down. Sticky row/column headers. |
| **Mock report** | Topic scores vs weights, time-per-question strip, flagged/guessed items | Strip chart shows pacing problems at a glance. |

**Chart rules:** label directly instead of using legends where possible. Axes start at zero for bars. Every chart has a table alternative (toggle). Tooltips work on focus as well as hover. No more than 5 categorical colours on one chart.

---

## 5. Key screens

### 5.1 Student — Today (home)

```
┌────────────────────────────────────────────────────────────────┐
│ Ascent     Today  Plan  Map  Practice  Homework        ⌘K   ◐  │
├────────────────────────────────────────────────────────────────┤
│ Good evening, Dana                     ┌─ 118 days to exam ───┐│
│ ● On track  (+1.5 h ahead)             │ Readiness  58–66  ▁▂▄▅││
│                                        │ Evidence: moderate    ││
│ TODAY · 2 h 15 min                     │ Coverage  X of N LOS  ││
│ ┌────────────────────────────────────┐ └───────────────────────┘│
│ │ ① Read · FSA – Inventories · 45 m  │  THIS WEEK               │
│ │   ○ LOS a  ○ LOS b  ○ LOS c        │  ▓▓▓▓▓▓░░░░  9 / 14 h   │
│ │                       [ Start ▶ ]  │                          │
│ ├────────────────────────────────────┤  DUE SOON                │
│ │ ② Practice · 12 Qs · Inventories   │  ▸ Homework 3 · tomorrow │
│ ├────────────────────────────────────┤  ▸ Review: 14 cards      │
│ │ ③ Flashcards · 14 due        10 m  │                          │
│ └────────────────────────────────────┘  NEEDS ATTENTION         │
│  [ + Log study time ]  [ Skip today ▾ ] ▸ Ethics: low evidence   │
└────────────────────────────────────────────────────────────────┘
```

- First card is the primary action and is already sized to the time the student said they have.
- "Skip today" asks for a reason (sick / busy / low energy) and triggers a gentle re-plan, not guilt.
- Completing a task gives a quiet progress-ring fill and, on the first completion of a week, a restrained celebration.

### 5.2 Student — Curriculum map

```
┌ Map ─────────────────────────────────  [ Map | List ]  Filter ▾ ┐
│ ┌──────── Ethics ──────────┐ ┌───── FSA ─────┐ ┌─ Equities ──┐  │
│ │ ▓▓▒▒░░▓▓▒▒▓▓  (LOS dots) │ │ ▓▒▒░░▓▓▒░░▓▓  │ │ ▒▒░░▓▒░░    │  │
│ │ 62% proficient           │ │ 41%           │ │ 28%         │  │
│ └──────────────────────────┘ └───────────────┘ └─────────────┘  │
│ ┌ Fixed Inc ┐ ┌ Quant ┐ ┌ Portfolio ┐ ┌ Econ ┐ ┌ Corp ┐ ┌ ... ┐  │
│                                                                  │
│ ▸ Selected: FSA · Inventories · LOS c  [calculate]               │
│   Status: practiced · mastery 0.64 · 5 attempts · last 3 days ago│
│   Why this colour?  ✓✓✗✓✗ (last 5)                               │
│   [ Practice this LOS ]  [ Add note ]  [ Ask in Q&A ]            │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Student — Plan (week view)

Week calendar with task blocks coloured by type (read, practice, review, mock). Drag to reschedule, resize to change duration. A burn-up strip sits above the calendar. When behind, a calm banner reads "You're 6 h behind plan" with **Choose how to catch up** that opens three options, each with a one-line trade-off. Nothing changes until the student picks.

### 5.4 Student — Practice session and mock exam

- **Practice:** one question per screen on mobile; question left, options right on desktop. Shortcuts: `A/B/C` answer, `F` flag, `N` next, `E` explanation. After answering: result, explanation, linked LOS, "add to mistakes" with reason chips.
- **Mock exam:** distraction-free chrome (no nav), session timer, question navigator rail with flag/answered states, "review flagged" before submit, autosave indicator ("Saved ✓"). If the connection drops, a banner shows "Offline, your answers are safe" and answers queue locally.
- **Post-mock:** topic breakdown vs weights, pacing strip, "turn these 23 mistakes into a review set" in one tap.

### 5.5 Student — Homework

Deadline-sorted inbox with status chips (Not started / In progress / Submitted / Graded / Resubmit). The detail view shows the instructions, items, autosaved draft, and for file tasks a drag-and-drop zone with progress. After grading, the feedback view puts the score first, then per-item feedback with a **Review this LOS** link.

### 5.6 Teacher — Cockpit

```
┌ Class: Evening A (24)        Exam: Feb window    [ Message ▾ ] ┐
├─────────────────────────────────────────────────────────────────┤
│ NEEDS ATTENTION (5)                    CLASS PULSE              │
│ ● Dana K.   Inactive 6 days            Readiness   54–62  ▲ +2  │
│   [ Nudge ] [ Open ]                   Plan adherence   71%     │
│ ● Omar T.   Missed 2 homeworks         HW on-time      83%      │
│   [ Nudge ] [ Open ]                   Active this wk  21 / 24  │
│ ● Lina S.   Readiness flat 3 wks                                │
│ ...                                    DUE THIS WEEK            │
│                                        ▸ HW 4 — 17/24 submitted │
│ HEATMAP            Eth Qnt Eco FSA Cor Eqt FI  Der Alt Pfl     │
│ Dana K.            ▓▓  ▒▒  ▒▒  ░░  ▒▒  ░░  ░░  ░░  ░░  ░░     │
│ Omar T.            ▓▓  ▓▒  ▒▒  ▒▒  ▓▒  ▒▒  ░░  ░░  ░░  ▒▒     │
│ ...  Class avg     ▒▒  ▒▒  ▒▒  ▒▒  ▒▒  ░░  ░░  ░░  ░░  ░░     │
│ Teach next: Equities (class avg low, high weight)  [ Plan it ]  │
└─────────────────────────────────────────────────────────────────┘
```

- "Needs attention" always leads. Each row shows the **evidence** ("no activity since Mon, plan 4 h behind") and a one-click nudge with an editable template.
- "Teach next" is a suggestion computed from class mastery × topic weight, with the reasoning visible.

### 5.7 Teacher — Assignment builder

```
┌ New homework ───────────── Step 2 of 4: Content ─────────────┐
│ Title  [ Inventories & Long-lived Assets          ]           │
│ Build from ▸ [● LOS scope] [○ Hand-pick] [○ Custom/File task] │
│ LOS: [FSA › Inventories ✕] [FSA › Long-lived assets ✕] [+]    │
│ Count [12]  Difficulty [easy ▮▮ med ▮▮▮ hard ▮]  [ Assemble ] │
│ ┌ Preview (12) ──────────────────────────────────────────┐   │
│ │ 1  ▸ LIFO vs FIFO COGS …    med  swap ⇄  remove ✕        │   │
│ └────────────────────────────────────────────────────────┘   │
│ Coverage: 5 of 6 selected LOS covered      [ Back ] [ Next ]  │
└───────────────────────────────────────────────────────────────┘
Steps: Basics → Content → Targets & schedule → Review & assign
```

The coverage line makes sure an assignment actually exercises the LOS the teacher picked. Targets step: whole class, a subgroup, or individuals. Schedule includes due date, late policy, show-answers rule, and attempts.

### 5.8 Teacher — Grading queue

Two-pane: submission list on the left (filter: ungraded, late, resubmitted), the answer plus rubric on the right. Keyboard: `J/K` next/previous, `1–4` rubric levels, `⌘↵` save and next. "Apply this comment to similar answers" for bulk feedback.

### 5.9 Teacher — Student 360

Header with readiness band, adherence, hours, last active, and a private teacher note. Tabs: Overview (burn-up, mastery by topic) · Homework (table) · Mocks (trend) · Activity (timeline) · Messages.

### 5.10 Admin — Curriculum and coverage

Importer with a **diff view** (added / removed / reworded LOS) before publishing a new version. Coverage report: a table of LOS with counts of questions, flashcards, and plan tasks. Red rows are below the minimum. Click through to author the missing item.

---

## 6. Interaction patterns

- **Command palette (⌘K):** "inventories" → LOS, module, drill, flashcards. "log 45m" → time entry. "assign" → the builder (teacher).
- **Optimistic UI + undo:** ticking tasks, rescheduling, nudging. Toasts with **Undo**.
- **Autosave** everywhere that is typed or answered.
- **Empty states** teach: they say what the screen is for and offer the next action ("No homework yet. Your teacher will post it here.").
- **Microcopy tone:** supportive and specific. "You're 6 h behind. Here are three ways to catch up" beats "You're falling behind!"
- **Notifications:** one daily digest by default, quiet hours, per-channel control. No streak-shaming. Streak reminders are opt-in.
- **Gamification** is restrained: badges for mastering a topic or finishing a mock, not for raw time. Class leaderboards are off by default and opt-in per student.
- **Loading:** skeletons shaped like the final content. Heavy teacher views load progressively (KPIs first, heatmap after).

---

## 7. Accessibility and responsiveness

| Area | Requirement |
|---|---|
| Standard | WCAG 2.2 AA; verified with axe in CI plus manual screen-reader passes (NVDA/VoiceOver) on onboarding, Today, practice, mock, homework, grading. |
| Colour | Status never colour-only (hatch, icon, label). Mastery fills get outlines (see §3.1). |
| Keyboard | Every action reachable; visible 2px `--brand` focus ring with offset; logical order; no keyboard traps in modals. |
| Targets | ≥ 44×44 px touch targets on mobile. |
| Motion | `prefers-reduced-motion` honoured. No flashing. |
| Charts | Table alternative and text summary for each chart. Treemap has a list view. |
| Text | Resizable to 200% without loss; no fixed-height text containers. |
| Time limits | Mock exam timer is part of the task. Everything else has no time limits. Extra-time accommodation setting per student (teacher-granted). |
| Breakpoints | 360 / 768 / 1024 / 1440. Student app is designed at 360 first. Teacher tables scroll horizontally in a region, never the page. |
| Localisation | RTL-safe layout. Strings externalised. Number and date formats follow the user's locale. |

---

## 8. Validating the design

1. **Clickable prototype** (Figma or coded) for the five core flows: onboarding → Today → practice, plan recovery, homework submit, teacher assign → grade, teacher cockpit triage.
2. **Usability tests** with 5 candidates and 2–3 teachers, using the same task script:

| Task | Pass criterion |
|---|---|
| "What should you study today?" | Correct within 5 s |
| "Are you on track? What would you do if not?" | Finds recovery options without help |
| "Find your weakest topic and practice it." | ≤ 3 taps/clicks |
| *(teacher)* "Which student needs help most, and why?" | ≤ 30 s |
| *(teacher)* "Send homework on inventories to students weak there." | Completed unaided in < 3 min |

3. **Design QA gates per milestone:** contrast and colour-blind simulation, keyboard-only run-through, 200% zoom, mobile 360 px review, dark mode review.
4. **Instrument and iterate:** time-to-first-action on Today, plan-recovery uptake, homework on-time rate, teacher time-to-insight. Review after the first beta cohort.
