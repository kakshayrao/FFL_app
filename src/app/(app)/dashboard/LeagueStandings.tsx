"use client";

import React from "react";

export type LeagueTeam = {
  teamId: string;
  teamName: string;
  points: number;
  missedDays: number;
  avgRR?: number | null;
  restUsed?: number;
};

type Props = {
  teams: LeagueTeam[]; // already sorted desc by points
};

// Horizontal bar chart to show total points with missed days label at right
export default function LeagueStandings({ teams }: Props) {
  // Responsive canvas width: make the chart longer on phones for readability (scrollable within card)
  const [isSmall, setIsSmall] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia('(max-width: 640px)');
    const onChange = () => setIsSmall(m.matches);
    onChange();
    m.addEventListener ? m.addEventListener('change', onChange) : m.addListener(onChange);
    return () => { m.removeEventListener ? m.removeEventListener('change', onChange) : m.removeListener(onChange); };
  }, []);

  const width = 720; // keep within view; we'll reclaim space by moving labels inside bars
  // Vertically elongate chart: larger row height on all devices
  const rowH = isSmall ? 60 : 48;
  const paddingTop = 22;
  const paddingBottom = 20;
  const paddingLeft = 16; // reclaim left margin by placing names inside bars
  const paddingRight = 16; // tighter since labels moved to tooltip
  const height = paddingTop + paddingBottom + rowH * Math.max(1, teams.length);
  const scale = rowH / 34; // baseline row height was 34

  const maxPts = Math.max(1, ...teams.map(t => t.points));
  const x = (v: number) => paddingLeft + (v / maxPts) * (width - paddingLeft - paddingRight);

  const palette = "#6377F1"; // single color for consistency

  const barY = (idx: number) => paddingTop + idx * rowH;

  return (
    <div className="w-full">
      <div className="text-xs font-semibold text-rfl-navy mb-2">Team Standings</div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" aria-label="League standings bars">
        {/* X grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
          const gx = paddingLeft + p * (width - paddingLeft - paddingRight);
          return (
            <g key={i}>
              <line x1={gx} y1={paddingTop - 6 * scale} x2={gx} y2={height - paddingBottom} stroke="#e5e7eb" />
              <text x={gx} y={height - 2} fontSize={Math.round(10 * scale)} fill="#6b7280" textAnchor="middle">{Math.round(p * maxPts)}</text>
            </g>
          );
        })}

        {/* Rows */}
        {teams.map((t, idx) => {
          const y = barY(idx);
          const barW = Math.max(0, x(t.points) - paddingLeft);
          return (
            <g key={t.teamId}>
              {/* Team label */}
              {/* Team label moved inside bar area to save space */}
              {/* Bar background */}
              <rect x={paddingLeft} y={y + 8} width={width - paddingLeft - paddingRight} height={rowH - 16} fill="#f1f5f9" rx={4} />
              {/* Bar value */}
              <rect x={paddingLeft} y={y + 8} width={barW} height={rowH - 16} fill={palette} rx={4} />
              {/* Team name inside bar if space allows, otherwise just outside the bar */}
              {barW > 90 ? (
                <text x={paddingLeft + 8} y={y + rowH / 2} fontSize={Math.round(12 * scale)} fill="#ffffff" fontWeight={600} dominantBaseline="middle">{t.teamName}</text>
              ) : (
                <text x={paddingLeft + barW + 6} y={y + rowH / 2} fontSize={Math.round(12 * scale)} fill="#0f172a" dominantBaseline="middle">{t.teamName}</text>
              )}
              {/* Value label on bar (right end) */}
              <text x={paddingLeft + barW - 6} y={y + rowH / 2} fontSize={Math.round(12 * scale)} fill="#fff" textAnchor="end" fontWeight={700} dominantBaseline="middle">{t.points}</text>
            </g>
          );
        })}

        {/* Tooltip removed as requested */}
      </svg>
      <div className="text-[11px] text-gray-500 mt-1">Bars are sorted high to low. Number on each bar is total points.</div>
    </div>
  );
}


