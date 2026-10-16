import React, { useEffect, useId, useRef } from "react";
import { X } from "../components/icons";

export type Page = "dashboard" | "today" | "routine" | "logger" | "recap" | "progress" | "weight" | "history" | "settings";

export interface Route {
  page: Page;
  id?: string;
}

const validPages: Page[] = ["dashboard", "today", "routine", "logger", "recap", "progress", "weight", "history", "settings"];

export function parseRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw) return { page: "dashboard" };
  const [page, id] = raw.split("/");
  if (page === "today") return { page: "dashboard" };
  return validPages.includes(page as Page) ? { page: page as Page, id } : { page: "dashboard" };
}

export function navigate(page: Page, id?: string) {
  window.location.hash = id ? `/${page}/${id}` : `/${page}`;
}

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? word : pluralWord}`;
}

/** Machine names carry the gym prefix in data; drop it on small screens. */
export function displayName(name: string): string {
  return name.replace(/^Helen Newman /, "");
}

export function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: React.ReactNode; title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}

export function Card({ className, children, as = "section", ...rest }: { className?: string; children: React.ReactNode; as?: "section" | "article" | "div" } & React.HTMLAttributes<HTMLElement>) {
  const Tag = as as "section";
  return <Tag className={cx("card", className)} {...rest}>{children}</Tag>;
}

export function SectionHeader({ eyebrow, title, action, detail }: { eyebrow?: React.ReactNode; title: React.ReactNode; action?: React.ReactNode; detail?: React.ReactNode }) {
  return (
    <div className="section-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2 className="section-title">{title}</h2>
        {detail && <p className="section-detail">{detail}</p>}
      </div>
      {action && <div className="section-header__action">{action}</div>}
    </div>
  );
}

export type Tone = "neutral" | "accent" | "gold" | "success" | "warn" | "danger" | "violet";

export function Chip({ tone = "neutral", children, className, icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return <span className={cx("chip", `chip--${tone}`, className)}>{icon}{children}</span>;
}

export function Meter({ value, max = 100, tone = "accent", label, band }: { value: number; max?: number; tone?: Tone; label?: string; band?: { from: number; to: number } }) {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx("meter", `meter--${tone}`)} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value * 10) / 10} aria-label={label}>
      {band && max > 0 && (
        <span className="meter__band" style={{ left: `${Math.min(100, (band.from / max) * 100)}%`, width: `${Math.max(0, Math.min(100, ((band.to - band.from) / max) * 100))}%` }} />
      )}
      <span className="meter__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Ring({ value, max = 100, size = 64, stroke = 6, tone = "accent", children, label }: { value: number; max?: number; size?: number; stroke?: number; tone?: Tone; children?: React.ReactNode; label?: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className={cx("ring", `ring--${tone}`)} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="ring__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" />
        <circle
          className="ring__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children && <div className="ring__content">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, unit, detail, tone }: { label: string; value: React.ReactNode; unit?: string; detail?: React.ReactNode; tone?: Tone }) {
  return (
    <div className={cx("stat", tone && `stat--${tone}`)}>
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}{unit && <small>{unit}</small>}</strong>
      {detail && <span className="stat__detail">{detail}</span>}
    </div>
  );
}

export function EmptyState({ title, detail, action, icon }: { title: string; detail?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty__icon">{icon}</div>}
      <strong>{title}</strong>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: React.ReactNode }>; value: T; onChange: (value: T) => void; label: string }) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          className={cx("segmented__option", option.value === value && "is-active")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Line chart with an area fill, faint grid and emphasized endpoint. Values are
 * plotted on one linear scale; min/max labels name values the series reaches.
 */
export function TrendChart({ values, labels, height = 120, tone = "accent", unit = "", secondary }: { values: number[]; labels?: string[]; height?: number; tone?: Tone; unit?: string; secondary?: number[] }) {
  const id = useId().replace(/:/g, "");
  const points = values.map((value, index) => ({ value, index })).filter((point) => Number.isFinite(point.value) && point.value > 0);
  if (points.length < 2) {
    return <div className="chart-empty">Log at least two sessions to draw a trend.</div>;
  }
  const width = 320;
  const pad = { top: 14, right: 12, bottom: 18, left: 12 };
  const all = [...points.map((point) => point.value), ...(secondary ?? []).filter((value) => Number.isFinite(value) && value > 0)];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const spread = max - min || Math.max(1, max * 0.05);
  const x = (index: number) => pad.left + (index / Math.max(1, values.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (1 - (value - (min - spread * 0.08)) / (spread * 1.16)) * (height - pad.top - pad.bottom);
  const line = points.map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.at(-1)!.index).toFixed(1)},${height - pad.bottom} L${x(points[0].index).toFixed(1)},${height - pad.bottom} Z`;
  const secondaryLine = secondary
    ?.map((value, index) => ({ value, index }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .map((point, i) => `${i ? "L" : "M"}${x(point.index).toFixed(1)},${y(point.value).toFixed(1)}`)
    .join(" ");
  const last = points.at(-1)!;
  const fmt = (value: number) => `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10}${unit}`;
  return (
    <div className={cx("chart", `chart--${tone}`)}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend from ${fmt(points[0].value)} to ${fmt(last.value)}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="chart__stop-top" />
            <stop offset="100%" className="chart__stop-bottom" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line key={fraction} className="chart__grid" x1={pad.left} x2={width - pad.right} y1={pad.top + fraction * (height - pad.top - pad.bottom)} y2={pad.top + fraction * (height - pad.top - pad.bottom)} />
        ))}
        <path d={area} fill={`url(#fill-${id})`} />
        {secondaryLine && <path className="chart__secondary" d={secondaryLine} fill="none" />}
        <path className="chart__line" d={line} fill="none" />
        <circle className="chart__end" cx={x(last.index)} cy={y(last.value)} r="4" />
      </svg>
      <div className="chart__axis">
        <span>{labels?.[points[0].index] ?? ""}</span>
        <span className="chart__range">{fmt(min)} – {fmt(max)}</span>
        <span>{labels?.[last.index] ?? ""}</span>
      </div>
    </div>
  );
}

/** Bottom sheet on phones, centered dialog on wide screens. */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("sheet-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("sheet-open");
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="sheet-layer" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <div className="sheet__grab" aria-hidden="true" />
        <div className="sheet__head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer && <div className="sheet__foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Disclosure({ summary, children, className, defaultOpen = false }: { summary: React.ReactNode; children: React.ReactNode; className?: string; defaultOpen?: boolean }) {
  return (
    <details className={cx("disclosure", className)} open={defaultOpen}>
      <summary>{summary}</summary>
      <div className="disclosure__body">{children}</div>
    </details>
  );
}

export function useCountUp(target: number, enabled: boolean, duration = 900): number {
  const [value, setValue] = React.useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);
  return value;
}
