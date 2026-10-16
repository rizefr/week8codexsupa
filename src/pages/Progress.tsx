import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Trophy, Zap } from "../components/icons";
import { Exercise } from "../types";
import { addDays, formatDate, todayISO } from "../lib/date";
import { CORNELL_ID, CORNELL_START, cornellActive, cornellDays, cornellWeek, cornellWeekRange, trainingDaysForDate } from "../data/cornell";
import {
  bestAssistance,
  bestSessionStrength,
  bestSetReps,
  bestTimedSet,
  comparisonExerciseKey,
  exerciseSessions,
  isCreditedWorkout,
  nextSessionRecommendation,
  previousSetSummary,
  trackingTypeForExercise,
  totalRepsForExerciseLog,
} from "../lib/progress";
import { Achievement, classifyPRTier, headlinePRs, PRRecord } from "../lib/gamification";
import { summarizeMuscleRange } from "../lib/muscles";
import { AppContext } from "../ui/context";
import { Card, Chip, cx, displayName, EmptyState, Meter, PageHeader, SectionHeader, Segmented, Tone, TrendChart } from "../ui/core";
import { MuscleMap } from "../ui/MuscleMap";

type Tab = "muscles" | "strength" | "awards";

type LiftStatus = { label: string; tone: Tone; detail: string };

function liftMetric(exercise: Exercise, session: ReturnType<typeof exerciseSessions>[number]): number {
  const tracking = trackingTypeForExercise(exercise);
  if (tracking === "weighted-reps") return bestSessionStrength(session.exerciseLog, exercise).value;
  if (tracking === "assistance-reps") {
    // Lower assistance is better; use reps per unit of assistance as a rough score.
    const assist = bestAssistance(session.exerciseLog);
    const reps = totalRepsForExerciseLog(session.exerciseLog, exercise);
    return assist > 0 ? reps * 100 / assist : reps;
  }
  if (tracking === "timed") return bestTimedSet(session.exerciseLog);
  return bestSetReps(session.exerciseLog, exercise);
}

export function liftStatus(exercise: Exercise, sessions: ReturnType<typeof exerciseSessions>): LiftStatus {
  if (!sessions.length) return { label: "No data", tone: "neutral", detail: "Not logged yet." };
  if (sessions.length === 1) return { label: "Baseline", tone: "accent", detail: "One session logged. The next one sets the trend." };
  const values = sessions.map((session) => liftMetric(exercise, session));
  const last = values.at(-1)!;
  const priorBest = Math.max(...values.slice(0, -1));
  if (last > priorBest * 1.005) return { label: "Progressing", tone: "success", detail: "Latest session is your best yet." };
  // A plateau: three straight sessions without beating the best set before them.
  if (values.length >= 4) {
    const bestBeforeWindow = Math.max(...values.slice(0, -3));
    const window = values.slice(-3);
    if (window.every((value) => value <= bestBeforeWindow * 1.005)) {
      return { label: "Stalled", tone: "warn", detail: "3 sessions without beating your best. Check sleep and food first, then try 1 more rep at the same load, or hold load for a week." };
    }
  }
  return { label: "Holding", tone: "neutral", detail: "Within range of your best. Keep adding a rep before load." };
}

function planExercises(): Exercise[] {
  const seen = new Set<string>();
  const list: Exercise[] = [];
  trainingDaysForDate().forEach((day) => {
    cornellDays[day].exercises.forEach((exercise) => {
      const key = comparisonExerciseKey(exercise);
      if (seen.has(key)) return;
      seen.add(key);
      list.push(exercise);
    });
  });
  return list;
}

function StrengthTab({ ctx }: { ctx: AppContext }) {
  const exercises = useMemo(planExercises, []);
  const rows = useMemo(() => exercises.map((exercise) => {
    const sessions = exerciseSessions(ctx.data.workoutLogs, exercise);
    return { exercise, sessions, status: liftStatus(exercise, sessions) };
  }), [ctx.data.workoutLogs, exercises]);
  const firstWithData = rows.find((row) => row.sessions.length)?.exercise.id ?? exercises[0]?.id;
  const [selectedId, setSelectedId] = useState(firstWithData);
  const selected = rows.find((row) => row.exercise.id === selectedId) ?? rows[0];
  const tracking = selected ? trackingTypeForExercise(selected.exercise) : "weighted-reps";
  const stalled = rows.filter((row) => row.status.label === "Stalled").length;
  const progressing = rows.filter((row) => row.status.label === "Progressing").length;
  const recommendation = selected ? nextSessionRecommendation(ctx.data.workoutLogs, todayISO(), selected.exercise) : undefined;
  const values = selected ? selected.sessions.map((session) => liftMetric(selected.exercise, session)) : [];
  const labels = selected ? selected.sessions.map((session) => formatDate(session.workout.date)) : [];
  const unit = tracking === "weighted-reps" ? " lb" : tracking === "timed" ? " s" : "";
  const metricName = tracking === "weighted-reps" ? "Effort-adjusted strength (est. 1RM)" : tracking === "assistance-reps" ? "Reps per 100 lb assistance" : tracking === "timed" ? "Best hold" : "Best set (reps)";

  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat stat--success"><span className="stat__label">Progressing</span><strong className="stat__value">{progressing}</strong><span className="stat__detail">beat their best last time</span></div>
        <div className="stat stat--warn"><span className="stat__label">Stalled</span><strong className="stat__value">{stalled}</strong><span className="stat__detail">3 sessions, no new best</span></div>
      </div>
      {selected && (
        <Card>
          <SectionHeader eyebrow={metricName} title={displayName(selected.exercise.name)} action={<Chip tone={selected.status.tone}>{selected.status.label}</Chip>} />
          <TrendChart values={values} labels={labels} unit={unit} tone={selected.status.tone === "success" ? "success" : "accent"} />
          <p className="muted small" style={{ marginTop: 10 }}>{selected.status.detail}</p>
          {recommendation && recommendation.kind !== "insufficient" && !/^(Calibrate|Deload) this week$/.test(recommendation.title) && (
            <div className={cx("next-tip", `tone-${recommendation.kind}`)}><Zap size={16} /><span><strong>{recommendation.title}.</strong> {recommendation.detail}</span></div>
          )}
          {!!selected.sessions.length && (
            <div className="list" style={{ marginTop: 10 }}>
              {[...selected.sessions].reverse().slice(0, 6).map((session) => (
                <div key={session.exerciseLog.id} className="list-row" style={{ minHeight: 0 }}>
                  <span className="list-row__main"><strong>{formatDate(session.workout.date, { weekday: "short" })}</strong><span className="num">{previousSetSummary(session.exerciseLog, selected.exercise)}</span></span>
                  {tracking === "weighted-reps" && <span className="list-row__trail num">{Math.round(bestSessionStrength(session.exerciseLog, selected.exercise).value)} lb</span>}
                </div>
              ))}
            </div>
          )}
          <p className="faint small" style={{ marginTop: 10 }}>Strength estimate = load × (1 + (reps + RIR) ÷ 30). Counting RIR means extra effort alone doesn't look like a gain.</p>
        </Card>
      )}
      <Card className="card--flush">
        <div className="list">
          {rows.map((row) => (
            <button key={row.exercise.id} type="button" className={cx("list-row")} style={{ padding: "10px 16px", background: row.exercise.id === selected?.exercise.id ? "var(--surface-2)" : undefined }} onClick={() => setSelectedId(row.exercise.id)}>
              <span className="list-row__main"><strong>{displayName(row.exercise.name)}</strong><span>{row.sessions.length ? `${row.sessions.length} session${row.sessions.length === 1 ? "" : "s"} · last ${formatDate(row.sessions.at(-1)!.workout.date)}` : "Not logged yet"}</span></span>
              <Chip tone={row.status.tone}>{row.status.label}</Chip>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function prGroups(prs: PRRecord[]) {
  const byDate = new Map<string, PRRecord[]>();
  headlinePRs(prs).forEach((pr) => byDate.set(pr.date, [...(byDate.get(pr.date) ?? []), pr]));
  return Array.from(byDate.entries()).slice(0, 6);
}

function BadgeCard({ badge }: { badge: Achievement }) {
  return (
    <div className={cx("badge", badge.unlocked && "is-unlocked", `tier-${badge.tier ?? "bronze"}`)}>
      <span className="badge__medal">{badge.unlocked ? <Trophy size={18} /> : <Lock size={16} />}</span>
      <strong>{badge.title}</strong>
      <span>{badge.description}</span>
      {badge.unlocked
        ? <small>{badge.unlockedAt ? `Earned ${formatDate(badge.unlockedAt.slice(0, 10))}` : "Earned"}</small>
        : <><Meter value={badge.progressCurrent} max={badge.progressTarget} tone="gold" label={badge.title} /><small className="num">{Math.min(badge.progressCurrent, badge.progressTarget).toLocaleString()} / {badge.progressTarget.toLocaleString()}</small></>}
    </div>
  );
}

function AwardsTab({ ctx }: { ctx: AppContext }) {
  const { gamification, data } = ctx;
  const today = todayISO();
  const weeks = useMemo(() => {
    const list: Array<{ label: string; done: number }> = [];
    for (let back = 7; back >= 0; back -= 1) {
      const anchor = addDays(today, -7 * back);
      if (!cornellActive(anchor)) continue;
      const range = cornellWeekRange(anchor);
      const done = new Set(data.workoutLogs.filter((log) => log.programId === CORNELL_ID && log.date >= range.from && log.date <= range.to && isCreditedWorkout(log)).map((log) => log.dayKey)).size;
      list.push({ label: `W${cornellWeek(anchor)}`, done });
    }
    return list;
  }, [data.workoutLogs, today]);
  const visibleBadges = gamification.achievements.filter((badge) => badge.unlocked || !badge.hidden);
  const unlocked = visibleBadges.filter((badge) => badge.unlocked);
  const locked = visibleBadges.filter((badge) => !badge.unlocked).sort((a, b) => b.progressCurrent / b.progressTarget - a.progressCurrent / a.progressTarget);
  const heat = gamification.activities.slice(-84);

  return (
    <div className="stack">
      <Card className="card--gold">
        <div className="level-line">
          <div className="level-badge">{gamification.level.level}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="eyebrow">{gamification.totalXP.toLocaleString()} XP total</p>
            <strong style={{ fontSize: 18 }}>{gamification.level.title}</strong>
            <div style={{ marginTop: 8 }}><Meter value={gamification.level.currentLevelXP} max={gamification.level.nextLevelXP} tone="gold" label="Level progress" /></div>
            <p className="faint small" style={{ marginTop: 6 }}>{gamification.level.xpToNext} XP to level {gamification.level.level + 1}. XP comes from completed sessions, full logging, real PRs and perfect weeks, never from extra sets.</p>
          </div>
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Consistency" title={`${gamification.streaks.weeklyCompletion.current}-week perfect streak`} detail={`Best ${gamification.streaks.weeklyCompletion.best}. A perfect week means all four essentials, each mostly logged.`} />
        {weeks.length ? (
          <div className="week-bars" aria-label="Essential sessions per program week">
            {weeks.map((week, index) => (
              <div key={`${week.label}-${index}`}>
                <i className={cx(week.done >= 4 && "is-full")} style={{ height: `${Math.max(6, (week.done / 4) * 100)}%` }} title={`${week.done}/4`} />
                <span>{week.label}</span>
              </div>
            ))}
          </div>
        ) : <p className="faint small">Starts with your first Cornell week.</p>}
        <div className="divider" />
        <p className="eyebrow" style={{ marginBottom: 8 }}>Last 12 weeks</p>
        <div className="heat" aria-label="Activity heat map">
          {heat.map((day) => <i key={day.date} className={`h-${day.state}`} title={`${day.date}: ${day.summary}`} />)}
        </div>
      </Card>

      <Card>
        <SectionHeader eyebrow="Personal records" title={`${gamification.prs.length} all-time`} detail="One record per lift per session: a heavier load within your rep range, or a better effort-adjusted set." />
        {gamification.prs.length ? prGroups(gamification.prs).map(([date, prs]) => (
          <div key={date} style={{ marginBottom: 6 }}>
            <p className="eyebrow" style={{ margin: "8px 0 2px" }}>{formatDate(date, { weekday: "short" })}</p>
            {prs.slice(0, 4).map((pr) => (
              <div key={pr.id} className="pr-row">
                <span className="pr-row__icon"><Trophy size={15} /></span>
                <div><strong>{displayName(pr.exerciseName)}</strong><span>{classifyPRTier(pr).title} · {pr.label}</span></div>
              </div>
            ))}
            {prs.length > 4 && <p className="faint small" style={{ padding: "6px 0" }}>+{prs.length - 4} more that day</p>}
          </div>
        )) : <EmptyState title="No PRs yet" detail="Your first session of each lift is the baseline. Beat it at the same or better effort to set a PR." />}
      </Card>

      <Card>
        <SectionHeader eyebrow="Badges" title={`${unlocked.length} of ${visibleBadges.length} earned`} />
        <div className="badge-grid">
          {[...unlocked, ...locked].map((badge) => <BadgeCard key={badge.id} badge={badge} />)}
        </div>
      </Card>
    </div>
  );
}

export function ProgressPage({ ctx }: { ctx: AppContext }) {
  const [tab, setTab] = useState<Tab>("muscles");
  const [weekOffset, setWeekOffset] = useState(0);
  const today = todayISO();
  const anchor = addDays(today, -7 * weekOffset);
  const range = cornellActive(anchor) ? cornellWeekRange(anchor) : { from: addDays(anchor, -6), to: anchor };
  const summary = useMemo(() => summarizeMuscleRange(ctx.data, range.from, range.to), [ctx.data, range.from, range.to]);
  const canGoBack = addDays(range.from, -1) >= CORNELL_START || ctx.data.workoutLogs.some((log) => log.date < range.from);

  return (
    <div className="page">
      <PageHeader title="Progress" />
      <Segmented label="Progress view" value={tab} onChange={setTab} options={[{ value: "muscles", label: "Muscles" }, { value: "strength", label: "Strength" }, { value: "awards", label: "Awards" }]} />

      {tab === "muscles" && (
        <Card>
          <div className="row row--between" style={{ marginBottom: 12 }}>
            <button type="button" className="icon-btn" onClick={() => setWeekOffset((value) => value + 1)} disabled={!canGoBack} aria-label="Previous week"><ChevronLeft size={18} /></button>
            <div style={{ textAlign: "center" }}>
              <p className="eyebrow">{weekOffset === 0 ? "This week" : weekOffset === 1 ? "Last week" : `${weekOffset} weeks ago`}{cornellActive(anchor) ? ` · week ${cornellWeek(anchor)}` : ""}</p>
              <strong>{formatDate(range.from)} – {formatDate(range.to)}</strong>
            </div>
            <button type="button" className="icon-btn" onClick={() => setWeekOffset((value) => Math.max(0, value - 1))} disabled={weekOffset === 0} aria-label="Next week"><ChevronRight size={18} /></button>
          </div>
          <div className="row" style={{ marginBottom: 14, gap: 8 }}>
            <Chip tone={summary.priorityOnTarget === summary.priorityTotal ? "success" : "accent"}>{summary.priorityOnTarget}/{summary.priorityTotal} priority on target</Chip>
            {summary.planScale < 0.95 && <Chip>Reduced-volume week</Chip>}
          </div>
          <MuscleMap summary={summary} />
          <p className="faint small" style={{ marginTop: 12 }}>Hard sets per muscle: 1 for the main target, ½ for helpers (a row is ½ a biceps set). Logged ROTC push-up sets count toward chest and triceps. The range for each muscle is a starting dose for an upper-priority plan, not a universal optimum.</p>
        </Card>
      )}

      {tab === "strength" && <StrengthTab ctx={ctx} />}
      {tab === "awards" && <AwardsTab ctx={ctx} />}
    </div>
  );
}
