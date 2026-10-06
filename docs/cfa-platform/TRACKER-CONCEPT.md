# Ascent: the module-level study tracker

This document supersedes the learning-outcome (LOS) planning in `PLAN.md` and `UX-DESIGN.md` where they disagree. It describes what the product is now, after it was rebuilt around the sample "CFA Level I Study Tracker" dashboard.

## The idea

A student does not need a day-by-day scheduler; they need to know, at a glance, **am I on pace, what do I read next, and what have I let slip?** The tracker answers that against the 102 official 2027 Level I modules (called *chapters* in the UI), grouped into ten topics and studied in a fixed order.

| Concept | How it works |
|---|---|
| Chapter state | Three ticks (read / practice questions done / reviewed), an optional practice score (0–100) and a confidence rating (1 shaky, 2 OK, 3 solid). Ticking *read* or *reviewed* stamps the student's local date. |
| Roadmap | Plan start → exam date is divided into topic windows in study order. Each topic gets weeks in proportion to its study-week allocation (14 weeks across the ten topics). Dates are computed, never typed in. |
| Pace | Hours logged since plan start vs the hours the weekly target implies by today. Ahead / on pace / behind, with a plain-language message. |
| Focus and next actions | The topic whose window contains today (or the first incomplete one) and the next three things to do. |
| Mock exams | Scored attempts with a trend and two deadlines (exam − 25 days, exam − 11 days). |
| Backup | Export/import in the sample dashboard's JSON format, so a student can bring their existing progress. |

## Eight features added to help students learn, not just log

All eight are computed by pure, tested functions in `src/domain/tracker.ts` and shown in the student UI.

1. **Spaced-review queue.** A chapter comes due three days after it was first read, and again 21 days after its last review. The list says what to review today and what is coming this week. Chapters restored from a backup (no read date) are skipped rather than flooding the queue.
2. **Finish forecast.** Chapters per week actually read vs the pace the roadmap needs; projects a finish date against the exam date and says how many chapters per week would close the gap.
3. **Streaks and consistency.** Current and best study-day streak, active days over the last four weeks, and how steady weekly hours are. Consistency predicts results better than occasional long sessions.
4. **Confidence and calibration.** Students rate each chapter 1–3. Where confidence and the practice score disagree, the tracker calls it out (overconfident: rated solid but scoring low; underconfident: the reverse), so revision targets the real gaps.
5. **Exam-weighted coverage.** Progress is shown both as "chapters read" and weighted by each topic's exam weight, so finishing a heavy topic counts for more than finishing a light one.
6. **Focus timer.** Start/pause/stop a session in the browser and have it logged to the hours record (15-minute minimum), removing the friction of back-filling hours.
7. **Mock trend and deadlines.** Score history with best/average/trend and the two dated checkpoints, so mocks are scheduled rather than postponed.
8. **Weak-chapter practice.** One click starts practice drawn from the chapters where the student's recorded score or platform results are weakest, preferring questions not answered recently.

Further ideas considered and left out for now: flashcards, a mistake notebook, calendar sync, nudges by email, and an AI study assistant.

## Teachers and classes

- A class has an exam date, plan start and weekly target; students inherit them and can override.
- The class overview ranks students by need: inactive, behind on hours, behind the roadmap, missed homework, mock-score drop, low practice scores. Each alert has a threshold in `src/domain/alerts.ts`, with grace periods so a newcomer isn't flagged on day one.
- Teachers can open any student in their class (read-only) to see the same tracker the student sees.

## File-based homework

1. The teacher creates homework, attaches one or more handout files and chooses what students hand in: file uploads, written answers and/or auto-marked multiple-choice questions.
2. Students download the handout, do the work offline, upload their completed files, and hand in.
3. The teacher opens each submission, downloads the files, marks each item, writes feedback and may upload marked-up files. Students see the score, comments and feedback files once the work is returned.

Files are stored in Postgres (4 MB each, allowed types sniffed by content, per-user quota) and always served through an authorization-checked route. See `DEPLOY.md` §8.

## What was removed from v1

The learning-outcome model, the generated day-by-day plan, mastery levels and the readiness index. Students' accounts, classes, enrolments and homework survive the migration; v1 progress does not.
