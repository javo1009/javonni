"use client";

// Plan burn-up: cumulative planned vs studied hours to exam day, with a hover crosshair.
// Two series -> legend + direct labels; the summary sentence is the text alternative.
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type BurnPoint = { date: string; planned: number; done: number | null };

const H = 200;
const PAD = { l: 36, r: 64, t: 12, b: 24 };

export function BurnUp({ points, today, summary }: { points: BurnPoint[]; today: string; summary: string }) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  // Draw in real pixels (viewBox = container width) so labels stay legible on phones.
  const ref = useRef<HTMLElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { x, y, plannedPath, donePath, ticks, maxY } = useMemo(() => {
    const maxY = Math.max(1, ...points.map((p) => p.planned), ...points.map((p) => p.done ?? 0));
    const x = (i: number) => PAD.l + (i / Math.max(1, points.length - 1)) * (W - PAD.l - PAD.r);
    const y = (v: number) => H - PAD.b - (v / maxY) * (H - PAD.t - PAD.b);
    const plannedPath = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.planned).toFixed(1)}`).join(" ");
    const doneIdx = points.map((p, i) => (p.done === null ? -1 : i)).filter((i) => i >= 0);
    const donePath = doneIdx.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(points[i].done!).toFixed(1)}`).join(" ");
    const step = maxY > 200 ? 50 : maxY > 80 ? 20 : maxY > 30 ? 10 : 5;
    const ticks = Array.from({ length: Math.floor(maxY / step) + 1 }, (_, k) => k * step);
    return { x, y, plannedPath, donePath, ticks, maxY };
  }, [points, W]);

  if (points.length < 2) return null;
  const todayIdx = points.findIndex((p) => p.date >= today);
  const lastDone = [...points].reverse().find((p) => p.done !== null);
  const lastDoneIdx = lastDone ? points.indexOf(lastDone) : -1;
  const h = hover !== null ? points[hover] : null;

  return (
    <figure ref={ref} className="relative">
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-ink-2" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 rounded bg-brand" /> Studied
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-5 border-t-2 border-dashed border-ink-3" /> Planned
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none"
        role="img"
        aria-labelledby={`${id}-sum`}
        onPointerMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onPointerLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" fontSize={10} fill="var(--ink-3)">
              {t}h
            </text>
          </g>
        ))}
        {todayIdx > 0 && (
          <g>
            <line x1={x(todayIdx)} x2={x(todayIdx)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={x(todayIdx)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--ink-2)">
              Today
            </text>
          </g>
        )}
        <path d={plannedPath} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />
        <path d={donePath} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <text x={W - PAD.r + 6} y={y(points[points.length - 1].planned) + 4} fontSize={11} fill="var(--ink-2)">
          Planned
        </text>
        {lastDone && lastDoneIdx >= 0 && (
          <>
            <circle cx={x(lastDoneIdx)} cy={y(lastDone.done!)} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
            <text x={x(lastDoneIdx) + 8} y={y(lastDone.done!) - 6} fontSize={11} fill="var(--ink)">
              Studied
            </text>
          </>
        )}
        {h && hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-2)" strokeWidth={1} />
            <circle cx={x(hover)} cy={y(h.planned)} r={4} fill="var(--surface)" stroke="var(--ink-3)" strokeWidth={2} />
            {h.done !== null && <circle cx={x(hover)} cy={y(h.done)} r={4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />}
          </g>
        )}
        <rect x={0} y={0} width={W} height={H} fill="transparent" />
        <desc>{`Max ${Math.round(maxY)} hours`}</desc>
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute top-8 z-10 rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-[var(--shadow-card)]"
          style={{ left: `min(calc(${(x(hover!) / W) * 100}% + 12px), calc(100% - 9rem))` }}
        >
          <p className="font-medium text-ink">{h.date}</p>
          <p className="tabular text-ink-2">Planned {h.planned.toFixed(1)} h</p>
          {h.done !== null && <p className="tabular text-ink">Studied {h.done.toFixed(1)} h</p>}
        </div>
      )}
      <figcaption id={`${id}-sum`} className="mt-2 text-sm text-ink-2">
        {summary}
      </figcaption>
    </figure>
  );
}
