# Ascent — CFA® Level I Prep & Tracking Platform

> **Note:** the product was rebuilt around a module-level study tracker (102 official modules, hours, mocks, file-based homework). Where this plan talks about learning-outcome (LOS) tracking, generated daily plans or mastery levels, [`TRACKER-CONCEPT.md`](TRACKER-CONCEPT.md) is the current design.

**Product & technical plan · draft v0.1 · 2026-10-06**
Working title "Ascent" is a placeholder. Don't put "CFA" in the product or domain name until trademark rules are checked (see §7.4).
Companion doc: [`UX-DESIGN.md`](./UX-DESIGN.md) (design system, screens, wireframes).

---

## 0. TL;DR

A web platform with three pillars:

1. **Curriculum coverage.** Every 2027 Level I Learning Outcome Statement (LOS) is a trackable object. Each student has a live status per LOS: not started → studied → practiced → proficient → review due.
2. **Plan execution.** Each student gets a study plan built from their exam date and weekly availability. They log study time, tick off tasks, and get an honest "on track / behind" signal with options to recover. The plan re-plans when they slip.
3. **Classroom.** Teachers see cohort and individual performance, exceptions first. They send homework to a class, a subgroup or one student. They get submissions back, grade them and return feedback.

Extras that earn their place: diagnostic test, spaced-repetition flashcards, mistake notebook, full mock-exam simulator, calculator drills, Q&A per LOS, calendar sync, nudges, and (later) a grounded AI study assistant.

**Two things I need from you before build starts** (details in §2 and §8):

| Blocker | Why it matters |
|---|---|
| The **official 2027 Level I topic outline PDF** (it lists every LOS) | I could not read it. The sandbox blocks `cfainstitute.org`, and the third-party sources disagree on weights and module counts. I won't hard-code several hundred learning outcomes from memory. The platform imports them instead. |
| A decision on **who writes the question bank** | Practice and homework depend on original questions mapped to LOS. This is the real critical path, not code. |

---

## 1. Goals, users, non-goals

### 1.1 Measurable goals

| # | Goal | Target |
|---|---|---|
| G1 | LOS coverage | 100% of 2027 Level I LOS exist in the system. Each has ≥1 plan task, ≥1 flashcard where applicable, and ≥N practice questions (MVP N=3, v1 N=8). |
| G2 | Student clarity | A student answers "what do I do today, and am I on track?" in <5 s from app open. |
| G3 | Teacher clarity | A teacher answers "who is falling behind, and on what?" in <30 s. |
| G4 | Homework loop | Teacher assigns, student submits, teacher grades and returns in one product, with no spreadsheets. |
| G5 | Honest forecasting | Readiness index tracks mock-exam results (calibrated after the first cohort; see §4.3). |

### 1.2 Users

| Persona | Needs |
|---|---|
| **Student** (often a working professional studying evenings and weekends, often on a phone) | A clear "today", visible progress, quick practice, forgiving re-planning. |
| **Teacher** | Exception-first dashboard, fast assignment creation, a grading queue, one-click nudges. |
| **Academy admin / content editor** | Import and version the curriculum, author and QA questions, see coverage gaps, manage classes. |
| *(v2)* **Sponsor / employer** | Consented, aggregate progress reports only. |

### 1.3 Non-goals (v1)

- Replacing the official curriculum text or video. We link to and reference readings; we don't republish them.
- Proctoring, payments and marketplace.
- Levels II and III. The schema carries a `level` and `curriculum_version`, so adding them later is data, not a rewrite.

---

## 2. 2027 curriculum — fact base and what's unverified

**Principle: curriculum is data.** Topics, modules, LOS, weights and exam-format parameters live in versioned tables. They are seeded by an importer from the official outline. Nothing is hard-coded, so a mid-cycle curriculum erratum is a data update.

| Statement | Status | Source |
|---|---|---|
| 2027 curriculum applies to exams from the **February 2027** window. | Official | [CFA Institute press release](https://www.cfainstitute.org/about/press-room/2026/cfa-institute-announces-updates-to-cfa-program-curriculum) |
| Updates concentrate on **Quantitative Methods** and **Equity Investments** (about 25% of the Level I exam). | Official (search snippet) | same |
| New learning module on **financial data science, AI and LLMs**. Expanded estimation, simulation and portfolio-optimization coverage. New "Equation Explorer" interactive tools. Practical Skills Module updates (Python, Equity Analysis, Macro Insights). | Official (search snippet) | same |
| Level I modules rise from 93 to **102**. Equities 8→12 modules. Ethics 5→10 (one per Standard). | Third-party only, unverified | See "third-party sources" below |
| Topic renames: Corporate Issuers → Corporate Finance, Equity Investments → Equities, Portfolio Management → Portfolio Construction. | Third-party only, unverified | same |
| **Topic weights unchanged:** Ethics 15–20, Quant 6–9, Econ 6–9, FSA 11–14, Corp Fin 6–9, Equities 11–14, Fixed Income 11–14, Derivatives 5–8, Alternatives 7–10, Portfolio 8–12. | **Conflicting.** Most snippets say unchanged. At least one claims Ethics 10–15, Quant 11–14, Derivatives 6–9, Alternatives 6–9. | same |

**Third-party sources consulted (search snippets only; I couldn't open the pages, so treat every row marked "third-party" as unverified):**
[Zell Education](https://www.zelleducation.com/blog/cfa-curriculum-changes-breakdown/) ·
[Quintedge](https://quintedge.com/blog/cfa-curriculum-changes-2027) ·
[FinQuiz](https://www.finquiz.com/cfa-curriculum-changes-levels-1-2-3/) ·
[SoleadeA](https://soleadea.org/cfa-exam/curriculum-changes-2027) ·
[AnalystPrep](https://analystprep.com/blog/2027-cfa-curriculum-changes/) ·
[300Hours](https://300hours.com/cfa-exam-curriculum-and-topic-weight-changes)

**Official documents to import from** (found, not readable from this sandbox):
- [2027 Level I Topic Outlines — Learning Outcomes (PDF)](https://www.cfainstitute.org/sites/default/files/2027levelitopicoutline_online.pdf)
- [Curriculum Changes for 2027 (PDF)](https://www.cfainstitute.org/sites/default/files/curriculum-update-2027.pdf)
- [2027 Level I curriculum errata notice (PDF)](https://www.cfainstitute.org/sites/default/files/docs/programs/cfa-program/candidate-resources/2027-cfa-program-level-1-notice.pdf)
- [Level I exam page](https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam), for exam-format parameters.

**Timing.** Today is 2026-10-06. The first exam window on this curriculum is Feb 2027, roughly 17–20 weeks away. To serve a Feb cohort, the MVP (plan + coverage + homework) must be usable by about mid-November. Otherwise target the next window with full v1. Plan lengths must support about 8–26 weeks, including a compressed mode.

---

## 3. Feature map

Tiers: **MVP** = needed to run a real class; **v1** = launch-quality; **v2** = after launch.

### 3.1 Student

| Feature | Tier | Notes |
|---|---|---|
| Onboarding: exam window, weekly availability grid, goals, optional diagnostic | MVP | Diagnostic seeds mastery and plan weighting. |
| **Today view**: 2–4 tasks, time budget, on-track indicator | MVP | The home screen. |
| **Study plan** (week and month calendar; drag to reschedule; phases) | MVP | See §4.2. |
| **Time logging**: start/stop timer or manual entry; focus mode | MVP | Feeds plan adherence. |
| **Curriculum map** (topics sized by exam weight, LOS-level drill-down, status colors) | MVP | The signature visual. |
| LOS checklist per module, with personal notes | MVP | |
| **Practice**: topic/LOS drills, mixed review, timed quiz | MVP | §4.4 |
| **Mastery and readiness index**, with trend and range | MVP | §4.3 |
| **Homework inbox**: due soon, submit, see feedback, resubmit | MVP | §4.5 |
| Spaced-repetition **flashcards** (formulas, definitions, standards) | v1 | FSRS scheduler. |
| **Mistake notebook** (reason tags: concept / calculation / careless / time) | v1 | Feeds the review set. |
| **Mock exam simulator** (two timed sessions, flagging, review, topic breakdown, time-per-question) | v1 | Format parameters come from config (§4.4). |
| **Calculator drills** (BA II Plus / HP 12C keystroke trainer for TVM, NPV/IRR, bond math) | v1 | Differentiator; confirm the permitted-calculator list on the official page. |
| Recovery options when behind | v1 | Student confirms every re-plan. |
| Calendar sync (ICS feed), email and web-push reminders | v1 | |
| Per-LOS Q&A threads (teacher-moderated) | v1 | |
| Streaks and badges (opt-in, restrained) | v1 | Rewards consistency and mastery, not raw volume. |
| Grounded AI study assistant | v2 | Answers only from the academy's own explanations. Guardrails in §7.3. |
| Offline PWA (flashcards, reading checklist) | v2 | |
| Study groups and accountability partners | v2 | |

### 3.2 Teacher

| Feature | Tier | Notes |
|---|---|---|
| Classes and rosters (invite link, CSV import) | MVP | |
| **Cockpit**: "Needs attention" list, cohort KPIs | MVP | Exceptions first. |
| **Cohort heatmap** (students × topics, drill to LOS) | MVP | |
| **Student 360**: plan adherence, hours, mastery trend, homework record, mocks | MVP | |
| **Assignment builder**: auto-assemble from LOS/difficulty, hand-pick, custom items, file-task, rubric | MVP | |
| Targeting: whole class, subgroup, individual | MVP | |
| **Grading queue**: auto-graded MCQ and numeric; manual rubric for text and files; inline feedback; return and resubmit | MVP | |
| Alerts (inactive, behind plan, stagnating, missed homework) with 1-click nudge | v1 | |
| Plan templates (class-wide plan the teacher edits; students adapt it) | v1 | |
| Question-level analytics (difficulty, discrimination, common wrong answers) | v1 | |
| Live-class scheduling and attendance | v1 | |
| Export (CSV grades, PDF progress report) | v1 | |
| Sponsor or employer reports (consented, aggregate) | v2 | |

### 3.3 Admin / content

| Feature | Tier |
|---|---|
| **Curriculum importer** (PDF/CSV → versioned topics/modules/LOS) with a diff view against the previous version | MVP |
| **Coverage report**: LOS with too few questions, flashcards or plan tasks | MVP |
| Question authoring: LOS mapping, difficulty, explanation, review states (draft → SME review → published) | MVP |
| Question and flashcard bulk import and export (CSV/JSON) | MVP |
| Audit log, roles, org settings | MVP |

---

## 4. Core domain design

### 4.1 Curriculum and LOS coverage (the heart of the product)

```
CurriculumVersion (2027, level=I, source_doc, imported_at)
 └─ Topic (name, weight_min, weight_max, order)
     └─ LearningModule (title, order, est_study_minutes)
         └─ LOS (code, command_word, text_ref, importance 1–3, order)
```

- `command_word` (calculate, describe, explain, compare, …) is parsed from the LOS verb. It drives question-type mix and how many attempts count as "proficient".
- **LOS text** is stored as imported. Whether we can display CFA Institute's verbatim wording is a licensing question (§7.4). Until it's settled, the data model supports a short paraphrase field and display falls back to code + title.
- **Per-student LOS status** (`los_progress`):

| Status | Rule (defaults, configurable) |
|---|---|
| `not_started` | No plan task done, no attempts |
| `studied` | The reading task for its module is marked complete |
| `practiced` | ≥ 4 questions attempted on this LOS |
| `proficient` | mastery ≥ 0.75 with evidence from ≥ 2 distinct days |
| `review_due` | was proficient, but mastery decayed below threshold or spaced-review date reached |

- **Coverage %** = LOS at `studied` or above ÷ total LOS. **Proficiency %** = LOS at `proficient` ÷ total. Both are shown separately from the readiness index.
- **Coverage guarantee (admin side):** a CI-style check fails the content build if any LOS has no plan task, no questions, or fewer than the minimum. This keeps "covers all learning outcomes" true.

### 4.2 Study-plan engine

A pure, deterministic function: `generatePlan(input) → Plan`. No LLM in the loop, so it's unit-testable and explainable.

**Inputs:** exam date, weekly availability grid with blackout dates, curriculum version, diagnostic results (optional), teacher template (optional), preferences (study time of day, session length).

**Algorithm:**
1. **Budget.** Sum available hours until the exam, minus a ~10% buffer. Show the total. Flag if it falls below the configurable benchmark (CFA Institute cites roughly 300 study hours per level; verify the current figure and make it a setting).
2. **Phases** (defaults; teacher can override):
   - Learn, about 55–60% of hours
   - Practice and review, about 25%
   - Mocks and final review, the last 3–4 weeks, about 15–20%
3. **Topic allocation.** `hours_t ∝ weight_t × difficulty_t × (1 − prior_mastery_t)`, with a floor per module so nothing is skipped.
4. **Task generation per module.** Read → LOS checklist → practice set → flashcard seeding. Add a weekly review set (spaced), a weekly quiz, a bi-weekly cumulative test and 3–4 full mocks.
5. **Scheduling.** Pack tasks into availability slots in curriculum order, interleaving Ethics and heavy-weight topics across weeks. Respect prerequisites (e.g. time value of money before fixed income or corporate finance).
6. **Re-planning** (nightly and on demand). If slippage exceeds a threshold, offer three choices and apply none without confirmation:
   - (a) add hours per week for N weeks
   - (b) compress low-weight, high-mastery topics
   - (c) flag that the target exam window is at risk
   Every revision is stored (`plan_revisions`) and the teacher is notified.

**Tests:** property-based. No overlapping tasks. Planned minutes never exceed availability. Every LOS is covered at least once. Last mock lands ≥ 5 days before the exam. Re-plan never drops a task silently.

### 4.3 Mastery and readiness engine

Per (student, LOS), a decayed Beta model:
- Prior Beta(1,1). On each answer add weight to α (correct) or β (incorrect). Weight = difficulty (0.5 / 1.0 / 1.5) × context (timed or mock ×1.2).
- At read time, decay evidence toward the prior with a half-life (default 21 days, tunable): `α' = 1 + (α−1)·2^(−Δt/h)`.
- `mastery = α' / (α' + β')`; `evidence = α' + β' − 2`.
- UI shows a mastery colour **plus** an evidence indicator. Low evidence renders as "not enough data", never as a confident colour.

**Readiness index** = Σ over topics of (topic weight midpoint × mean LOS mastery). Unseen LOS count as 0, so the number is conservative and rises with coverage. It is shown as a **range** with a trend sparkline.

**Honesty rules:**
- CFA Institute doesn't publish a fixed pass mark, so we never show "pass probability" until calibrated against real outcomes. After the first cohort's mocks, regress readiness against mock scores and report the fit.
- Flag topics below a floor (default 50% mastery) even if overall readiness is high.
- Keep the algorithm inspectable: each LOS tile has a "why this colour?" explanation listing the last attempts.

### 4.4 Practice and mock exams

- **Item types:** single-best-answer MCQ (A/B/C), numeric entry with tolerance (homework), short text and file upload (homework only).
- **Session modes:** LOS drill, topic drill, mixed/interleaved review (weights toward `review_due` and mistakes), timed quiz.
- **Mock simulator:** parameters (question count, sessions, minutes per session, break) are **config seeded from the official exam page, to be verified at build time.** My current understanding is 180 questions in two sessions of 90 questions and 135 minutes each. The simulator provides a countdown, question navigator, flag-for-review, autosave every answer (resume after a connection drop), and a post-exam report: topic breakdown vs weights, time per question, guess/flag analysis, and a push of wrong items into the mistake notebook.
- **Question metadata:** LOS mapping (1 primary + optional secondary), difficulty (initial author estimate, then empirical), explanation, formula references, review state, version history.

### 4.5 Homework workflow

```
Teacher:  Draft ─► Assigned (targets: class | subgroup | students; due date; policies)
Student:  Not started ─► In progress ─► Submitted ─► Graded ─► Returned
                                              └────────────► Resubmit requested
          (flags: Late, Excused, Extended)
```

- **Assignment composition:** auto-assemble by LOS scope, difficulty mix and count; hand-pick from the bank; add custom items; add a file-task (e.g. upload an Excel case) with rubric.
- **Policies:** time limit, attempts, show-answers rule (never / after due / immediately), late penalty or window, partial credit for numeric answers.
- **Grading:** MCQ and numeric are auto-graded on submit. Text and file items go to a **grading queue** (rubric criteria, inline comments, bulk "apply feedback to similar answers"). Teacher returns grades individually or in bulk.
- **Teacher sees:** completion funnel per assignment, score distribution, per-question analysis, who hasn't started, and a one-click reminder to non-starters.
- **Student sees:** deadline-sorted inbox, auto-save drafts, feedback with links back to the LOS to review, resubmit if allowed.
- Homework results feed mastery (with a lower weight if "open-book" is flagged).

### 4.6 Teacher analytics and alerts

- **Cohort heatmap:** rows are students, columns are topics (10), cell colour is mastery with an evidence hatch. Click a cell to see LOS-level drill-down for that topic and a "teach this next" suggestion (lowest class mastery × highest weight).
- **KPIs:** average readiness, plan adherence, homework on-time rate, weekly active, hours per student.
- **Alert rules** (configurable per class): inactive ≥ 5 days; adherence < 60% for 2 weeks; readiness flat for 3 weeks; 2 missed homeworks; mock score drop. Each alert shows evidence and a suggested action (message template). Alerts de-duplicate and expire.
- **Student 360:** timeline of activity, planned-vs-actual hours chart, mastery by topic, mock trend, homework table, notes (teacher-private).
- Snapshots are materialised nightly and incrementally on write, so dashboards load fast on class sizes of 20–500.

### 4.7 Notifications

Email and web push (optional Telegram bot, depending on audience). Types: daily plan digest, due-soon homework, graded/returned, teacher nudge, streak-at-risk (opt-in), review-due. Quiet hours, per-channel preferences, and a per-user daily cap.

---

## 5. Architecture

### 5.1 Recommended stack (one team can run it)

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One codebase for UI and API; easy to hire for. |
| UI | Tailwind + Radix primitives (shadcn-style component set), Recharts or visx for charts | Accessible primitives, themeable tokens. |
| DB | **Postgres** (managed: Supabase, Neon or RDS) | Relational model fits; **Row-Level Security** enforces role boundaries. |
| ORM / migrations | Drizzle or Prisma | |
| Auth | Supabase Auth or Auth.js (email magic link + Google; SSO later) | |
| Jobs / scheduling | pg-boss or Inngest | Re-plan, snapshots, notifications. |
| Storage | S3-compatible with signed URLs and malware scan | Homework files. |
| Observability | Sentry, structured logs, product analytics (PostHog) | |
| CI/CD | GitHub Actions → preview deploys per PR | |

The domain engines (plan, mastery, readiness, FSRS scheduling, alert rules) are **pure TypeScript packages** with no framework imports. They're fully unit-testable and could move to another runtime later.

*Alternative if the team is Python-first:* FastAPI + React front end. The domain model and engines carry over unchanged. I'd still pick the TypeScript monolith for speed.

### 5.2 Modules (modular monolith)

`identity` · `curriculum` · `content` (questions, flashcards) · `planning` · `practice` · `mastery` · `homework` · `analytics` · `notifications` · `admin`. Modules talk through typed service interfaces. No cross-module table access except via views.

### 5.3 Data model (core tables)

| Area | Tables |
|---|---|
| Identity | `organizations`, `users` (role), `classes`, `enrollments`, `class_groups` |
| Curriculum | `curriculum_versions`, `topics`, `learning_modules`, `los`, `exam_config` |
| Content | `questions`, `question_options`, `question_los`, `question_stats`, `flashcards`, `flashcard_los`, `resources` |
| Plan | `study_plans`, `plan_phases`, `plan_items`, `study_sessions`, `plan_revisions` |
| Learning state | `los_progress`, `attempts`, `card_reviews`, `mistakes`, `mock_exams`, `mock_attempts` |
| Homework | `assignments`, `assignment_targets`, `assignment_items`, `submissions`, `submission_answers`, `submission_files`, `grades`, `feedback`, `rubrics` |
| Engagement | `notifications`, `messages`, `threads`, `posts`, `badges`, `streaks` |
| Analytics | `student_daily_snapshot`, `class_topic_heatmap` (materialised) |
| Governance | `audit_log`, `consents` |

### 5.4 Access control

| Role | Can |
|---|---|
| Student | Read and write own data. See own class assignments. |
| Teacher | Read students **in their own classes only**. Create assignments for their classes. Grade their submissions. |
| Content editor | Edit curriculum and questions. No student data. |
| Admin | Org settings, roles, classes, all content. Student data access is audited. |
| Sponsor (v2) | Aggregates for consented students only. |

Enforced twice: Postgres RLS policies and a server-side policy layer. An automated test suite attempts cross-tenant and cross-class reads on every endpoint.

### 5.5 Security and privacy

- Students are told in plain language what teachers can see (consent record). Data export and deletion on request.
- Minimum PII. Encrypted at rest and in transit. Signed, short-lived file URLs. Rate limiting. Audit log on admin reads of student data.
- Uploaded files are malware-scanned and type-restricted.
- Backups with a tested restore. Secrets in the platform secret store, never in the repo.

### 5.6 Quality

| Layer | Approach |
|---|---|
| Engines | Unit and property-based tests (plan, mastery, FSRS, alert rules). |
| API and RLS | Integration tests incl. cross-class access attempts. |
| E2E | Playwright for: student onboarding → plan → practice → homework submit; teacher assign → grade → return; mock exam with a simulated network drop. |
| Accessibility | axe in CI plus manual screen-reader pass on the core flows. Target WCAG 2.2 AA. |
| Content | Every question passes SME review (a CFA charterholder or equivalent) before `published`. |
| Performance | Teacher dashboard < 2 s for 500 students (materialised snapshots). Mock exam saves each answer in < 300 ms or queues it offline. |

---

## 6. Delivery plan

Rough estimates for a small team (about 3–4 engineers, 1 designer, content writers, 1 SME reviewer). Re-estimate once the LOS count is known.

| Milestone | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **M0 Foundations** | 0–1 | Repo, CI, design tokens, auth skeleton, **curriculum importer + 2027 seed** | All LOS imported and diffed against the official outline. Design system v0 published. |
| **M1 Plan & coverage** | 1–3 | Roles/classes, onboarding, diagnostic (small), curriculum map, plan generator + calendar, time logging, Today view | A student can onboard and execute a plan. Coverage % updates. |
| **M2 Practice & mastery** | 3–5 | Question bank + authoring, practice engine, mastery and readiness, LOS checklist | Readiness updates after practice. Coverage report lists content gaps. |
| **M3 Homework** | 4–6 | Assignment builder, submission, auto-grading, grading queue, feedback, notifications | Full homework round-trip with a pilot teacher. |
| **M4 Teacher analytics** | 5–7 | Cockpit, heatmap, Student 360, alerts and nudges | Pilot teacher answers G3 in <30 s. |
| **M5 Mocks & polish** | 7–9 | Mock simulator, mistake notebook, flashcards, accessibility pass, beta with a real cohort | E2E suite green. a11y audit passed. Beta feedback triaged. |
| **M6+ v2** | 9+ | AI assistant, forum, gamification, offline PWA, sponsor reports | |

**Critical path is content.** Questions mapped to every LOS, with explanations and SME review, take longer than the code. Budget it explicitly: `LOS count × questions-per-LOS × minutes-per-question` (a rule of thumb is 20–30 minutes each including review). Start authoring at M0.

**Suggested work streams** (humans or agents; each owns a module and its tests):

| Stream | Owns |
|---|---|
| Curriculum & content lead | Importer, LOS verification, question bank, SME review |
| Domain engineer | Plan, mastery, FSRS, alert engines (pure packages) |
| Platform engineer | Auth, RLS, jobs, storage, CI, observability |
| Frontend / design-system engineer | Components, charts, student app |
| Teacher-tools engineer | Assignment builder, grading queue, analytics |
| UX designer & researcher | Prototype, usability tests, accessibility |
| QA | E2E, a11y, load, content QA |

### 6.1 Risks

| Risk | Mitigation |
|---|---|
| Curriculum details change or sources disagree | Versioned data, importer diff view, a "verify against the official outline" gate before launch. |
| IP and trademark constraints on LOS text, content and the "CFA" name | §7.4. Resolve **before** public launch. |
| Question bank is too thin or low quality | Minimum-per-LOS gate, SME review, empirical difficulty from attempts. |
| Mastery model is miscalibrated | Show ranges and evidence. Calibrate on mock data. Never promise a pass probability. |
| Teachers don't adopt it | Pilot with one teacher early (M3). Exception-first UX. CSV import. |
| Students churn when behind | Recovery options, not red alarms. Weekly reset. |
| Scope creep | MVP tier is the contract. Extras go through the feature map. |

### 6.2 Product KPIs

LOS coverage % per student; weekly plan adherence; D7/D30 retention; homework on-time rate; teacher time-to-insight; readiness-vs-mock correlation; question quality (flagged-as-wrong rate).

---

## 7. Decisions, assumptions and constraints

1. **Stack.** Assumed the TypeScript/Postgres stack in §5. Change it before M0 if your team prefers another.
2. **Languages.** UI is English-first and i18n-ready. Do you want Uzbek and/or Russian UI strings? That's cheap to add at M0 and painful later.
3. **AI assistant (v2) guardrails.** Retrieval only from the academy's own explanations and the student's notes. Cite the source LOS. Refuse to invent formulas. Log prompts for quality review. No student data to third parties without consent.
4. **Licensing and trademark.** I haven't verified CFA Institute's terms. Before launch, check its prep-provider requirements for (a) displaying LOS text, (b) referencing curriculum readings, (c) using the CFA® marks and the required trademark disclaimer. The plan avoids republishing curriculum text and uses original questions only.
5. **Exam-format parameters** (question count, session length, permitted calculators, study-hours benchmark) are config seeded from the official page and verified at build time.
6. **Hosting and data residency.** Unspecified. Matters for managed-Postgres region choice.

## 8. Open questions for you

| # | Question | My default if you don't answer |
|---|---|---|
| 1 | Can you provide the official 2027 Level I topic outline PDF, or allow `cfainstitute.org` in this environment's network settings? | Build the importer against a sample CSV format and leave seed data empty. |
| 2 | Who writes and reviews the questions? | Admin tool supports authoring and SME review states from day one. |
| 3 | Class sizes and number of teachers at launch? | 20–500 students per academy, 1–10 teachers. |
| 4 | Which exam window is the first target? | Plan engine supports any. MVP aims at the earliest feasible. |
| 5 | Do students pay through the platform? | No payments in v1. |
| 6 | Languages for the UI? | English only, i18n-ready. |
| 7 | Any existing LMS or Google Classroom/Telegram to integrate? | None. |
| 8 | Stack OK? | TypeScript/Next.js/Postgres. |
