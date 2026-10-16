# Upper-priority release review

This release starts from the enhanced v2 iPhone redesign. New Cornell logs use plan version 3; version 1 and 2 prescriptions remain available for historical logs. No schema, storage key, account, or database replacement is required.

## Program decision

Four essential sessions: Tuesday upper chest/arms (15 sets), Wednesday back/rear delts (14), Friday lower (15), Saturday chest/width (15). Monday and Thursday remain fixed ROTC. Sunday is optional easy aerobic work/recovery; the optional light lifting alternative is not required and should not be stacked onto poor recovery.

Normal weeks have 59 prescribed sets: 42 upper-body, 13 lower-body and 4 abdominal sets. Direct allocations include upper-chest presses 6, lateral raises 9, back pulls/rows 11, curls 6, triceps extensions 5, quads 5, hamstrings 5 and calves 3. Indirect contributions are estimated separately, not added as full direct sets. ROTC push-ups add real pressing stress but are not guessed from absent logs.

One lower day is a deliberate specialization tradeoff, not a claim that it maximizes leg hypertrophy. It leaves meaningful quad/hamstring work while shifting resources toward the user's upper-body goal and accommodating running. Tuesday pressing stays at 2 RIR after Monday PT; Wednesday avoids pressing before Thursday PT. Friday leg work should remain controlled after Thursday running. Reduce optional work first when recovery suffers.

The first cycle's week 1 is calibration (at most 2 sets per exercise, about 3 RIR), week 2 is a gradual return, weeks 3-7 build, and week 8 reduces sets/effort. Later cycles do not automatically repeat initial calibration. Add reps within the range before load; no invented starting weights or actual RIR values. Prior confirmed exercise history remains reference information, not proof that a long-break load is appropriate now.

## Evidence and limitations

- Pelland et al., 2026, https://pubmed.ncbi.nlm.nih.gov/41343037/: volume has diminishing returns; frequency is not an independent guarantee of more hypertrophy. Fractional indirect-set accounting is a useful model, not a measurement of individual muscle growth.
- Schoenfeld et al., 2019, https://pubmed.ncbi.nlm.nih.gov/30558493/: volume-equated frequency findings support distributing work for quality/recovery rather than requiring two leg days.
- Helen Newman official facility listing: https://scl.cornell.edu/recreation/facility/helen-newman-fitness-center . Equipment availability and queues can vary; use the configured equivalents, not assumed new equipment.

This is an evidence-informed starting dose, not a scientifically proven individual optimum. Track comparable performance, discomfort, sleep and ROTC fatigue before raising volume. No extra hard conditioning is added to the two fixed ROTC sessions.

## Reliability corrections

- Skipping cannot manufacture completed-session credit in v3. Partial work still contributes its genuinely logged sets, not a full-workout award.
- Muscle stimulus requires valid recorded performance; empty completion flags do not count.
- Actual RIR is never filled automatically by the logger's quick-complete action.
- Each optional v3 prescription has a unique ID; old versions remain resolvable.
- Muscle-map regions are keyboard selectable; guidance does not label missing sets as mandatory catch-up work.
- Timer supports 30-second adjustments and repeating foreground completion audio until dismissal. iOS suspension/locked-screen audio remains a browser limitation.
- Cloud status distinguishes signed in from confirmed synchronization.
- Narrow auth fixes: raw magic-link redirect query parameter, JWT expiry fallback, device-local logout scope. Stored week/cycle fields are preserved rather than recalculated during normalization. No schema or RLS changes.

## Verification and release

Run `npm run typecheck`, `npm run build`, `npm run test:progress`, `node scripts/verify-cornell.mjs`, and `node scripts/verify-release.mjs`.

For production, use `npx netlify build --context production`, verify non-empty public Supabase configuration for the existing project, then `npx netlify deploy --prod --dir=dist --no-build`. An ordinary local build may intentionally have no cloud config and must not be deployed over the production-context output.

Pre-release reference: Git commit 34f01a10563d0b57105fd37f3ffcbe991f237134 and Netlify deploy 6ad270b542cc72f5e8f7069f. Keep release evidence separate from claims of authentication success: the user must complete the email link before live session/read/write verification can be reported.

Local browser checks use synthetic data on localhost only. Do not sign that fixture profile into the real account. Production account testing must not replace or rewrite historical workouts. No XP rewards were inflated to preserve a preferred level.
