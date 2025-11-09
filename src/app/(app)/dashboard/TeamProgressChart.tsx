"use client";

import React, { useMemo, useState } from "react";

type TeamSeries = {
  teamId: string;
  teamName: string;
  points: number[];
  avgRR: number[];
};

type Props = {
  dates: string[];
  series: TeamSeries[];
};

// Multi-team comparison chart: lines = cumulative points per team; tooltip includes RR
export default function TeamProgressChart({ dates, series }: Props) {
  const width = 720; // responsive via viewBox
  const height = 240;
  const paddingLeft = 16; // keep minimal left padding
  const paddingRight = 56; // right y-axis for points
  const paddingTop = 28;
  const paddingBottom = 30; // x-axis labels

  const n = dates.length;
  const maxPts = Math.max(1, ...series.map(s => Math.max(...s.points, 0)));

  const innerW = width - paddingLeft - paddingRight;
  const innerH = height - paddingTop - paddingBottom;

  const x = (i: number) => paddingLeft + (i / Math.max(1, n - 1)) * innerW;
  const yPts = (v: number) => paddingTop + (1 - v / maxPts) * innerH;

  // Simple smoothing: average with neighbors (3-point moving average)
  const smooth = (vals: number[]): number[] => {
    if (vals.length <= 2) return vals;
    const smoothed = [...vals];
    for (let i = 1; i < vals.length - 1; i++) {
      smoothed[i] = (vals[i - 1] + vals[i] + vals[i + 1]) / 3;
    }
    return smoothed;
  };

  const path = (vals: number[]) => {
    const smoothed = smooth(vals);
    return smoothed.map((v, i) => `${i === 0 ? "M" : "L"}${x(i)},${yPts(v)}`).join(" ");
  };

  // ticks
  const xTickCount = 6;
  const xTicks = Array.from({ length: Math.min(xTickCount, n) }).map((_, idx) =>
    Math.round((idx / Math.max(1, xTickCount - 1)) * (n - 1))
  );
  const yRightTicks = 5;

  // Palette & dash patterns to reduce overlap confusion
  const palette = [
    "#E85C49", "#0F1E46", "#2563EB", "#16A34A", "#DB2777",
    "#F59E0B", "#06B6D4", "#8B5CF6", "#EF4444", "#10B981",
  ];
  const dashes = ["", "4 3", "6 4", "2 3", "8 5", "3 2", "5 3", "7 4"];

  // Visibility: show up to 6 teams by default; others toggled off
  const initialVisible = useMemo(() => new Set(series.slice(0, 6).map(s => s.teamId)), [series]);
  const [visible, setVisible] = useState<Set<string>>(initialVisible);

  const toggle = (id: string) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Tooltip state
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverHandlers = {
    onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = (e.target as SVGElement).closest("svg")!.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const rel = Math.max(0, Math.min(1, (px - paddingLeft) / innerW));
      const idx = Math.round(rel * (n - 1));
      setHoverIdx(Number.isFinite(idx) ? Math.max(0, Math.min(n - 1, idx)) : null);
    },
    onMouseLeave: () => setHoverIdx(null),
  } as const;

  const hoverX = hoverIdx !== null ? x(hoverIdx) : null;

  const dateLabel = (d: string) => {
    const [_, m, da] = d.split("-");
    return `${Number(m)}/${Number(da)}`;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56" {...hoverHandlers}>
        {/* Axes */}
        <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />
        {/* Right Y axis for POINTS */}
        <line x1={width - paddingRight} y1={paddingTop} x2={width - paddingRight} y2={height - paddingBottom} stroke="#e5e7eb" />

        {/* Horizontal grid + right y labels (points) */}
        {Array.from({ length: yRightTicks + 1 }).map((_, i) => {
          const v = (i / yRightTicks) * maxPts;
          const y = yPts(v);
          return (
            <g key={`r-${i}`}>
              <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f3f4f6" />
              <text x={width - paddingRight + 6} y={y + 3} fontSize="10" fill="#6b7280">{Math.round(v)}</text>
            </g>
          );
        })}

        {/* X ticks */}
        {xTicks.map((i, k) => (
          <g key={`x-${k}`}>
            <line x1={x(i)} y1={height - paddingBottom} x2={x(i)} y2={height - paddingBottom + 4} stroke="#9ca3af" />
            <text x={x(i)} y={height - paddingBottom + 14} fontSize="10" fill="#6b7280" textAnchor="middle">{dateLabel(dates[i])}</text>
          </g>
        ))}

        {/* Series: cumulative points per team */}
        {series.map((s, idx) => {
          const color = palette[idx % palette.length];
          const dash = dashes[idx % dashes.length];
          const shown = visible.has(s.teamId);
          return (
            <g key={s.teamId} opacity={shown ? 1 : 0.15}>
              <path d={path(s.points)} fill="none" stroke={color} strokeWidth={shown ? 2 : 1.5} strokeDasharray={dash} />
              {/* Hover dots */}
              {hoverIdx !== null && shown && (
                <circle cx={x(hoverIdx)} cy={yPts(s.points[hoverIdx])} r={3} fill={color} />
              )}
            </g>
          );
        })}

        {/* Hover guideline */}
        {hoverIdx !== null && (
          <line x1={hoverX!} y1={paddingTop} x2={hoverX!} y2={height - paddingBottom} stroke="#9ca3af" strokeDasharray="3 3" />
        )}

        {/* Legend with toggles */}
        <foreignObject x={paddingLeft} y={4} width={width - paddingLeft - paddingRight - 8} height={40}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {series.map((s, idx) => {
              const color = palette[idx % palette.length];
              const dash = dashes[idx % dashes.length];
              const active = visible.has(s.teamId);
              return (
                <button key={s.teamId} onClick={() => toggle(s.teamId)} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e5e7eb', padding: '2px 6px', borderRadius: 6, background: active ? '#fff' : '#f9fafb', opacity: active ? 1 : 0.6 }}>
                  <span style={{ width: 18, height: 0, borderTop: `3px ${dash ? 'dashed' : 'solid'} ${color}`, display: 'inline-block' }} />
                  <span style={{ fontSize: 11, color: '#0f172a', whiteSpace: 'nowrap' }}>{s.teamName}</span>
                </button>
              );
            })}
          </div>
        </foreignObject>

        {/* Tooltip */}
        {hoverIdx !== null && (
          <g>
            <foreignObject x={Math.min(width - 220, Math.max(paddingLeft, (hoverX || 0) + 8))} y={paddingTop + 8} width="210" height="140">
              <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 6, padding: 8, fontSize: 12, color: '#111', maxHeight: 140, overflowY: 'auto' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>{dateLabel(dates[hoverIdx])}</div>
                {series.map((s, idx) => {
                  if (!visible.has(s.teamId)) return null;
                  const color = palette[idx % palette.length];
                  return (
                    <div key={s.teamId} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span style={{ width: 10, height: 10, background: color, borderRadius: 9999 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.teamName}</span>
                      </div>
                      <div style={{ textAlign: 'right', color: '#334155' }}>
                        <div>Pts: {s.points[hoverIdx]}</div>
                        <div>RR: {s.avgRR[hoverIdx]?.toFixed(2) ?? '0.00'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </foreignObject>
          </g>
        )}
      </svg>
    </div>
  );
}


