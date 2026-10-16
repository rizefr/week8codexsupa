import { useMemo, useState } from "react";
import { Search } from "../components/icons";
import { DayKey, Exercise, WorkoutDay } from "../types";
import { workoutDays as legacyDays } from "../data/routine";
import { CORNELL_START, cornellActive, cornellDays, exercisesForDate, prescriptionWeekForDate } from "../data/cornell";
import { doNotDoBeforeLifting } from "../data/warmups";
import { todayISO } from "../lib/date";
import { effortLabelForExercise, exerciseAliasLabel, rirRequiredForExercise, targetRIRForExercise } from "../lib/progress";
import { buildExerciseHelp } from "../lib/coach";
import { muscleDisplayGroups, muscleLabels, muscleTargets, plannedMuscleVolume } from "../lib/muscles";
import { AppContext } from "../ui/context";
import { Card, Chip, Disclosure, displayName, formatSets, PageHeader, SectionHeader, Segmented } from "../ui/core";
import { phaseLabel } from "./Home";

const order: Array<{ key: DayKey; short: string }> = [
  { key: "friday", short: "Fri" },
  { key: "saturday", short: "Sat" },
  { key: "sunday", short: "Sun" },
  { key: "monday", short: "Mon" },
  { key: "tuesday", short: "Tue" },
  { key: "wednesday", short: "Wed" },
  { key: "thursday", short: "Thu" },
];

const kindFor: Record<DayKey, { cls: string; label: string }> = {
  friday: { cls: "k-lower", label: "Legs+" },
  saturday: { cls: "k-upper", label: "Upper" },
  sunday: { cls: "k-opt", label: "Opt" },
  monday: { cls: "k-rotc", label: "PT" },
  tuesday: { cls: "k-upper", label: "Upper" },
  wednesday: { cls: "k-upper", label: "Upper" },
  thursday: { cls: "k-rotc", label: "PT" },
};

export function ExerciseHelp({ exercise }: { exercise: Exercise }) {
  const help = buildExerciseHelp(exercise);
  if (!help) return null;
  return (
    <Disclosure summary="How to do it">
      {help.subtitle && <p>{help.subtitle}</p>}
      {help.faqs.map((faq) => (
        <div key={faq.question}>
          <strong style={{ color: "var(--text)", display: "block", fontSize: 13 }}>{faq.question}</strong>
          <p>{faq.answer}</p>
        </div>
      ))}
      {!!help.replacements.length && (
        <p className="faint small">Alternatives if busy or uncomfortable: {help.replacements.map((item) => item.name).join(" · ")}</p>
      )}
    </Disclosure>
  );
}

function effortText(exercise: Exercise, week: number): string {
  const label = effortLabelForExercise(exercise);
  if (!rirRequiredForExercise(exercise)) return exercise.effortCue ?? "Stop when control breaks";
  const target = targetRIRForExercise(exercise, week);
  if (target.includes(";")) {
    const [base, last] = target.split(";").map((part) => part.trim());
    return `${base} RIR, last set ${last}`;
  }
  return label === "Target RIR" ? `${target} RIR` : target;
}

function DayDetail({ day, week, date, query }: { day: WorkoutDay; week: number; date: string; query: string }) {
  const exercises = exercisesForDate(day, date);
  const visible = exercises.filter((exercise) => `${exercise.name} ${exercise.target} ${exercise.notes}`.toLowerCase().includes(query));
  return (
    <div className="plan-day__body">
      {day.intent && <p className="muted small" style={{ padding: "12px 0 4px" }}>{day.intent}</p>}
      {visible.map((exercise, index) => (
        <div key={exercise.id} className="plan-ex">
          <span className="plan-ex__n">{exercise.superset ?? index + 1}</span>
          <div style={{ minWidth: 0 }}>
            <strong>{displayName(exercise.name)}</strong>{exercise.name.startsWith("Helen Newman") && <span className="faint small"> · machine</span>}
            <div className="meta">{exercise.sets} × {exercise.reps ?? exercise.seconds} · rest {exercise.rest.replace(/ after .*/, "")} · {effortText(exercise, week)}</div>
            <div className="chip-row" style={{ marginTop: 6 }}>
              {(exercise.muscleGroups ?? []).slice(0, 3).map((group, i) => <Chip key={group} tone={i === 0 ? "accent" : "neutral"}>{muscleLabels[group]}</Chip>)}
              {exercise.supersetLabel && <Chip tone="violet">{exercise.supersetLabel.split("·")[0].trim()}</Chip>}
            </div>
            <p>{exercise.notes}</p>
            {exerciseAliasLabel(exercise) && <p className="faint small">{exerciseAliasLabel(exercise)}</p>}
            <div style={{ marginTop: 8 }}><ExerciseHelp exercise={exercise} /></div>
          </div>
        </div>
      ))}
      {!visible.length && !!exercises.length && <p className="faint small" style={{ paddingTop: 12 }}>No exercise on this day matches “{query}”.</p>}
      {day.cardio?.map((cardio) => (
        <div key={cardio.id} className="plan-ex">
          <span className="plan-ex__n">~</span>
          <div>
            <strong>{cardio.name}</strong>
            <div className="meta">{cardio.time} · {cardio.intensity}</div>
            {cardio.notes && <p>{cardio.notes}</p>}
          </div>
        </div>
      ))}
      {!!day.rules?.length && day.key !== "friday" && day.key !== "saturday" && day.key !== "tuesday" && day.key !== "wednesday" && (
        <ul className="evidence-list" style={{ marginTop: 10, color: "var(--text-2)" }}>
          {day.rules.map((rule) => <li key={rule}>{rule}</li>)}
        </ul>
      )}
    </div>
  );
}

export function PlanPage({ ctx: _ctx }: { ctx: AppContext }) {
  const [version, setVersion] = useState<"cornell" | "legacy">("cornell");
  const [query, setQuery] = useState("");
  const today = todayISO();
  // Day cards show the normal-week prescription (weeks 3-7); the phase card
  // explains how this particular week differs.
  const date = "2026-10-30";
  const week = 4;
  const phase = phaseLabel(cornellActive(today) ? today : CORNELL_START);
  const thisWeek = prescriptionWeekForDate(cornellActive(today) ? today : CORNELL_START);
  const days = version === "cornell" ? cornellDays : legacyDays;
  const q = query.trim().toLowerCase();
  const fullWeek = useMemo(() => plannedMuscleVolume("2026-10-30", "2026-11-05"), []);

  return (
    <div className="page">
      <PageHeader eyebrow="Helen Newman" title="Plan" actions={<Segmented label="Program version" value={version} onChange={setVersion} options={[{ value: "cornell", label: "Current" }, { value: "legacy", label: "Original" }]} />} />

      {version === "cornell" ? (
        <>
          <Card className="card--hero">
            <p className="eyebrow">Upper-priority split</p>
            <h2 className="today-card__title" style={{ marginTop: 4 }}>3 upper + 1 lower. Built for your priorities.</h2>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              Upper chest twice, delts and arms three times, back twice. One focused lower day leaves more recovery for ROTC. 59 working sets per normal week, about 60–75 min per session.
            </p>
            <div className="split-diagram" style={{ marginTop: 16 }} aria-label="Weekly split">
              {order.map((item) => (
                <div key={item.key} className={kindFor[item.key].cls}>
                  <span>{item.short}</span>
                  <i>{kindFor[item.key].label}</i>
                </div>
              ))}
            </div>
            <div className="split-legend">
              <span><i style={{ background: "rgba(94,123,255,.6)" }} />Upper body</span>
              <span><i style={{ background: "rgba(53,201,139,.55)" }} />Legs</span>
              <span><i style={{ background: "rgba(242,162,58,.4)" }} />ROTC PT</span>
              <span><i style={{ background: "var(--surface-4)" }} />Optional</span>
            </div>
          </Card>

          <Card>
            <SectionHeader eyebrow={`This week · week ${thisWeek} of 8`} title={phase.label} detail={`${phase.detail} Day cards below show a normal week.`} />
            <ul className="evidence-list muted">
              {(cornellDays.friday.rules ?? []).map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </Card>

          <label className="search">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercises or muscles" aria-label="Search exercises" />
          </label>
        </>
      ) : (
        <Card>
          <SectionHeader eyebrow="Historical reference" title="Original home-gym cycle" detail="Logs made before Oct 16, 2026 keep using this routine. It is read-only." />
        </Card>
      )}

      <div className="stack" style={{ gap: 10 }}>
        {order.map(({ key, short }) => {
          const day = days[key];
          const sets = exercisesForDate(day, date).reduce((sum, exercise) => sum + (exercise.sets ?? 0), 0);
          const matches = !q || `${day.title} ${day.exercises.map((exercise) => `${exercise.name} ${exercise.target}`).join(" ")}`.toLowerCase().includes(q);
          if (!matches) return null;
          return (
            <details key={key} className="card plan-day" open={!!q}>
              <summary>
                <span className="plan-day__day">{short}</span>
                <span className="plan-day__title">
                  <strong>{day.title}</strong>
                  <span>{day.exercises.length ? `${day.exercises.length} exercises · ${sets} sets` : day.subtitle}</span>
                </span>
                {version === "cornell" && <Chip tone={kindFor[key].cls === "k-rotc" ? "warn" : kindFor[key].cls === "k-opt" ? "neutral" : "accent"}>{kindFor[key].label}</Chip>}
              </summary>
              <DayDetail day={day} week={version === "cornell" ? week : 3} date={version === "cornell" ? date : "2026-08-01"} query={q} />
            </details>
          );
        })}
      </div>

      {version === "cornell" && (
        <>
          <Card>
            <SectionHeader eyebrow="Normal week (weeks 2–7)" title="Planned sets per muscle" detail="Direct sets count 1, indirect ½. Push-ups from ROTC add chest and triceps on top." />
            <div className="grid-3">
              {muscleDisplayGroups.map((group) => (
                <div key={group.title}>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>{group.title}</p>
                  {group.groups.map((key) => (
                    <div key={key} className="row row--between small" style={{ padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                      <span>{muscleLabels[key]}{muscleTargets[key].priority ? " ★" : ""}</span>
                      <span className="num"><b>{formatSets(fullWeek.get(key) ?? 0)}</b> <span className="faint">/ {muscleTargets[key].min ? `${muscleTargets[key].min}-${muscleTargets[key].max}` : "—"}</span></span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>

          <Disclosure summary="Why three upper days and one lower day?">
            <p>This is deliberate specialization, not a claim that one leg day is universally best. Weekly volume matters more for hypertrophy than the split label when volume is matched.</p>
            <p>Six upper-chest sets replace three; nine direct side-delt sets and substantial pulling and arm work stay. Five quad and five hamstring sets plus calves maintain a meaningful lower-body stimulus without two demanding leg days around ROTC.</p>
            <p>Tuesday pressing follows Monday PT, so keep 2 RIR and hold load when fatigued. Wednesday has no pressing before Thursday push-ups. Consecutive delt/arm exposure is not recovery-free: leave 2 RIR or use the optional cuts when sore.</p>
            <p>Friday is the only lower session. If missed, reschedule that session rather than replacing it with more upper work. Reassess strength, soreness and running after 3–4 weeks.</p>
            <p className="faint small">Evidence: <a href="https://doi.org/10.1007/s40279-025-02344-w" target="_blank" rel="noreferrer">volume &amp; frequency dose-response (Pelland 2025)</a> · <a href="https://doi.org/10.1080/02640414.2018.1555906" target="_blank" rel="noreferrer">frequency meta-analysis (Schoenfeld 2019)</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/38970765/" target="_blank" rel="noreferrer">proximity to failure (Robinson 2024)</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/33009197/" target="_blank" rel="noreferrer">seated leg curl (Maeo 2021)</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/35819335/" target="_blank" rel="noreferrer">overhead triceps (Maeo 2023)</a> · <a href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9474354/" target="_blank" rel="noreferrer">running &amp; fiber growth (Lundberg 2022)</a></p>
          </Disclosure>

          <Disclosure summary="Running, recovery & nutrition">
            <p>Monday and Thursday PT supply your running workload. Sunday is optional conversational jog/walk, 15–30 min, or full rest. Do not add intervals on top of hard PT. Friday legs sit after PT, not immediately before it.</p>
            <p>For a 15:50 two-mile, even splits are about 7:55 per mile. That is test pace, not easy pace.</p>
            <p>Lean bulk: aim for roughly 0.25–0.5% of body weight gained per week (the Body tab tracks this). Protein about 1.6 g/kg/day (~105 g at 142 lb); more is fine. Watch your waist measurement to keep the gain lean.</p>
            <p>Machine busy? Wait, reorder, or use the skip control. Never log another machine's stack under this one.</p>
            <p className="faint small"><a href="https://scl.cornell.edu/recreation/recreation/facility/helen-newman-fitness-center" target="_blank" rel="noreferrer">Helen Newman equipment list</a></p>
          </Disclosure>

          <Disclosure summary="Skip these before lifting">
            <p>They add fatigue or irritate joints before training. Save them for after training or rest days.</p>
            <div className="chip-row">{doNotDoBeforeLifting.map((item) => <Chip key={item}>{item}</Chip>)}</div>
          </Disclosure>
        </>
      )}
    </div>
  );
}
