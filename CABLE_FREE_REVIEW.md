# Cable-free revision - October 21, 2026

The current plan is version 4. This refines the existing three-upper/one-lower specialization and keeps the 59 essential weekly working sets. Version 1-3 definitions remain available for saved history. Historical completed logs, storage keys, schema, auth and cloud merge code are unchanged.

## Independent review panel

Two independent read-only reviewers evaluated the plan: an upper-body hypertrophy specialist and a recovery/equipment/usability critic. Both recommended the same vertical-pull, supported-row and overhead-extension substitutions, keeping Monday/Thursday ROTC and optional Sunday recovery. Neither claimed cables were ineffective or dumbbells universally superior.

They disagreed on Friday abs. The hypertrophy reviewer preferred a loaded floor crunch for straightforward external-load progression; the usability reviewer preferred reverse crunches. The final choice is 2 x 10-20 DB-loaded floor crunches. Tuesday retains reverse crunches. This preserves four direct ab sets without adding work. A final implementation review caught that the existing name-only swap UI would not change tracking type safely; no bodyweight replacement button is added to the weighted crunch. Skip an uncomfortable setup rather than forcing it.

## Final substitutions

| Removed external cable slot | Current movement | Working sets |
| --- | --- | --- |
| Tuesday overhead cable extension | Seated two-hand, single-DB overhead extension | 3 x 10-15 |
| Wednesday lat pulldown | Chin/dip-assist machine pull-up | 3 x 8-12 |
| Wednesday seated cable row | Chest-supported incline DB row | 3 x 8-12 |
| Friday cable crunch | DB-loaded floor crunch | 2 x 10-20 |
| Saturday overhead cable extension | Same two-hand DB extension | 2 x 10-15 |
| Optional Sunday cable pulls | Assisted pull-up and supported DB row | 2 sets each, if lifting is chosen |

Saturday's existing pull-up (3 x 6-10) and row (2 x 8-12) remain. No extra mandatory work or XP incentives are added. Pin-selected leg, pec-fly and rear-delt machines remain; they avoid external attachment setup even if their internal mechanism contains a cable.

## Evidence and limits

- Cornell explicitly lists its pulldown and seated row under the multi-cable station; it lists a chin/dip-assist machine, adjustable benches and DBs from 3-100 lb. No unlisted chest-supported resistance machine is assumed. https://scl.cornell.edu/recreation/facility/helen-newman-fitness-center
- Maeo et al. compared overhead and neutral-arm cable elbow extensions. It supports retaining overhead positioning, not a claim that DB and cable extensions have identical resistance or hypertrophy outcomes. https://pubmed.ncbi.nlm.nih.gov/35819335/
- The free-weight/machine meta-analysis found no detected overall hypertrophy difference, with limited hypertrophy studies. This is broad support for practical modality choice, not proof that each specific substitution is equal. https://pubmed.ncbi.nlm.nih.gov/37582807/
- Direct long-term comparisons of the exact row, assisted pull-up and abdominal substitutions are insufficient. Selection is a practical inference from movement pattern, target muscles, progressive loading, support and equipment access. EMG or acute swelling is not treated as proof of growth.

## Sets and recovery

Full normal prescriptions apply immediately: Tuesday 15, Wednesday 14, Friday 15, Saturday 15. Ending the former first-week cap raises that initial essential week from 46 to 59 prescribed sets, about 28%; this is not an instruction to increase load or train to failure. Weeks 1-2 use about 2-3 RIR; the ordinary build phase follows. The week-eight deload remains half sets rounded up at 3-4 RIR. Genuine short warm-ups and ramp-up sets remain separate from work sets.

Full sets do not guarantee an individual optimal dose. Monitor actual performance and ROTC recovery; keep optional Sunday lifting optional. New substitutions require comfortable starting loads. Overhead extensions use one DB's total load; rows use load per DB; assistance is a separate metric. Cable load never seeds DB or assistance records.

## Draft safety and validation

Opening a version-3 draft dated October 21 or later updates its unrecorded prescriptions. Retained movements keep entered sets exactly and gain missing prescribed rows. Any entered field on a changed exercise, including load without reps, preserves that exercise under its original identity for that workout; replacement choices, notes and flags also survive. Completed and earlier-date logs are never upgraded. Upgrades are idempotent and use explicit source IDs, not fuzzy movement matching.

Regression checks: `npm run typecheck`, `npm run build`, `npm run test:progress`, `node scripts/verify-cornell.mjs`, `node scripts/verify-release.mjs`, `node scripts/verify-cable-free.mjs`. The last script checks full-set weeks, deload, no external cable exercises including Sunday, strict comparison boundaries, warm-ups, ranked cuts and non-mutating draft updates.

Deployment remains the existing Netlify project: production-context build, non-empty correct Supabase config check, then `netlify deploy --prod --dir=dist --no-build`. Never deploy an unconfigured local build.
