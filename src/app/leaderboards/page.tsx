"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Volume2, VolumeX } from 'lucide-react';
import { getSupabase } from "@/lib/supabase";

type TeamRow = { team_id: string; team_name: string; points: number; avg_rr: number | null };
type PlayerRow = { user_id: string; name: string; team: string | null; points: number; avg_rr: number | null };

type TeamStanding = {
  teamId: string;
  teamName: string;
  points: number;
  avgRR: number;
  position: number; // 1-based
  delta: number; // position change vs previous day within the selected period (negative means moved up)
};

// Proportional points adjustment for 13-player teams (display-only)
const THIRTEEN_PLAYER_TEAMS = new Set<string>([
  'dbecc2c2-6184-4692-a0f7-693adeae0b81', // Frolic Fetizens
  '7059747a-d1b8-479c-aff2-6a6a79c88998', // Interstellar
]);
const THIRTEEN_TEAM_FACTOR = 12 / 13;

export default function LeaderboardsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role as 'player' | 'leader' | 'governor' | undefined;
  useEffect(() => {
    if (role === 'governor') {
      router.replace('/governor');
    }
  }, [role, router]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersTotal, setPlayersTotal] = useState<number>(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingPeriod, setIsLoadingPeriod] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Initialize audio element lazily
  const ensureAudio = () => {
    if (!audioRef.current) {
      const el = new Audio('/audio/leaderboard-theme.mp3');
      el.preload = 'auto';
      el.onended = () => setIsPlaying(false);
      audioRef.current = el;
    }
    return audioRef.current;
  };

  const toggleAudio = async () => {
    try {
      const el = ensureAudio();
      if (isPlaying) {
        el.pause();
        el.currentTime = 0; // restart on next play
        setIsPlaying(false);
      } else {
        await el.play();
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Audio play failed (likely due to browser policies):', e);
    }
  };

  // Cleanup when navigating away
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        try {
          el.pause();
          el.currentTime = 0;
        } catch {}
      }
    };
  }, []);

  // Fetch leaderboards (existing)
  useEffect(() => {
    (async () => {
      setIsLoading(true);
      const fetchLeaderboards = async () => {
        const [{ data: t, error: teamError }, { data: p, error: playerError }] = await Promise.all([
          getSupabase().rpc('rfl_team_leaderboard'),
          getSupabase().rpc('rfl_individual_leaderboard'),
        ]);

        if (!teamError) {
          const teamsRows = (t || []) as TeamRow[];
          const teamsSorted = [...teamsRows].sort((a,b)=> (b.points - a.points) || ((b.avg_rr||0) - (a.avg_rr||0)));
          setTeams(teamsSorted);
        } else { setTeams([]); }

        if (!playerError) {
          const rp = (p || []) as Array<{ user_id: string; points: number; avg_rr: number | null }>;
          const userIds = rp.map(r => r.user_id);
          const { data: users } = userIds.length ? await getSupabase()
            .from('accounts').select('id, first_name, team_id').in('id', userIds) : { data: [] } as { data: Array<{ id: string; first_name: string; team_id: string | null }> };
          const teamIds = Array.from(new Set((users || []).map((u)=> String(u.team_id)).filter(Boolean)));
          const { data: teamsMeta } = teamIds.length ? await getSupabase().from('teams').select('id, name').in('id', teamIds) : { data: [] } as { data: Array<{ id: string; name: string }> };
          const teamNameById = new Map<string,string>();
          (teamsMeta || []).forEach((t)=> teamNameById.set(String(t.id), String(t.name)));
          const usersById = new Map((users || []).map((u)=> [String(u.id), u]));
          const playersAll: PlayerRow[] = rp.map(row => {
            const u = usersById.get(String(row.user_id));
            const teamName = u?.team_id ? (teamNameById.get(String(u.team_id)) || null) : null;
            return { user_id: String(row.user_id), name: String(u?.first_name || '—'), team: teamName, points: row.points, avg_rr: row.avg_rr } as PlayerRow;
          }).sort((a,b)=> (b.points - a.points) || ((b.avg_rr||0) - (a.avg_rr||0)));
          const from = (page - 1) * pageSize; const to = from + pageSize;
          setPlayersTotal(playersAll.length); setPlayers(playersAll.slice(from, to));
        } else { setPlayersTotal(0); setPlayers([]); }
      };
      await fetchLeaderboards();
      setIsLoading(false);
    })();
  }, [page]);

  // Utilities for period boundaries (LOCAL date semantics to avoid UTC drift)
  const seasonStartDate = useMemo(() => new Date(2025, 9, 25), []); // Oct 25 2025 (local)
  const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayLocal = () => startOfLocalDay(new Date());
  const ymdLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const addDaysLocal = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // Period dropdown options (Overall + completed/in-progress weeks)
  const periodOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; start: Date; end: Date }> = [];
    const start = seasonStartDate;
    const today = todayLocal();
    opts.push({ value: 'overall', label: 'Season Total', start, end: today });
    // Build week ranges starting at seasonStartDate in 7-day buckets
    let wkStart = new Date(start);
    let weekNum = 1;
    while (wkStart <= today) {
      const wkEnd = addDaysLocal(wkStart, 6);
      const shownEnd = wkEnd <= today ? wkEnd : today;
      const label = `Week ${weekNum}`;
      opts.push({ value: `week-${weekNum}`, label, start: new Date(wkStart), end: shownEnd });
      wkStart = addDaysLocal(wkStart, 7);
      weekNum++;
    }
    return opts;
  }, [seasonStartDate]);

  const [selectedPeriod, setSelectedPeriod] = useState<string>('overall');
  const currentPeriod = periodOptions.find(o => o.value === selectedPeriod) || periodOptions[0];

  // Standings table for selected period + position change vs previous day
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  useEffect(() => {
    (async () => {
      setIsLoadingPeriod(true);
      setStandings([]); // Clear the table immediately when period changes
      const start = currentPeriod.start;
      const end = currentPeriod.end;
      const prevEnd = ymdLocal(end) === ymdLocal(start) ? null : addDaysLocal(end, -1);

      // Fetch teams
      const { data: allTeams } = await getSupabase().from('teams').select('id, name');
      const teams = (allTeams || []) as Array<{ id: string; name: string }>;

      // Helper to compute standings within [s, e]
      const compute = async (s: Date, e: Date): Promise<Array<Omit<TeamStanding, 'position' | 'delta'>>> => {
        const res: Array<Omit<TeamStanding, 'position' | 'delta'>> = [];
        for (const team of teams) {
          const tid = String(team.id);
          const { data: entries } = await getSupabase()
            .from('entries')
            .select('type, rr_value, date')
            .eq('team_id', tid)
            .eq('status', 'approved')
            .gte('date', ymdLocal(s))
            .lte('date', ymdLocal(e));
          const ents = (entries || []) as Array<{ type: string; rr_value: number | null }>;        
          let pts = 0; let rrSum = 0; let rrCnt = 0;
          ents.forEach(e2 => {
            const rr = typeof e2.rr_value === 'number' ? e2.rr_value : Number(e2.rr_value || 0);
            const isRest = String(e2.type) === 'rest';
            if (isRest && rr > 0) pts += 1; else if (!isRest) pts += 1;
            if (rr > 0) { rrSum += rr; rrCnt += 1; }
          });
          // Apply proportional factor for 13-player teams (display only)
          let displayPts = pts;
          if (THIRTEEN_PLAYER_TEAMS.has(tid)) {
            displayPts = Math.round(pts * THIRTEEN_TEAM_FACTOR * 100) / 100;
          }
          const avgRR = rrCnt > 0 ? Math.round((rrSum / rrCnt) * 100) / 100 : 0;
          res.push({ teamId: tid, teamName: String(team.name), points: displayPts, avgRR });
        }
        // sort by adjusted points
        res.sort((a,b)=> (b.points - a.points) || (b.avgRR - a.avgRR));
        return res;
      };

      const curr = await compute(start, end);
      const prev = prevEnd ? await compute(start, prevEnd) : null;

      // map to positions and deltas
      const posByIdPrev = new Map<string, number>();
      if (prev) prev.forEach((t, idx) => posByIdPrev.set(t.teamId, idx + 1));
      const withMeta: TeamStanding[] = curr.map((t, idx) => {
        const prevPos = posByIdPrev.get(t.teamId);
        const position = idx + 1;
        const delta = typeof prevPos === 'number' ? position - prevPos : 0; // positive means moved down
        return { ...t, position, delta };
      });
      setStandings(withMeta);
      setIsLoadingPeriod(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-rfl-navy mb-2">Leaderboard</h1>
          <p className="text-gray-600">🔥 Today’s Leaderboard – Track your team’s race to the top!</p>
        </div>

        <div className="space-y-6">
        <Card className="bg-white shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-rfl-navy">Teams</CardTitle>
                <CardDescription>Standings table</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  aria-label={isPlaying ? 'Stop music' : 'Play music'}
                  onClick={toggleAudio}
                  className={`p-2 rounded-md border border-gray-300 ${isPlaying ? 'bg-rfl-coral text-white' : 'hover:bg-gray-50'}`}
                  title={isPlaying ? 'Stop' : 'Play'}
                >
                  {isPlaying ? <VolumeX className="w-4 h-4"/> : <Volume2 className="w-4 h-4"/>}
                </button>
                <div className="relative dropdown-container">
                <button
                  onClick={() => setDropdownOpen((v)=>!v)}
                  disabled={isLoadingPeriod}
                  className={`flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rfl-coral focus:border-transparent ${
                    isLoadingPeriod 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span>{periodOptions.find(opt => opt.value === selectedPeriod)?.label || 'Season Total'}</span>
                  <span className="text-gray-500">▾</span>
                </button>
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                    <div className="py-1 max-h-80 overflow-auto">
                      {periodOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSelectedPeriod(option.value); setDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${selectedPeriod === option.value ? 'bg-rfl-coral/10 text-rfl-coral' : 'text-gray-700'}`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr>
                    <th className="py-2 pr-2 text-xs font-semibold w-12">Rank</th>
                    <th className="py-2 pr-2 text-xs font-semibold w-32">Team Name</th>
                    <th className="py-2 pr-2 text-xs font-semibold text-right w-16">Points</th>
                    <th className="py-2 pr-2 text-xs font-semibold text-right w-16">Avg RR</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t) => {
                    // Convert team name to logo filename format
                    const logoName = t.teamName
                      .replace(/\s+/g, '_')
                      .replace(/[^a-zA-Z0-9_]/g, '') + '_Logo.jpeg';
                    const logoPath = `/img/${logoName}`;
                    
                    return (
                      <tr key={t.teamId} className="border-t hover:bg-gray-50">
                        <td className="py-2 pr-2 [font-variant-numeric:tabular-nums] font-bold text-rfl-navy text-sm w-12">{t.position}</td>
                        <td className="py-2 pr-2 w-32">
                          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                            <img 
                              src={logoPath} 
                              alt={`${t.teamName} logo`} 
                              className="w-6 h-6 rounded border border-gray-200 object-cover flex-shrink-0"
                              onError={(e) => {
                                // Fallback to placeholder if logo doesn't exist
                                (e.target as HTMLImageElement).src = '/img/placeholder-team.svg';
                              }}
                            />
                            <span className="font-medium text-rfl-navy text-sm whitespace-nowrap min-w-max">{t.teamName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-bold text-rfl-coral text-sm w-16">{Math.round(t.points)}</td>
                        <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold text-rfl-navy text-sm w-16">{t.avgRR.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                  {(isLoading || isLoadingPeriod) ? (
                    <tr><td colSpan={4} className="py-8 text-gray-600 text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rfl-coral"></div>
                        <span>Loading...</span>
                      </div>
                    </td></tr>
                  ) : !standings.length ? (
                    <tr><td colSpan={4} className="py-8 text-gray-600 text-center text-sm">No data yet.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        </div>
      </div>
    </div>
  )
}
