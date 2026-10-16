import { useMemo, useState } from "react";
import { ChevronRight, Dumbbell, Footprints, History as HistoryIcon, Search } from "../components/icons";
import { formatDate } from "../lib/date";
import { headlinePRs } from "../lib/gamification";
import { exerciseNameForId, isCreditedSession, setCompletionForLog, workoutVolume } from "../lib/progress";
import { AppContext } from "../ui/context";
import { Card, Chip, EmptyState, navigate, PageHeader, Segmented } from "../ui/core";

type Filter = "all" | "complete" | "partial" | "draft";

export function HistoryPage({ ctx }: { ctx: AppContext }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const prsByWorkout = useMemo(() => {
    const map = new Map<string, number>();
    headlinePRs(ctx.gamification.prs).forEach((pr) => map.set(pr.workoutId, (map.get(pr.workoutId) ?? 0) + 1));
    return map;
  }, [ctx.gamification.prs]);

  const rows = ctx.data.workoutLogs
    .map((log) => {
      const completion = setCompletionForLog(log);
      const strength = completion.planned > 0;
      const state: Exclude<Filter, "all"> = log.status === "draft" ? "draft" : strength && !isCreditedSession(log) ? "partial" : "complete";
      return { log, completion, strength, state };
    })
    .filter(({ log, state }) => {
      if (filter !== "all" && filter !== state) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const text = `${log.workoutTitle} ${log.date} ${formatDate(log.date)} ${log.notes ?? ""} ${log.exerciseLogs.map((entry) => entry.performedExerciseName ?? exerciseNameForId(entry.exerciseId)).join(" ")}`.toLowerCase();
      return text.includes(q);
    });

  const byMonth = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const key = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(`${row.log.date}T12:00:00`));
    byMonth.set(key, [...(byMonth.get(key) ?? []), row]);
  });

  return (
    <div className="page">
      <PageHeader title="History" subtitle={`${ctx.data.workoutLogs.filter((log) => log.status === "completed").length} completed logs`} />
      <label className="search">
        <Search size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search exercise, note or date" aria-label="Search history" />
      </label>
      <Segmented label="Filter logs" value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "complete", label: "Complete" }, { value: "partial", label: "Partial" }, { value: "draft", label: "Drafts" }]} />
      {rows.length ? Array.from(byMonth.entries()).map(([month, monthRows]) => (
        <Card key={month} className="card--tight">
          <p className="eyebrow" style={{ padding: "2px 2px 6px" }}>{month}</p>
          <div className="list">
            {monthRows.map(({ log, completion, strength, state }) => {
              const prs = prsByWorkout.get(log.id) ?? 0;
              const volume = workoutVolume(log);
              const skipped = log.exerciseLogs.filter((entry) => entry.skipped).length;
              return (
                <button key={log.id} type="button" className="list-row" onClick={() => navigate(log.status === "completed" ? "recap" : "logger", log.id)}>
                  <span className="list-row__icon">{strength ? <Dumbbell size={18} /> : <Footprints size={18} />}</span>
                  <span className="list-row__main">
                    <strong>{log.workoutTitle}</strong>
                    <span>
                      {formatDate(log.date, { weekday: "short" })}
                      {strength ? ` · ${completion.completed}/${completion.planned} sets` : ""}
                      {volume ? ` · ${Math.round(volume).toLocaleString()} lb` : ""}
                      {skipped ? ` · ${skipped} skipped` : ""}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 6 }}>
                    {prs > 0 && <Chip tone="gold">{prs} PR</Chip>}
                    {state === "draft" && <Chip tone="accent">Draft</Chip>}
                    {state === "partial" && <Chip tone="warn">Partial</Chip>}
                    {log.isScheduleOverride && <Chip>Swapped</Chip>}
                    <ChevronRight size={16} />
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )) : (
        <Card><EmptyState icon={<HistoryIcon size={20} />} title={ctx.data.workoutLogs.length ? "Nothing matches" : "No workouts yet"} detail={ctx.data.workoutLogs.length ? "Try a different search or filter." : "Your sessions appear here once you start logging."} action={!ctx.data.workoutLogs.length ? <button type="button" className="btn btn--primary" onClick={() => ctx.startWorkout()}>Start today</button> : undefined} /></Card>
      )}
    </div>
  );
}
