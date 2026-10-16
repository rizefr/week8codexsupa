import { useMemo, useState } from "react";
import { Check, ChevronRight, Clock, Dumbbell, Flame, Footprints, Play, Shuffle, Trophy, Zap } from "../components/icons";
import { DayKey, WorkoutLog } from "../types";
import { addDays, dayKeyForDate, formatDate, todayISO } from "../lib/date";
import {
  CORNELL_ID,
  cornellActive,
  cornellCycle,
  cornellWeek,
  cornellWeekRange,
  daysForDate,
  exercisesForDate,
  isCalibrationWeek,
  isOptionalStrengthLog,
  isTrainingLog,
  OPTIONAL_DAY,
  ROTC_DAYS,
  trainingDaysForDate,
  workoutForLog,
} from "../data/cornell";
import { isCreditedSession, isCreditedWorkout, latestBodyWeight, setCompletionForLog } from "../lib/progress";
import { classifyPRTier } from "../lib/gamification";
import { muscleLabels, summarizeMuscleWeek } from "../lib/muscles";
import { bodyTrend } from "../lib/body";
import { AppContext } from "../ui/context";
import { Card, Chip, cx, displayName, formatSets, Meter, navigate, PageHeader, Ring, SectionHeader, Sheet } from "../ui/core";
import { statusTone } from "../ui/MuscleMap";

export function phaseLabel(date: string): { label: string; detail: string; tone: "accent" | "gold" | "neutral" } {
  const week = cornellWeek(date);
  if (isCalibrationWeek(date)) return { label: "Calibration week", detail: "2 sets per exercise at ~3 RIR. Find honest starting loads.", tone: "neutral" };
  if (week === 8) return { label: "Deload week", detail: "Half the sets at 3-4 RIR. Recover, then start the next block.", tone: "neutral" };
  if (week === 2 || (week === 1 && cornellCycle(date) > 1)) return { label: "Ramp-up week", detail: "Full sets at 2-3 RIR.", tone: "accent" };
  return { label: "Build week", detail: "Full sets at 1-2 RIR. Isolation lifts can take the last set to 0-1 RIR.", tone: "gold" };
}

function logsOn(data: AppContext["data"], date: string) {
  return data.workoutLogs.filter((log) => log.date === date);
}

type DayState = "done" | "partial" | "missed" | "today" | "upcoming" | "rotc" | "optional" | "rest";

function dayState(data: AppContext["data"], date: string, today: string): { state: DayState; label: string } {
  const dayKey = dayKeyForDate(date);
  const logs = logsOn(data, date);
  const essential = trainingDaysForDate(date).includes(dayKey);
  if (ROTC_DAYS.includes(dayKey) && cornellActive(date)) {
    const logged = logs.some((log) => log.status === "completed" && log.exerciseLogs.some((entry) => entry.cardio?.completed));
    return { state: logged ? "done" : date === today ? "today" : "rotc", label: "ROTC" };
  }
  if (dayKey === OPTIONAL_DAY && cornellActive(date)) {
    const done = logs.some((log) => log.status === "completed" && (isCreditedSession(log) || log.exerciseLogs.some((entry) => entry.cardio?.completed && !entry.skipped)));
    return { state: done ? "done" : date === today ? "today" : "optional", label: "Opt" };
  }
  const workout = daysForDate(date)[dayKey];
  const label = workout.shortTitle.replace(/ \+ .*/, "").replace("Upper", "Up").replace("Lower", "Low");
  if (!essential) return { state: "rest", label: "Rest" };
  if (logs.some(isCreditedWorkout)) return { state: "done", label };
  if (logs.some((log) => isTrainingLog(log))) return { state: date === today ? "today" : "partial", label };
  if (date === today) return { state: "today", label };
  if (date < today) return { state: "missed", label };
  return { state: "upcoming", label };
}

export function WeekStrip({ ctx, date = todayISO() }: { ctx: AppContext; date?: string }) {
  const today = todayISO();
  const { from } = cornellWeekRange(date);
  const days = Array.from({ length: 7 }, (_, index) => addDays(from, index));
  return (
    <div className="week-strip" role="list" aria-label="This program week">
      {days.map((day) => {
        const { state, label } = dayState(ctx.data, day, today);
        const done = state === "done";
        return (
          <button
            type="button"
            role="listitem"
            key={day}
            className={cx("day-pill", day === today && "is-today", done && "is-done", state === "partial" && "is-partial", state === "missed" && "is-missed", state === "rotc" && "is-rotc")}
            onClick={() => (day <= today ? ctx.startWorkout(day) : navigate("routine"))}
            aria-label={`${formatDate(day, { weekday: "long" })}: ${label}, ${state}`}
          >
            <span>{formatDate(day, { weekday: "short" }).slice(0, 3)}</span>
            <b>{Number(day.slice(8))}</b>
            <span className="day-pill__dot">{done ? <Check size={13} /> : state === "rotc" ? <Footprints size={12} /> : null}</span>
            <small>{label}</small>
          </button>
        );
      })}
    </div>
  );
}

const overrideDays: DayKey[] = ["tuesday", "wednesday", "friday", "saturday", "sunday"];

function TodayCard({ ctx }: { ctx: AppContext }) {
  const today = todayISO();
  const [swapOpen, setSwapOpen] = useState(false);
  const dayKey = dayKeyForDate(today);
  const logs = logsOn(ctx.data, today);
  const draft = logs.find((log) => log.status === "draft");
  const completed = logs.find((log) => log.status === "completed");
  const active: WorkoutLog | undefined = draft ?? completed;
  const workout = active ? workoutForLog(active) : daysForDate(today)[dayKey];
  const exercises = active
    ? active.exerciseLogs.filter((entry) => !entry.cardio && !entry.skipped)
    : exercisesForDate(workout, today);
  const plannedSets = active ? setCompletionForLog(active).planned : exercisesForDate(workout, today).reduce((sum, exercise) => sum + (exercise.sets ?? 0), 0);
  const progress = active ? setCompletionForLog(active) : undefined;
  const phase = cornellActive(today) ? phaseLabel(today) : undefined;
  const isRotc = ROTC_DAYS.includes(dayKey) && cornellActive(today) && !active?.isScheduleOverride;
  const isOptional = dayKey === OPTIONAL_DAY && cornellActive(today) && !active?.isScheduleOverride;
  const muscles = Array.from(new Set(exercisesForDate(workout, today).flatMap((exercise) => exercise.muscleGroups?.slice(0, 1) ?? []))).slice(0, 5);
  const minutes = workout.subtitle.match(/(\d+-\d+)\s*min/)?.[1];

  const primaryLabel = draft ? "Continue workout" : completed ? "View recap" : isRotc ? "Log ROTC session" : isOptional ? "Start optional session" : "Start workout";
  const primary = () => {
    if (completed && !draft) navigate("recap", completed.id);
    else ctx.startWorkout(today, active?.dayKey);
  };

  return (
    <Card className="card--hero today-card">
      <div className="row row--between row--wrap">
        <p className="eyebrow">{cornellActive(today) ? `Week ${cornellWeek(today)} of 8 · ${phase?.label}` : "Today"}</p>
        {completed && (isCreditedSession(completed) || setCompletionForLog(completed).planned === 0) && <Chip tone="success" icon={<Check size={12} />}>Done</Chip>}
        {completed && setCompletionForLog(completed).planned > 0 && !isCreditedSession(completed) && <Chip tone="warn">Partial</Chip>}
      </div>
      <div>
        <h2 className="today-card__title">{workout.title}</h2>
        <p className="muted small" style={{ marginTop: 6 }}>{isRotc ? "Fixed PT session. Log the run and your push-up sets." : workout.intent}</p>
      </div>
      {!isRotc && (
        <div className="today-card__meta">
          {!!exercises.length && <span><Dumbbell size={15} /> {exercises.length} exercises · {plannedSets} sets</span>}
          {minutes && <span><Clock size={15} /> {minutes} min</span>}
          {phase && <span><Zap size={15} /> {phase.detail.split(".")[0]}</span>}
        </div>
      )}
      {!!muscles.length && (
        <div className="chip-row">
          {muscles.map((group) => <Chip key={group}>{muscleLabels[group]}</Chip>)}
        </div>
      )}
      {progress && draft && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="row row--between small"><span className="muted">In progress</span><span className="num">{progress.completed}/{progress.planned} sets</span></div>
          <Meter value={progress.completed} max={Math.max(1, progress.planned)} label="Sets logged" />
        </div>
      )}
      <div className="today-card__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={primary}>
          <Play size={18} /> {primaryLabel}
        </button>
        {!active && (
          <button type="button" className="btn btn--secondary btn--lg" onClick={() => setSwapOpen(true)} aria-label="Do a different workout today">
            <Shuffle size={17} /> Swap
          </button>
        )}
      </div>
      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title="Do a different workout today">
        <p className="muted small" style={{ marginBottom: 12 }}>Logs the chosen session for today only. Tomorrow follows the normal schedule.</p>
        <div className="list">
          {overrideDays.map((key) => {
            const option = daysForDate(today)[key];
            return (
              <button key={key} type="button" className="list-row" onClick={() => { setSwapOpen(false); ctx.startWorkout(today, key); }}>
                <span className="list-row__icon"><Dumbbell size={18} /></span>
                <span className="list-row__main"><strong>{option.title}</strong><span>{key[0].toUpperCase() + key.slice(1)}'s session</span></span>
                <ChevronRight size={18} />
              </button>
            );
          })}
        </div>
      </Sheet>
    </Card>
  );
}

export function HomePage({ ctx }: { ctx: AppContext }) {
  const { data, gamification } = ctx;
  const today = todayISO();
  const week = useMemo(() => summarizeMuscleWeek(data, today), [data, today]);
  const priorityOrder = ["side-delts", "lats", "upper-chest", "biceps", "triceps"];
  const priority = week.rows.filter((row) => row.target.priority).sort((a, b) => priorityOrder.indexOf(a.group) - priorityOrder.indexOf(b.group));
  const range = cornellWeekRange(today);
  const essentialsDone = new Set(data.workoutLogs.filter((log) => log.programId === CORNELL_ID && log.date >= range.from && log.date <= range.to && isCreditedWorkout(log)).map((log) => log.dayKey)).size;
  const essentialsTotal = trainingDaysForDate(today).length;
  const prsThisWeek = gamification.prs.filter((pr) => pr.date >= range.from && pr.date <= range.to);
  const nextBadge = [...gamification.achievements]
    .filter((badge) => !badge.unlocked && !badge.hidden)
    .sort((a, b) => b.progressCurrent / Math.max(1, b.progressTarget) - a.progressCurrent / Math.max(1, a.progressTarget))[0];
  const drafts = data.workoutLogs.filter((log) => log.status === "draft" && log.date !== today).slice(0, 2);
  const body = bodyTrend(data.bodyWeights);
  const latest = latestBodyWeight(data.bodyWeights);
  const showGame = gamification.settings.enabled;
  const optionalDone = data.workoutLogs.some((log) => log.date >= range.from && log.date <= range.to && isOptionalStrengthLog(log) && isCreditedSession(log));

  return (
    <div className="page">
      <PageHeader
        eyebrow={formatDate(today, { weekday: "long" })}
        title="Today"
        actions={showGame ? (
          <button type="button" className="chip chip--gold" onClick={() => navigate("progress")} aria-label={`Level ${gamification.level.level}, open progress`} style={{ minHeight: 32, border: 0 }}>
            <Trophy size={13} /> Lv {gamification.level.level}
          </button>
        ) : undefined}
      />

      <TodayCard ctx={ctx} />

      <Card>
        <SectionHeader
          eyebrow={`${formatDate(range.from)} – ${formatDate(range.to)}`}
          title="This week"
          action={<Ring value={essentialsDone} max={essentialsTotal} size={52} stroke={5} tone={essentialsDone >= essentialsTotal ? "success" : "accent"} label={`${essentialsDone} of ${essentialsTotal} essentials`}><span className="display-num" style={{ fontSize: 17 }}>{essentialsDone}/{essentialsTotal}</span></Ring>}
        />
        <WeekStrip ctx={ctx} />
        <p className="faint small" style={{ marginTop: 10 }}>
          {essentialsDone >= essentialsTotal ? "All four essentials done." : `${essentialsTotal - essentialsDone} essential session${essentialsTotal - essentialsDone === 1 ? "" : "s"} left.`}
          {optionalDone ? " Optional session banked." : " Sunday is optional."}
        </p>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Upper-priority muscles"
          title="Weekly sets vs target"
          action={<button type="button" className="link-btn" onClick={() => navigate("progress")}>Muscle map <ChevronRight size={15} /></button>}
        />
        <div className="priority-bars">
          {priority.map((row) => (
            <button key={row.group} type="button" className="vol-row" onClick={() => navigate("progress")}>
              <span className="vol-row__name">{row.label}</span>
              <span className="vol-row__value">{formatSets(row.sets)}<small>/{formatSets(row.planned)} planned</small></span>
              <span className="vol-row__meter"><Meter value={row.sets} max={Math.max(row.target.max, row.planned) * 1.1} tone={statusTone[row.status]} band={{ from: row.target.min * week.planScale, to: row.target.max }} label={`${row.label} weekly sets`} /></span>
            </button>
          ))}
        </div>
        <p className="faint small" style={{ marginTop: 8 }}>Shaded band = program starting range; individual response varies. Sets count 1 if direct, ½ if indirect.</p>
      </Card>

      {showGame && (
        <div className="grid-2">
          <Card className="card--gold">
            <div className="level-line">
              <div className="level-badge">{gamification.level.level}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="eyebrow">Level {gamification.level.level}</p>
                <strong style={{ fontSize: 17 }}>{gamification.level.title}</strong>
                <div style={{ marginTop: 8 }}><Meter value={gamification.level.currentLevelXP} max={gamification.level.nextLevelXP} tone="gold" label="XP to next level" /></div>
                <p className="faint small" style={{ marginTop: 6 }} >{gamification.level.xpToNext} XP to level {gamification.level.level + 1}</p>
              </div>
            </div>
            <div className="divider" />
            <div className="stat-grid">
              <div className="stat"><span className="stat__label">Perfect weeks</span><strong className="stat__value">{gamification.streaks.weeklyCompletion.current}<small>streak</small></strong><span className="stat__detail">Best {gamification.streaks.weeklyCompletion.best}</span></div>
              <div className="stat"><span className="stat__label">PRs this week</span><strong className="stat__value">{prsThisWeek.length}</strong><span className="stat__detail">{gamification.prs.length} all-time</span></div>
            </div>
            {nextBadge && (
              <div style={{ marginTop: 12 }}>
                <div className="row row--between small"><span><Flame size={14} /> Next: <b>{nextBadge.title}</b></span><span className="num faint">{Math.min(nextBadge.progressCurrent, nextBadge.progressTarget)}/{nextBadge.progressTarget}</span></div>
                <div style={{ marginTop: 6 }}><Meter value={nextBadge.progressCurrent} max={nextBadge.progressTarget} tone="gold" label={nextBadge.title} /></div>
              </div>
            )}
          </Card>
          <Card>
            <SectionHeader eyebrow="Recent wins" title="Personal records" action={<button type="button" className="link-btn" onClick={() => navigate("progress")}>All <ChevronRight size={15} /></button>} />
            {gamification.recentPRs.length ? (
              <div>
                {gamification.recentPRs.slice(0, 4).map((pr) => (
                  <div key={pr.id} className="pr-row">
                    <span className="pr-row__icon"><Trophy size={16} /></span>
                    <div style={{ minWidth: 0 }}>
                      <strong>{displayName(pr.exerciseName)}</strong>
                      <span>{classifyPRTier(pr).title} · {pr.label}</span>
                    </div>
                    <span className="faint small" style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{formatDate(pr.date)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">PRs appear when you beat a previous session at the same or better effort. Your first session of each lift sets the baseline.</p>
            )}
          </Card>
        </div>
      )}

      <Card>
        <SectionHeader eyebrow="Body" title={latest ? `${(body.average7 ?? latest.weight).toFixed(1)} lb` : "No weigh-ins yet"} detail={body.weeklyRatePercent !== null ? `${body.weeklyRatePercent >= 0 ? "+" : ""}${body.weeklyRatePercent.toFixed(2)}% per week · ${body.rateVerdict}` : "Log 3+ weigh-ins over two weeks to see your rate of gain."} action={<button type="button" className="btn btn--secondary btn--sm" onClick={() => navigate("weight")}>Log</button>} />
        {body.ratio && <p className="muted small">Shoulder-to-waist ratio <b className="num" style={{ color: "var(--text)" }}>{body.ratio.toFixed(2)}</b>{body.ratioChange !== null ? ` (${body.ratioChange >= 0 ? "+" : ""}${body.ratioChange.toFixed(2)} since first)` : ""}</p>}
      </Card>

      {!!drafts.length && (
        <Card>
          <SectionHeader eyebrow="Unfinished" title="Drafts" />
          <div className="list">
            {drafts.map((log) => (
              <button key={log.id} type="button" className="list-row" onClick={() => navigate("logger", log.id)}>
                <span className="list-row__main"><strong>{log.workoutTitle}</strong><span>{formatDate(log.date, { weekday: "short" })} · {setCompletionForLog(log).completed} sets logged</span></span>
                <ChevronRight size={18} />
              </button>
            ))}
          </div>
        </Card>
      )}
      <p className="faint small" style={{ textAlign: "center" }}>This program week: {formatSets(week.rows.reduce((sum, row) => sum + row.directSets, 0))} direct sets logged · {priorityLabel(week.priorityOnTarget, week.priorityTotal)}</p>
    </div>
  );
}

function priorityLabel(on: number, total: number): string {
  return `${on}/${total} priority muscles on target`;
}
