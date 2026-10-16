# Training Plan Change Readiness Checklist

Use this checklist whenever the 8-week routine or its exercise metadata changes. The routine in `src/data/routine.ts` remains the source of truth. Never rewrite historical logs to make them fit a new plan.

## Feature Inventory And Data Dependencies

| Feature | Expected behavior | Data used |
| --- | --- | --- |
| Routine schedule | Calendar schedule and one-day overrides preserve future dates | `src/data/routine.ts`, program start date, `WorkoutLog.dayKey` and override fields |
| Exercise logger | Tracking-aware load/reps/seconds/RIR fields; local-first draft saving | exercise metadata, `WorkoutLog.exerciseLogs` |
| Auto-completion | Only valid required fields complete a working set | tracking type, `SetLog` values |
| Exercise skip | Requires confirmation and a workout-only reason; stays incomplete | optional `ExerciseLog.skipped`, `skippedAt`, `skipReason` |
| Rest timer | Starts on first valid reps/seconds; timestamp survives route changes | UI state only, programmed rest text |
| Warm-ups | Separate Done controls; never become working sets | `src/data/warmups.ts`, optional `WorkoutLog.warmupLog` |
| Previous performance | Uses strict confirmed exercise comparison | exact IDs/names and explicit comparison aliases |
| Progression advice | Uses comparable completed sessions, rep range, load, and target RIR | strict session history, routine metadata |
| Notes and training flags | Previous notes are disclosed; explicit joint/form flags inform briefings | exercise/workout notes, optional `ExerciseLog.flags` |
| Deload guidance | Requires sufficient history and at least two independent plan-defined signals | completed history, comparable performance, explicit notes/flags |
| Short-on-time guidance | Ranks three day-specific cuts, starts all exercises selected, and persists applied cuts as honest skipped work | routine priorities plus `src/lib/readiness.ts` evidence-based redundancy ranking |
| PRs and baselines | First valid session is baseline; later strict improvements can be PRs | completed valid sets and strict history |
| Trends and muscle map | Skip warm-ups and skipped exercises; use tracking-aware metrics | completed working sets, muscle metadata |
| Gamification | Deterministic XP; display-only quests/challenges cannot be farmed | logs, weights, settings memory |
| Auth and Cloud Sync | Local save remains first; cloud status reflects confirmed cloud state | `src/lib/storage.ts`, `src/lib/cloud.ts`, runtime config |
| Backup/import/export | Preserve workouts, weights, settings, optional future fields | complete `AppData` JSON |
| Mobile navigation | Dashboard, Today, Progress, Weight, and More remain reachable | hash routes and app-shell state |

## Routine Change Review

- [ ] Keep existing day keys and exercise IDs when the movement identity is unchanged.
- [ ] Add a new exercise ID when a variation should not share prior performance or PRs.
- [ ] Add `comparisonAliases` only for truly equivalent names, never for a loose movement family.
- [ ] Confirm tracking type, load label, unilateral behavior, set count, rep/seconds range, rest, target RIR, muscles, progression rule, PR eligibility, and superset metadata.
- [ ] Update warm-up exercise links if an exercise ID changes.
- [ ] Review each day's three short-on-time cuts against routine priorities, weekly overlap, and current evidence; keep priority compounds out of the recommended list.
- [ ] Review deload copy against the plan; do not add medical diagnosis or infer pain from missing data.
- [ ] Preserve the old log shape and render missing new metadata defensively.

## Regression Checklist

### Logging And Timer

- [ ] Create a draft, enter a partial set, close/reopen, and confirm the draft remains.
- [ ] Verify weighted, assisted, bodyweight, timed, cardio, and unilateral inputs.
- [ ] Confirm valid reps/seconds starts the rest timer once; reset and +/-30 seconds work.
- [ ] Confirm the completion alarm is audible, repeats while the completion dialog is visible, respects mute/browser audio limits, and stops immediately after Dismiss alarm.
- [ ] Confirm every workout item starts selected, applied cuts gray and lock the corresponding cards, and re-selecting restores the original logged entries.
- [ ] Skip an exercise, record a reason, restore it, and confirm entries are preserved.
- [ ] Confirm skipped work is not counted as completed or included in volume, PRs, trends, muscle stimulus, or XP.
- [ ] Add joint/form flags and confirm they do not alter set metrics.

### Comparisons And Guidance

- [ ] Confirm exact exercises and approved aliases find prior performance.
- [ ] Confirm different variants do not cross-match.
- [ ] Confirm prior exercise and workout notes appear without copying into the new log.
- [ ] Confirm progression advice says evidence is insufficient when no comparable history exists.
- [ ] Confirm load/reps advice never adds unplanned sets.
- [ ] Test a single performance dip: no automatic deload.
- [ ] Test three comparable sessions plus supported explicit flags: plan-aligned watch/deload language only.
- [ ] Confirm reassuring notes do not become joint/form flags.

### Data, Sync, And Backup

- [ ] Verify existing workout and body-weight entries render through read-only checks.
- [ ] Verify local saving succeeds while signed out/offline.
- [ ] Verify Cloud Sync status, last confirmed sync time, and failure details are accurate.
- [ ] Verify empty local/cloud payloads cannot wipe non-empty data.
- [ ] Verify backup creation, JSON export/import parsing, and Repair / Recalculate remain reachable.
- [ ] Confirm no changes to IndexedDB names, localStorage keys, auth behavior, or Supabase schema unless separately approved.

### Gamification And Progress

- [ ] Run XP/PR/badge regression tests; edits and duplicate same-day logs cannot farm rewards.
- [ ] Verify baselines are not labeled PRs.
- [ ] Verify streak types remain separate and planned rest behavior is respected.
- [ ] Verify heat map, muscle map, body weight, trends, recap, and history exclude skipped/warm-up work.

### Responsive And Accessible QA

- [ ] Test Dashboard, Today, Logger, Recap, Progress, History, Weight, Routine, and Settings at 360px and 390px.
- [ ] Confirm no horizontal overflow, clipped text, keyboard overlap, or bottom-nav obstruction.
- [ ] Confirm controls have clear labels, visible focus, 44px touch targets, and reduced-motion behavior.
- [ ] Confirm muscle-map regions are keyboard/touch operable and have accessible names.

## Release Gate

Run:

```bash
npm run typecheck
npm run build
npm run test:progress
npx netlify build --context production
```

Before deploying, verify `dist/config.js` contains non-empty Supabase URL and anon-key values without printing the key. Deploy only the complete production-context `dist`, then verify the live app, Cloud Sync panel, direct route refresh, and browser console.
# Cornell version boundary

- New `cornell-v1` workouts are separate from unversioned home-gym history.
- Verify calibration/deload set counts, four essential days, optional Sunday,
  fixed ROTC classification, and exact old-to-new DB performance references.
- Run `node scripts/verify-cornell.mjs` after building in addition to existing tests.
- Never change an old record's program marker or original settings start date.
- Warm-ups and skipped work remain excluded from work-set metrics. Conditioning
  does not create strength PRs or count as an essential lifting day.
