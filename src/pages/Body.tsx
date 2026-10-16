import { FormEvent, useState } from "react";
import { ChevronRight, Plus, Ruler } from "../components/icons";
import { BodyWeightLog } from "../types";
import { formatDate, todayISO } from "../lib/date";
import { createId } from "../lib/progress";
import { bodyTrend, LEAN_BULK_BAND } from "../lib/body";
import { AppContext } from "../ui/context";
import { Card, Chip, Disclosure, EmptyState, Meter, PageHeader, SectionHeader, TrendChart } from "../ui/core";

type Draft = { id?: string; date: string; weight: string; waist: string; shoulders: string; chest: string; arm: string; bodyFat: string; note: string };

const blank = (): Draft => ({ date: todayISO(), weight: "", waist: "", shoulders: "", chest: "", arm: "", bodyFat: "", note: "" });

function positive(value: string, max: number): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= max ? parsed : NaN;
}

export function BodyPage({ ctx }: { ctx: AppContext }) {
  const [draft, setDraft] = useState<Draft>(blank);
  const [error, setError] = useState("");
  const [measureOpen, setMeasureOpen] = useState(false);
  const trend = bodyTrend(ctx.data.bodyWeights);
  const sorted = trend.weights;
  const first = sorted[0];
  const latest = sorted.at(-1);
  const measured = sorted.filter((entry) => (entry.waistIn ?? 0) > 0 && (entry.shouldersIn ?? 0) > 0);
  const set = (key: keyof Draft) => (event: { target: { value: string } }) => setDraft((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const weight = positive(draft.weight, 600);
    const values = {
      waistIn: positive(draft.waist, 80),
      shouldersIn: positive(draft.shoulders, 90),
      chestIn: positive(draft.chest, 80),
      armIn: positive(draft.arm, 40),
      bodyFatPercent: positive(draft.bodyFat, 60),
    };
    if (!weight || Number.isNaN(weight)) {
      setError("Enter your body weight in pounds.");
      return;
    }
    if (Object.values(values).some((value) => Number.isNaN(value))) {
      setError("Check the measurements: use inches and a realistic number.");
      return;
    }
    const entry: BodyWeightLog = {
      id: draft.id ?? createId("weight"),
      date: draft.date,
      weight,
      ...Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)),
      note: draft.note || undefined,
    };
    ctx.saveWeight(entry);
    setDraft(blank());
    setError("");
    setMeasureOpen(false);
  };

  const edit = (entry: BodyWeightLog) => {
    setDraft({
      id: entry.id,
      date: entry.date,
      weight: String(entry.weight),
      waist: entry.waistIn ? String(entry.waistIn) : "",
      shoulders: entry.shouldersIn ? String(entry.shouldersIn) : "",
      chest: entry.chestIn ? String(entry.chestIn) : "",
      arm: entry.armIn ? String(entry.armIn) : "",
      bodyFat: entry.bodyFatPercent ? String(entry.bodyFatPercent) : "",
      note: entry.note ?? "",
    });
    setMeasureOpen(!!(entry.waistIn || entry.shouldersIn || entry.chestIn || entry.armIn || entry.bodyFatPercent));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const rate = trend.weeklyRatePercent;
  const rateTone = trend.rateTone === "success" ? "success" : trend.rateTone === "warn" ? "warn" : "neutral";

  return (
    <div className="page">
      <PageHeader title="Body" subtitle="Weigh in 3-4 mornings a week; measure monthly." />

      <Card>
        <form onSubmit={submit} className="stack">
          <SectionHeader eyebrow={draft.id ? "Editing entry" : "New entry"} title={draft.id ? formatDate(draft.date, { weekday: "short" }) : "Log a weigh-in"} action={draft.id ? <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDraft(blank()); setMeasureOpen(false); }}>Cancel</button> : undefined} />
          <div className="form-grid">
            <label className="field">Date<input type="date" value={draft.date} onChange={set("date")} required /></label>
            <label className="field">Weight (lb)<input value={draft.weight} onChange={set("weight")} inputMode="decimal" placeholder={latest ? latest.weight.toFixed(1) : "142.0"} required /></label>
          </div>
          {measureOpen ? (
            <div className="form-grid">
              <label className="field">Waist (in)<input value={draft.waist} onChange={set("waist")} inputMode="decimal" placeholder="at navel" /></label>
              <label className="field">Shoulders (in)<input value={draft.shoulders} onChange={set("shoulders")} inputMode="decimal" placeholder="widest point" /></label>
              <label className="field">Chest (in)<input value={draft.chest} onChange={set("chest")} inputMode="decimal" placeholder="optional" /></label>
              <label className="field">Arm (in)<input value={draft.arm} onChange={set("arm")} inputMode="decimal" placeholder="flexed, optional" /></label>
              <label className="field">Body fat %<input value={draft.bodyFat} onChange={set("bodyFat")} inputMode="decimal" placeholder="only if measured" /></label>
              <label className="field">Note<input value={draft.note} onChange={set("note")} placeholder="sodium, sleep…" /></label>
            </div>
          ) : (
            <button type="button" className="btn btn--secondary" onClick={() => setMeasureOpen(true)}><Ruler size={16} /> Add measurements</button>
          )}
          {error && <p className="small" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" className="btn btn--primary btn--block"><Plus size={17} /> {draft.id ? "Save changes" : "Save weigh-in"}</button>
        </form>
      </Card>

      <div className="stat-grid stat-grid--4">
        <div className="stat"><span className="stat__label">7-entry avg</span><strong className="stat__value">{trend.average7 ? trend.average7.toFixed(1) : "—"}<small>lb</small></strong><span className="stat__detail">{latest ? `Last ${latest.weight.toFixed(1)} on ${formatDate(latest.date)}` : "No entries"}</span></div>
        <div className={`stat stat--${rateTone === "neutral" ? "accent" : rateTone}`}><span className="stat__label">Weekly rate</span><strong className="stat__value">{rate === null ? "—" : `${rate >= 0 ? "+" : ""}${rate.toFixed(2)}`}<small>%/wk</small></strong><span className="stat__detail">{rate === null ? "Need 3+ entries over a week" : `${trend.weeklyRateLb! >= 0 ? "+" : ""}${trend.weeklyRateLb!.toFixed(2)} lb/wk · ${trend.rateVerdict}`}</span></div>
        <div className="stat"><span className="stat__label">Since start</span><strong className="stat__value">{first && latest && sorted.length > 1 ? `${latest.weight - first.weight >= 0 ? "+" : ""}${(latest.weight - first.weight).toFixed(1)}` : "—"}<small>lb</small></strong><span className="stat__detail">{first ? `from ${formatDate(first.date)}` : ""}</span></div>
        <div className="stat stat--gold"><span className="stat__label">Shoulder : waist</span><strong className="stat__value">{trend.ratio ? trend.ratio.toFixed(2) : "—"}</strong><span className="stat__detail">{trend.ratioChange !== null ? `${trend.ratioChange >= 0 ? "+" : ""}${trend.ratioChange.toFixed(2)} since first` : trend.ratio ? "First measurement · re-measure monthly" : "Log shoulders + waist"}</span></div>
      </div>

      <Card>
        <SectionHeader eyebrow="Lean-bulk pace" title={rate === null ? "Building your trend" : `${trend.rateVerdict[0].toUpperCase()}${trend.rateVerdict.slice(1)}`} detail={`Lean-bulk reference: +${LEAN_BULK_BAND.min}–${LEAN_BULK_BAND.max}% of body weight per week (${latest ? `${(latest.weight * LEAN_BULK_BAND.min / 100).toFixed(2)}–${(latest.weight * LEAN_BULK_BAND.max / 100).toFixed(2)} lb` : "≈0.35–0.7 lb at 142 lb"}). This is not a required gain rate. Slower or stable weight can suit recomp; use several weeks of performance and waist trends, not daily fluctuations.`} />
        {rate !== null && <Meter value={Math.max(0, rate + 0.5)} max={1.5} tone={rateTone === "neutral" ? "accent" : rateTone} band={{ from: LEAN_BULK_BAND.min + 0.5, to: LEAN_BULK_BAND.max + 0.5 }} label="Weekly rate vs lean-bulk band" />}
        {rate !== null && <div className="row row--between faint small" style={{ marginTop: 4 }}><span>−0.5%</span><span>0</span><span>+1.0%</span></div>}
        <div style={{ marginTop: 14 }}>
          <TrendChart values={sorted.map((entry) => entry.weight)} secondary={trend.movingAverage} labels={sorted.map((entry) => formatDate(entry.date))} unit=" lb" />
        </div>
        <p className="faint small" style={{ marginTop: 6 }}>Solid line: daily weigh-ins. Dashed: 7-entry average, the number to steer by.</p>
      </Card>

      <Card>
        <SectionHeader eyebrow="V-taper" title="Measurements" detail="Shoulders up, waist steady = the look you're after. Measure monthly, same time of day." />
        {measured.length >= 2 ? (
          <div className="grid-2">
            <div><p className="eyebrow" style={{ marginBottom: 6 }}>Shoulder : waist ratio</p><TrendChart values={measured.map((entry) => (entry.shouldersIn ?? 0) / (entry.waistIn ?? 1))} labels={measured.map((entry) => formatDate(entry.date))} tone="gold" /></div>
            <div><p className="eyebrow" style={{ marginBottom: 6 }}>Waist (in)</p><TrendChart values={measured.map((entry) => entry.waistIn ?? 0)} labels={measured.map((entry) => formatDate(entry.date))} unit="″" /></div>
          </div>
        ) : (
          <EmptyState icon={<Ruler size={20} />} title={measured.length ? "One measurement logged" : "No measurements yet"} detail="Add shoulder and waist measurements with a weigh-in. Two entries draw your V-taper trend." />
        )}
      </Card>

      <Disclosure summary={`History · ${sorted.length} entr${sorted.length === 1 ? "y" : "ies"}`}>
        {sorted.length ? (
          <div className="list">
            {[...sorted].reverse().map((entry) => (
              <button key={entry.id} type="button" className="list-row" onClick={() => edit(entry)}>
                <span className="list-row__main">
                  <strong className="num">{entry.weight.toFixed(1)} lb</strong>
                  <span>{formatDate(entry.date, { weekday: "short", year: "numeric" })}{entry.waistIn ? ` · waist ${entry.waistIn}″` : ""}{entry.shouldersIn ? ` · shoulders ${entry.shouldersIn}″` : ""}{entry.note ? ` · ${entry.note}` : ""}</span>
                </span>
                {entry.bodyFatPercent ? <Chip>{entry.bodyFatPercent}%</Chip> : null}
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        ) : <p>No weigh-ins yet.</p>}
      </Disclosure>
    </div>
  );
}
