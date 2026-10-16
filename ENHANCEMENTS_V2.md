# Cycle Tracker v2 — upper-priority program and iPhone redesign

Local enhanced copy of `rizefr/week8codexsupa`. Nothing here has been pushed or deployed.

## Program: Cornell plan v2

Same four essential days (Tue, Wed, Fri, Sat), same ROTC Mon/Thu, optional Sunday.

| Day | Session | Sets (weeks 2-7) |
| --- | --- | --- |
| Tue | Lower B + Arms: DB RDL 2, Leg press 3, Seated curl 2, Leg extension 2, **Lateral raise 3 ⇄ Overhead cable triceps 3**, Calf press 2 ⇄ Reverse crunch 2 | 19 |
| Wed | Upper B: Pulldown 3, Chest press 3 (2 RIR), Seated row 2, Lateral raise 3 ⇄ Incline curl 2, **Rear-delt fly 3** | 16 |
| Fri | Lower A + Delts: Leg press 3, Seated curl 3, Split squat 2, Calf press 3 ⇄ Cable crunch 2, **Lateral raise 3 ⇄ Preacher curl 2** | 18 |
| Sat | Upper A: Low-incline DB press 3, Assisted pull-up 3, Chest-supported row 3, Lateral raise 3, Pec fly 2, Overhead triceps 2 ⇄ Incline curl 2 | 18 |
| Sun | Optional: easy run **or** pull + arms (pulldown, row, laterals, rear delts, curls at 2 RIR; no pressing before Monday push-ups) | — |

Weekly fractional sets (direct = 1, indirect = ½): side delts 12, lats 8.5, upper back 6.5,
upper chest 3, chest 6.5 (+ logged ROTC push-ups), rear delts 4.5, biceps 9, triceps 8,
quads 10, hamstrings 7, glutes 5, calves 5, abs 4.

Rule changes:
- Calibration week (2 sets, ~3 RIR) only in cycle 1. Later cycles start at the week-2 ramp, so
  there is no longer a deload week followed by a second easy week.
- Isolation lifts may take the last set to 0-1 RIR in weeks 3-7.
- Logs without `planVersion` keep resolving to the original v1 plan (`cornellDaysV1`), so earlier
  history, PRs and XP do not change.

Why 2 lower + 2 upper (with delts/arms on leg days) instead of 1 lower + 3 upper: see the Plan
tab's "Why this split" panel and `CORNELL_CYCLE_RESEARCH.md`.

## App changes

- New design system (`src/styles.css`), iPhone-first layout, bottom tab bar, sheets instead of
  browser dialogs, Barlow Condensed + Manrope type.
- Pages split out of the 4,500-line `App.tsx` into `src/pages/*` and `src/ui/*`.
- Workout logger: one compact row per set with the previous session inline, tap ✓ to accept
  suggested values, load carried to the next set, exercise jump bar, single calibration banner,
  options sheet (cue, ramp-up, how-to, swap, flags, notes, skip), finish sheet with partial warning.
- Rest timer: docked bar, persisted across reloads, a few chimes (configurable) instead of an
  endless modal alarm, overtime counter, stops when the workout is finished.
- Screen wake lock while a workout is open (iOS 16.4+; Home Screen apps iOS 18.4+).
- PWA: manifest, Home Screen icons, network-first service worker with offline fallback.
- Muscle map: drawn anatomical front/back figures, colored by weekly fractional sets vs
  per-muscle target range; ROTC push-up sets count toward chest/triceps; PR points removed.
- Gamification: a session needs ≥75% of planned (non-skipped) sets to earn completion credit;
  PRs are one per lift per session (heavier load within the rep range, or an effort-adjusted
  strength gain); volume/total-rep PRs and set-count inflation no longer count for v2 logs;
  retired daily check-in / volume badges hidden unless already earned; four new badges.
- Progress: Muscles / Strength (effort-adjusted e1RM trend, plateau detection) / Awards.
- Body: weigh-ins plus tape measurements, regression-based weekly rate vs lean-bulk band,
  shoulder-to-waist ratio trend, edit any entry.
- Fixed: full XP for an almost-empty workout, badge toast vs recap mismatch, timer running after
  finishing, invented dashboard scores, off-topic "business action" cues, developer text in
  Settings, retired exercises cluttering trends, "1 sets / 0 exercises" copy, DST off-by-one in
  week math.

## Run, test, deploy

```bash
npm ci
npm run typecheck
npm run build
npm run test:progress
node scripts/verify-cornell.mjs
npm run dev   # http://127.0.0.1:5173
```

Deploying is unchanged (`netlify.toml`); production builds need `SUPABASE_URL` and
`SUPABASE_ANON_KEY`. No Supabase schema change is required: new fields live inside the
existing JSON log columns.
