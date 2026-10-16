import React, { useState } from "react";
import { MuscleGroup } from "../types";
import { MuscleStatus, muscleDisplayGroups, muscleLabels, muscleStatusLabel, MuscleWeekSummary } from "../lib/muscles";
import { Chip, cx, displayName, formatSets, Meter, Tone } from "./core";

type Row = MuscleWeekSummary["rows"][number];

// Anatomical paths are drawn for the figure's left half (x < 100) and mirrored.
// Muscles the program does not track are drawn as neutral context only.
type Shape = { group?: MuscleGroup; d: string };

const FRONT: Shape[] = [
  { d: "M100,62 C94,64 86,68 78,72 C86,74 92,76 100,78 Z" },
  { group: "front-delts", d: "M77,76 C66,74 54,80 49,93 C47,101 48,110 52,117 C58,106 66,97 76,90 C80,86 80,80 77,76 Z" },
  { group: "side-delts", d: "M49,93 C42,101 40,115 42,129 C45,127 49,122 52,117 C48,110 47,101 49,93 Z" },
  { group: "upper-chest", d: "M98,80 L98,98 C89,101 79,101 70,98 C71,90 75,84 81,80 C87,78 93,78 98,80 Z" },
  { group: "chest", d: "M98,101 L98,127 C90,134 78,134 68,126 C62,119 62,108 69,101 C78,103 88,104 98,101 Z" },
  { group: "biceps", d: "M53,121 C47,133 45,151 47,167 C51,173 58,172 60,164 C62,149 62,134 59,123 Z" },
  { group: "forearms", d: "M45,175 C39,196 35,220 33,246 L41,248 C47,226 53,204 57,182 C55,176 49,173 45,175 Z" },
  { group: "abs-core", d: "M98,137 L98,159 L85,159 C84,151 85,143 87,137 Z" },
  { group: "abs-core", d: "M98,162 L98,185 L84,185 L84,162 Z" },
  { group: "abs-core", d: "M98,188 L98,212 L85,211 L84,188 Z" },
  { group: "abs-core", d: "M98,215 L98,239 C92,237 87,229 85,215 Z" },
  { group: "abs-core", d: "M81,138 C74,150 70,170 70,194 C71,209 75,221 81,229 C81,200 81,168 81,138 Z" },
  { group: "quads", d: "M70,244 C64,262 62,290 65,312 C69,324 77,330 85,328 C91,313 95,290 95,262 C91,252 82,246 70,244 Z" },
  { d: "M96,252 C98,270 98,290 96,300 C92,286 90,268 90,254 Z" },
  { group: "calves", d: "M73,342 C69,358 69,379 73,400 C77,404 81,402 83,396 C85,376 85,356 81,341 Z" },
  { d: "M84,344 C88,360 89,380 87,398 C86,402 84,402 84,398 C86,380 86,362 84,344 Z" },
];

const BACK: Shape[] = [
  { group: "upper-back", d: "M100,64 C92,68 83,73 74,78 C82,88 88,100 92,115 C95,127 98,139 100,150 Z" },
  { group: "rear-delts", d: "M74,80 C63,80 53,86 49,98 C50,107 54,113 58,116 C62,104 68,94 77,88 Z" },
  { group: "side-delts", d: "M49,98 C43,106 41,119 43,130 C47,126 51,121 55,116 C52,111 49,105 49,98 Z" },
  { group: "lats", d: "M66,113 C68,141 74,170 86,196 C90,202 94,206 98,208 L98,182 C94,162 91,141 89,119 C83,111 74,109 66,113 Z" },
  { d: "M98,206 L98,234 C90,232 84,226 82,215 C88,213 94,210 98,206 Z" },
  { group: "triceps", d: "M53,120 C47,132 45,150 47,168 C51,174 57,172 59,165 C61,150 61,134 59,122 Z" },
  { group: "forearms", d: "M45,175 C39,196 35,220 33,246 L41,248 C47,226 53,204 57,182 C55,176 49,173 45,175 Z" },
  { group: "glutes", d: "M98,238 C86,234 74,238 68,252 C66,264 70,276 80,280 C90,282 96,276 98,268 Z" },
  { group: "hamstrings", d: "M70,284 C66,302 66,321 70,335 C76,341 84,341 90,335 C94,319 96,301 96,286 C88,283 78,282 70,284 Z" },
  { group: "calves", d: "M72,345 C66,361 68,381 74,395 C78,399 82,397 84,391 C88,375 88,357 84,345 C80,341 76,341 72,345 Z" },
];

const SILHOUETTE =
  "M100,8 C88,8 80,18 80,32 C80,44 85,53 91,58 L91,64 C83,68 72,71 62,75 C50,80 43,90 41,104 C39,118 39,132 41,146 C39,160 37,172 37,180 C33,200 29,224 27,248 C25,262 25,276 29,286 C33,290 37,286 38,276 C40,262 42,252 44,244 C50,220 56,198 60,176 C62,166 64,154 66,146 C68,170 70,196 68,224 C64,238 61,250 61,262 C59,290 61,316 65,334 C65,356 67,380 71,404 C73,418 73,428 71,436 C75,443 86,443 90,436 C90,424 88,410 89,398 C91,376 93,354 92,336 C95,314 97,290 98,268 L100,258";

const statusTone: Record<MuscleStatus, Tone> = {
  none: "neutral",
  low: "warn",
  building: "accent",
  "on-target": "success",
  above: "violet",
};

function Figure({ view, rows, selected, onSelect }: { view: "front" | "back"; rows: Map<MuscleGroup, Row>; selected?: MuscleGroup; onSelect: (group: MuscleGroup) => void }) {
  const shapes = view === "front" ? FRONT : BACK;
  const renderShapes = (mirror: boolean) => shapes.map((shape, index) => {
    if (!shape.group) return <path key={`${mirror}-${index}`} className="mm-decor" d={shape.d} />;
    const row = rows.get(shape.group);
    const status = row?.status ?? "none";
    return (
      <path
        key={`${mirror}-${index}`}
        d={shape.d}
        className={cx("mm-muscle", `st-${status}`, selected === shape.group && "is-selected")}
        data-muscle={shape.group}
        role="button"
        tabIndex={0}
        aria-label={`${row?.label ?? shape.group}, ${view} view, ${mirror ? "right" : "left"} side`}
        aria-pressed={selected === shape.group}
        onClick={() => onSelect(shape.group!)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(shape.group!); } }}
      />
    );
  });
  return (
    <figure className="mm-figure">
      <svg viewBox="0 0 200 446" role="group" aria-label={`${view === "front" ? "Front" : "Back"} view muscle map`}>
        <path className="mm-silhouette" d={`${SILHOUETTE} L100,8 Z`} />
        <path className="mm-silhouette" d={`${SILHOUETTE} L100,8 Z`} transform="matrix(-1 0 0 1 200 0)" />
        <ellipse className="mm-head" cx="100" cy="32" rx="17" ry="22" />
        <g>{renderShapes(false)}</g>
        <g transform="matrix(-1 0 0 1 200 0)">{renderShapes(true)}</g>
      </svg>
      <figcaption>{view === "front" ? "Front" : "Back"}</figcaption>
    </figure>
  );
}

function guidance(row: Row): string {
  const { min, max } = row.target;
  if (min === 0) return row.sets > 0 ? "Trained indirectly through grip-heavy pulling. No direct target." : "No direct target; pulling covers it.";
  if (row.status === "none") return `Nothing logged yet. The plan schedules ${formatSets(row.planned)} sets this week.`;
  if (row.status === "low" || row.status === "building") {
    const remaining = Math.max(0, row.planned - row.sets);
    return remaining > 0
      ? `${formatSets(remaining)} planned sets not logged in this window. No catch-up sets required.`
      : `Below the ${min}-${max} starting range. Review consistency and recovery before changing volume.`;
  }
  if (row.status === "above") return "Above the planned range. Fine for a week; watch recovery and joint comfort.";
  if (row.sets < min) return `Below the ${min}-${max} starting range. Follow the next planned session without adding catch-up work.`;
  return `Within the ${min}-${max} starting range. Track performance and recovery, not sets alone.`;
}

export function VolumeRow({ row, onSelect, selected }: { row: Row; onSelect?: (group: MuscleGroup) => void; selected?: boolean }) {
  const scaleMax = Math.max(row.target.max * 1.25, row.sets, row.planned, 4);
  return (
    <button type="button" className={cx("vol-row", selected && "is-selected")} onClick={() => onSelect?.(row.group)}>
      <span className="vol-row__name">
        {row.label}
        {row.target.priority && <i className="vol-row__star" aria-label="priority">★</i>}
      </span>
      <span className="vol-row__value">{formatSets(row.sets)}<small>/{row.target.min ? `${row.target.min}-${row.target.max}` : "—"}</small></span>
      <span className="vol-row__meter">
        <Meter value={row.sets} max={scaleMax} tone={statusTone[row.status]} band={row.target.min ? { from: row.target.min, to: row.target.max } : undefined} label={`${row.label} sets`} />
      </span>
    </button>
  );
}

export function MuscleMap({ summary, compact = false, initial }: { summary: MuscleWeekSummary; compact?: boolean; initial?: MuscleGroup }) {
  const rows = new Map(summary.rows.map((row) => [row.group, row]));
  const firstTrained = summary.rows.find((row) => row.target.priority && row.sets > 0)?.group ?? summary.rows.find((row) => row.sets > 0)?.group;
  const [selected, setSelected] = useState<MuscleGroup | undefined>(initial ?? firstTrained ?? "side-delts");
  const row = selected ? rows.get(selected) : undefined;
  return (
    <div className={cx("mm", compact && "mm--compact")}>
      <div className="mm-stage">
        <Figure view="front" rows={rows} selected={selected} onSelect={setSelected} />
        <Figure view="back" rows={rows} selected={selected} onSelect={setSelected} />
      </div>
      <div className="mm-legend" aria-label="Legend">
        {(["none", "low", "building", "on-target", "above"] as MuscleStatus[]).map((status) => (
          <span key={status}><i className={`mm-swatch st-${status}`} />{muscleStatusLabel[status]}</span>
        ))}
      </div>
      {row && (
        <div className="mm-detail" aria-live="polite">
          <div className="mm-detail__head">
            <div>
              <p className="eyebrow">{row.target.priority ? "Priority muscle" : "Muscle"}</p>
              <h3>{muscleLabels[row.group]}</h3>
            </div>
            <Chip tone={statusTone[row.status]}>{muscleStatusLabel[row.status]}</Chip>
          </div>
          <div className="mm-detail__numbers">
            <div><strong>{formatSets(row.sets)}</strong><span>sets done</span></div>
            <div><strong>{formatSets(row.planned)}</strong><span>planned</span></div>
            <div><strong>{row.target.min ? `${row.target.min}-${row.target.max}` : "—"}</strong><span>target range</span></div>
          </div>
          <p className="mm-detail__guide">{guidance(row)}</p>
          {!!row.sources.length && (
            <ul className="mm-sources">
              {row.sources.slice(0, 5).map((source) => (
                <li key={source.name}><span>{displayName(source.name)}</span><b>{formatSets(Math.round(source.sets * 10) / 10)}</b></li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!compact && (
        <div className="vol-groups">
          {muscleDisplayGroups.map((group) => (
            <div key={group.title} className="vol-group">
              <p className="eyebrow">{group.title}</p>
              {group.groups.map((key) => {
                const item = rows.get(key)!;
                return <VolumeRow key={key} row={item} onSelect={setSelected} selected={selected === key} />;
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { statusTone };
