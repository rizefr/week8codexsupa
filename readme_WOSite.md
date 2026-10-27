# Eli's Cycle Tracker System Notes

Live site: https://week8codexsupa.netlify.app  
Repository: https://github.com/rizefr/week8codexsupa  
Primary user surface: mobile phone, during and after workouts.

This file is the consolidated operating reference for the current workout site. It does not replace `HOW_TO_USE.md` or `DEPLOY.md`; those remain the short user guide and deployment checklist.

## Current Deployment Record

- Production host: Netlify.
- Cloud database/auth: Supabase.
- This documentation was introduced after source release commit `a8e30d2aed2c2e815ef2d7c4cba8a8b335a4109f`.
- Production deploys must be verified against the live URL after every change because prior manual deploys have accidentally uploaded an empty Supabase config.
- The final report for each deployment should record the exact GitHub commit and Netlify deploy ID used for that release because direct Netlify CLI deploys are verified by deploy ID and live URL readback.

## App Overview

Eli's Cycle Tracker is a local-first workout operating system for an 8-week hypertrophy cycle that repeats indefinitely. It tracks:

- scheduled and override workouts
- set-by-set training logs
- weight, reps, seconds, RIR, assistance, cardio, notes, and completion
- body weight and optional body-fat percentage
- progress by exercise, week, cycle, and muscle group
- XP, levels, streaks, quests, weekly challenges, badges, PRs, baselines, and recap feedback
- local backups, JSON export/import, and Supabase Cloud Sync

The app must continue to work without Cloud Sync. Cloud Sync adds cross-device persistence, but local IndexedDB/localStorage is the first save target.

## Feature Map

- Dashboard: Today's Mission, next best action, Player Status, XP, Lock-In Score, Daily Quests, Weekly Challenge, streaks, recent wins, muscle focus, draft workout cards, and heat map preview.
- Today / Logger: fast mobile set logging, auto-complete sets, previous performance, schedule override, exercise help, replacement notes, target RIR, bodyweight/timed/assisted input rules, and clean completion-to-recap flow.
- Routine: full weekly routine, exercise metadata, supersets, RIR targets, notes, cardio/rest rules, progression rules, and checklist sections.
- Progress: muscle map, weekly review, XP/level chart, PR timeline, Trends by Lift, body weight trend, activity heat map, achievements, weekly workload, and cycle comparison.
- Weight: body weight logging, optional body-fat percentage, lean/fat mass estimates, trend chart, and recomp guidance.
- History: searchable/filterable workout history, draft/completed states, schedule override notes, replacement notes, and exercise result chips.
- Settings: program start/status controls, Cloud Sync sign-in, sync status, gamification toggles, Repair / Recalculate Gamification, backup snapshots, JSON import/export, and local dev sample data.
- Recap: workout result screen with XP, score, sets, quality, streak, muscle impact, quests, challenge progress, result states, coach feedback, PRs, baselines, badges, and post-workout Lock-In cue.

## Routine Assumptions

- The weekly schedule is defined in `src/data/routine.ts`.
- The default weekly routine must not be changed accidentally.
- The 8-week structure repeats by cycle:
  - cycle weeks 1-2: setup
  - cycle weeks 3-6: growth
  - cycle weeks 7-8: push
- Program week is continuous: Week 9 is Cycle 2, Week 1 of 8.
- Schedule overrides are one-day choices. They do not shift future schedule dates or program start date.
- Rest days are part of the routine and should not be penalized when a rest/recovery check-in is completed.

Future routine edits should happen primarily in `src/data/routine.ts`. Exercise metadata there drives logger fields, RIR guidance, PR logic, trend labels, muscle map contribution, supersets, and coaching copy.

## Logging Types

The app uses `ExerciseTrackingType` from `src/types.ts`:

- `weighted-reps`: weight plus reps and RIR. Dumbbell movements use `Weight (lb per DB)` unless metadata says otherwise.
- `assistance-reps`: assistance amount plus reps and RIR. Assistance is not treated as normal load.
- `bodyweight-reps`: reps and RIR/control where relevant. No load input.
- `timed`: seconds and control cue/RIR where relevant. No load or reps.
- `cardio`: duration, optional incline/speed, intensity notes, and completion. No RIR or PR load language.
- `rest-checkin`: rest, recovery, or allowed easy walk.

Auto-complete set rules are derived from the tracking type. A set only completes when the required fields for that type are valid. Existing historical fields are preserved even if newer UI no longer shows that field for the movement.

## Cloud Sync And Backup Safety

Persistence is intentionally local-first:

1. Save to local fallback and IndexedDB first.
2. If signed in and online, save to Supabase.
3. If cloud save fails, queue the local snapshot and keep local data.
4. Sync later through automatic retry or Settings > Sync now.

Data stores:

- IndexedDB database: `chad-aesthetic-dashboard`
- local fallback key: `chad-aesthetic-dashboard:fallback`
- local backup key: `chad-aesthetic-dashboard:backups:v1`
- Supabase tables: `app_settings`, `workout_logs`, `body_weight_logs`

Compatibility note: old storage names still include `chad-aesthetic-dashboard`. Do not rename them. They are compatibility keys, not user-facing branding.

Safety rules:

- Never delete or rewrite historical logs during derived-feature work.
- Never overwrite non-empty local data with empty cloud data.
- Never overwrite non-empty cloud data with empty local data.
- Preserve draft logs, completed logs, body weights, gamification settings, badge timestamps, recap seen IDs, schedule override fields, and backup snapshots.
- Do not change Supabase schema unless a user-approved migration is required.

## Coach And Gamification Logic

Coach feedback is deterministic and local. No external AI API is called.

Key modules:

- `src/lib/coach.ts`: exercise-specific feedback, exercise help, weekly focus, dashboard cues, body composition summary, trend direction, and next best action copy.
- `src/lib/gamification.ts`: XP events, levels, streaks, execution score, daily activity, achievements, player status, quests, weekly challenge, PRs, baselines, result states, and workout recap.
- `src/lib/muscles.ts`: muscle scoring, mastery states, muscle labels, weekly focus, and muscle-map detail data.
- `src/components/RestTimer.tsx`: a non-blocking app-shell rest timer launched when valid reps/seconds are first recorded, with reset, +/-30 seconds, session mute, vibration, and a centered repeating alarm that stops only when dismissed.
- `src/lib/readiness.ts`: ranked short-on-time options, structured joint/form flag patterns, conservative deload assessment, and the read-only next-workout briefing. Every training day has three ranked cuts plus an all-selected exercise checklist; applied cuts use the existing workout-only skip state and remain excluded from completion, volume, PRs, trends, progression, muscle scoring, and XP.
- `src/components/Toasts.tsx`: reduced-motion-safe, dismissible PR, badge, and level feedback.

Short-on-time rankings do not label an exercise universally "ineffective." They preserve the routine's priority exercises and unique muscle work, then rank redundant accessory volume by the cost of removing it from this exact week. The evidence basis includes the [2026 ACSM resistance-training position stand](https://pubmed.ncbi.nlm.nih.gov/41843416/), [exercise-order meta-analysis](https://pubmed.ncbi.nlm.nih.gov/32077380/), [weekly-volume and direct/indirect-set meta-regression](https://pubmed.ncbi.nlm.nih.gov/41343037/), and research on [adding single-joint work to multijoint programs](https://pubmed.ncbi.nlm.nih.gov/30662699/). These sources support prioritization and diminishing-return reasoning; they do not prove a universal ranking for every person.

The game layer rewards correct execution:

- completing scheduled/performed workouts
- logging all required set fields
- respecting rest/recovery days
- maintaining daily check-ins without making rest days into lifting days
- logging body weight 2-4 times per week
- hitting real PRs after a baseline has been established
- holding steady when recovery, pain, or RIR patterns suggest caution

It does not intentionally reward:

- duplicate same-day workout farming
- extra junk volume
- hard cardio when the plan says easy
- bodyweight/timed/cardio fake load PRs
- unsafe failure on higher-risk compounds

## Exercise Matching Rules

The app separates broad metadata matching from strict performance comparison.

Broad matching:

- `canonicalExerciseKey(...)`
- used for exercise help, family-level metadata, aliases, and coaching context where broad movement family is intentional

Strict comparison:

- `comparisonExerciseKey(...)`
- `exerciseComparisonMatches(...)`
- `exerciseSessions(..., { matchMode: "strict" })`
- used for previous performance, PRs, baselines, result states, trend comparisons, recap comparisons, and coach last-vs-previous analysis

Strict matching policy:

- match exact exercise ID when available through metadata
- match exact normalized display name
- match explicit `comparisonAliases` only
- prefer no previous match over a wrong previous match
- do not match by row index, workout day, target muscle, partial name, or broad canonical family

Allowed strict aliases currently include:

- `DB Romanian Deadlift` with `RDL`, `Romanian Deadlift`, `DB RDL`, `Dumbbell RDL`
- `Lying DB Triceps Extension` with `DB Skullcrusher`, `Dumbbell Skullcrusher`, `Skullcrusher`

Examples intentionally not matched:

- `DB Lateral Raise` vs `DB Lateral Raise Mechanical Set`
- `Feet-Elevated Push-Up` vs `DB Squeeze Press`
- `Assisted Pull-Up` vs `Assisted Pull-Up Technique/Pump`
- `Chest-Supported Incline DB Row` vs `One-Arm DB Row`

If no confirmed prior session exists, the UI should say `No confirmed previous session` rather than showing data from a different movement.

## Next-Workout Readiness

The next-workout briefing is derived and read-only. It never fills, completes, skips, or changes a workout. It combines strict comparable prior sessions, prior saved notes, explicit structured joint/form flags, and the routine's own recovery rules.

- Short-on-time options are limited to the routine's existing `When To Reduce Volume` order. Main lifts are not silently removed.
- One poor session does not trigger a deload recommendation.
- A deload assessment needs at least three completed sessions and at least two independent routine-defined signals. With one supported signal, the app says to watch and hold progression.
- Joint discomfort and form breakdown are recorded only when the user explicitly checks them or wrote an unambiguous historical note. Missing or reassuring notes are not interpreted as a problem.
- A plan-aligned deload keeps the same exercises, halves sets, targets about RIR 3, avoids failure, and keeps cardio easy.

RIR remains an imperfect self-estimate, so it is never the sole deload signal. This approach is consistent with RIR research showing useful reliability alongside estimation limitations and with evidence that stopping short of failure can better sustain work across sets:

- https://pubmed.ncbi.nlm.nih.gov/36135029/
- https://pubmed.ncbi.nlm.nih.gov/29204323/
- https://pubmed.ncbi.nlm.nih.gov/34941608/

The full feature/data dependency inventory and plan-change regression gate live in `TRAINING_PLAN_CHANGE_CHECKLIST.md`.

## PR And Result States

First valid completion creates a baseline, not a PR.

PR tiers:

- Baseline Established
- Rep PR
- Volume PR
- Assistance Improvement
- Hold-Time PR
- Consistency PR
- Major PR

Exercise result states:

- `baseline`
- `neutral`
- `improved`
- `regressed`
- `pr`
- `major-pr`

Result-state coloring appears in recap, history, progress cards, and PR timeline styling. The active logger remains intentionally uncluttered.

## Bodyweight And Recomp Tracking

`BodyWeightLog` supports optional `bodyFatPercent`.

Rules:

- Body fat is optional.
- The app does not invent old body-fat values.
- `16.5%` can be used as placeholder/example copy, but should not be saved unless entered.
- Lean mass and fat mass are estimates, not medical-grade measurements.
- Guidance should stay conservative: maintenance to slight surplus, high protein, progressive training, sleep/recovery, and weekly trend review.

## Mobile UX Constraints

The app is optimized for phone use.

Requirements to preserve:

- bottom nav exposes Dashboard, Today, Progress, Weight, and More
- More exposes Routine, History, and Settings
- Settings exposes Cloud Sync, Repair / Recalculate Gamification, import/export, backups, and gamification toggles
- logger inputs remain large, keyboard-safe, and free of horizontal overflow
- recap cards wrap cleanly at 360px and 390px
- muscle map, heat map, charts, badges, and tables must not create page-level horizontal overflow
- reduced-motion preferences should be respected

## Current Product Polish

- Recording valid reps or seconds starts a compact rest timer immediately from the programmed rest text; load and RIR can be entered afterward. The timer survives route changes, remains UI-only, and does not alter workout data.
- Exercise options allow a one-workout skip with confirmation. A skipped item remains visibly incomplete and contributes no set count, volume, PR, trend, muscle stimulus, progression comparison, or exercise-result credit. Existing entries are preserved and can be restored before completion.
- Previous-performance panels expose saved exercise, set, cardio, and workout notes behind a compact disclosure.

### Conservative progression guidance

Next-session guidance uses strict confirmed exercise matches, the current routine's rep range and target RIR, and completed planned sets. One top-range session produces a hold-and-confirm recommendation. A weighted load increase (or assisted-load reduction) requires two comparable top-range sessions at the same logged load/assistance and target RIR. Missing required RIR, partial planned work, pain/regression notes, or no confirmed prior session suppresses progression advice. The system never recommends extra sets.

This conservative double-progression interpretation is informed by ACSM progression guidance and reviews showing that hypertrophy can occur without routine momentary failure while proximity to failure remains relevant and RIR is a practical autoregulation tool:

- https://pubmed.ncbi.nlm.nih.gov/38970765/
- https://pubmed.ncbi.nlm.nih.gov/33497853/
- https://pubmed.ncbi.nlm.nih.gov/38563729/
- https://acsm.org/wp-content/uploads/2025/01/Progression-Models-in-Resistance-Training-for-Healthy-Adults-Simplified.pdf
- PR, badge, and level feedback uses a restrained toast layer and compact recap treatment rather than persistent new XP events.
- Dates are converted to ISO strings from local calendar parts so late-evening mobile sessions do not shift into the next UTC date.
- Weighted trend cards may show an Epley estimated one-rep max as an informational comparison. It is not a PR category and does not award XP.
- The muscle map uses detailed front/back anatomy references inside the same interactive SVG coordinate space as the heat regions. Muscle selection, scoring, and accessible list controls remain derived from logged work.
- Daily Quests and Weekly Challenges are coaching goals only. They do not award XP in the current system and cannot be farmed by edits.

## Deployment Workflow

### Hosting decision

Netlify remains the production host for this repository. A July 2026 Sites plugin preflight confirmed that Sites can manage runtime environment variables and versioned deployments, but this app's native static ESM build does not emit the required Cloudflare-compatible `dist/server/index.js` entrypoint. The plugin's current authentication guidance also requires separately confirming a platform path before moving an app-owned public/external sign-in flow such as Supabase magic links. Moving hosts would therefore require a build-output and authentication migration, not a like-for-like deployment. Preserve the existing Netlify project until Sites supports this exact static-SPA plus Supabase-auth contract without weakening sign-in or stored-data behavior.

Use the documented safe Netlify production-context flow:

```bash
npm run build
npm run test:progress
npx netlify build --context production
node -e "import('node:fs/promises').then(async fs=>{const text=await fs.readFile('dist/config.js','utf8'); console.log(/supabaseUrl\":\\s*\"https:\\/\\//.test(text), /supabaseAnonKey\":\\s*\"[^\"]{20,}/.test(text));})"
npx netlify deploy --prod --dir=dist --no-build
```

Do not deploy a locally built `dist` from plain `npm run build` unless `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set in the local shell. That can produce a live app with Cloud Sync disabled.

## Test Commands

Core checks:

```bash
npm run build
npm run test:progress
```

Optional type check:

```bash
npm run typecheck
```

Note: this repo's production build script currently uses `scripts/build.mjs`, which transpiles to native ESM. It does not run full `tsc --noEmit`; `npm run typecheck` is a separate command.

Browser/mobile QA checklist:

- 360px mobile dashboard, Today/logger, Recap, Progress, History, Weight, Settings
- 390px mobile dashboard, Today/logger, Recap, Progress, History, Weight, Settings
- desktop sanity check
- Cloud Sync panel configured on live production
- `dist/config.js` and live `/config.js` have non-empty Supabase values
- no framework overlay
- no relevant console errors
- no page-level horizontal overflow
- bottom nav and More menu work
- existing logs open
- bodyweight entries remain
- backup/export and Repair / Recalculate remain reachable

## Known Constraints

- The package name and storage keys still use legacy Chad naming for compatibility.
- This app uses a custom native ESM build script rather than a standard Vite bundle.
- Supabase client calls are implemented with direct REST/Auth fetches, not `@supabase/supabase-js`.
- Local Git operations may hang in this checkout. If that happens, use GitHub API readback/commit workflows carefully and report it.
- Quests and weekly challenges are display-only in the current pass to avoid persistence risk and XP farming.
- The muscle map uses detailed anatomy artwork with simplified interactive heat regions. It is a training visualization, not a diagnostic medical chart.

## Future Improvement Ideas

- Add a small automated browser smoke test script for mobile overflow and route rendering.
- Add a non-destructive local fixture mode for previous-performance and recap QA.
- Add route-backed filters for Progress/History so mobile views can be shared or restored.
- Add optional richer replacement logging without building a full exercise database.
- Add an AI coach only after local deterministic feedback remains stable and privacy/cost are explicitly handled.
# Warm-Up System

Eli's Cycle Tracker includes a day-specific warm-up layer that is separate from working sets. Warm-ups appear in Dashboard/Today as a short availability callout, in the Logger as a `Pre-Workout Warm-Up` checklist, before matching exercises as `Do Before This Exercise` ramp-up cards, and in Routine as expandable reference panels.

Warm-up completion is stored as optional `WorkoutLog.warmupLog` JSON. Older workout logs without warm-up data remain valid. Warm-up drills and ramp-up sets are never written into `exerciseLogs`, so they do not count toward working-set volume, PRs, Trends by Lift, previous-performance comparisons, exercise result states, or working-set logging quality.

General warm-ups use simple Done controls only. Pre-exercise ramp-ups also use Done controls and are shown immediately above the matching exercise. Notes can be stored in the warm-up notes field for stiffness, ramp-up loads, or joint status, but those notes are informational and do not affect progression calculations.

Rest days show optional posture work instead of lifting warm-ups. The posture routine is intended for rest days or after lifting, not before heavy lifting.

The Routine page also lists movements to avoid before lifting: long static stretches, long dead hangs, high-rep push-ups, band arm circuits, aggressive shoulder dislocates, and weighted lateral raise warm-up sets. These are intentionally kept out of the pre-lifting warm-up because they can add fatigue, reduce performance, or irritate joints.

## Production Restore Note

If production renders as unstyled plain HTML, verify the deployed app shell before changing app data or Supabase settings. The likely cause is an incomplete `dist` upload, especially a missing `dist/src/styles.css` or vendor module files. Rebuild with `npx netlify build --context production`, confirm `dist/config.js` has non-empty Supabase values and `dist/src/styles.css` exists, then deploy with `npx netlify deploy --prod --dir=dist --no-build`.
# Cornell cycle (2026-10-16)

The current plan is version 4 of the separate `cornell-v1` cycle for Helen Newman:
Tuesday/Wednesday/Saturday upper, Friday lower, Sunday optional easy aerobic or
light lifting, Monday/Thursday fixed ROTC. It avoids external cable stations and
uses full prescribed sets immediately (15/14/15/15 essential sets per week).
See `CABLE_FREE_REVIEW.md` for substitutions, evidence, the two independent reviews,
recovery tradeoffs, and safe draft revision behavior. Earlier research notes are
historical context, not the active prescription.
The original routine remains available in Routine and resolves all unversioned
historical logs. Original start dates, storage keys, auth and schema are unchanged.

New log metadata: optional `programId` and `programStartDate` inside the existing
workout JSON, plus `planVersion`. Old plan versions retain their week-one calibration;
version 4 removes that cap and retains the week-eight deload. Saved sets are never
trimmed. Current drafts gain missing prescribed rows when opened; already logged
work stays intact. Exact unchanged exercises display their latest recorded
performance across all training days, including old loads/notes and valid sets in
unfinished workouts. Empty rows, invalid performance and explicitly incomplete or
skipped sets do not replace a reference. The reference block labels unfinished
workouts. Stale references over 28 days do not prefill new loads. PR and coaching
progression comparisons retain completed-workout eligibility; viewing a draft as
a reference never awards completion or XP.
Different machines do not inherit old dumbbell/assistance PR baselines.

Added verification: `node scripts/verify-cornell.mjs`, `node scripts/verify-release.mjs`
and `node scripts/verify-cable-free.mjs` after the build. Also run
`node scripts/verify-latest-performance.mjs` for cross-day unfinished-workout references. Continue
running `npm run typecheck`, `npm run build`, and `npm run test:progress`.
For production use `npx netlify build --context production`, inspect non-empty
correct-project `dist/config.js`, then `npx netlify deploy --prod --dir=dist --no-build`.
Never deploy the empty-config output of an unconfigured local build.
