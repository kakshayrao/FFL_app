"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Volume2, VolumeX, ChevronDown, Info } from 'lucide-react';
import { getSupabase } from "@/lib/supabase";

type TeamRow = { team_id: string; team_name: string; points: number; avg_rr: number | null };
type PlayerRow = { user_id: string; name: string; team: string | null; points: number; avg_rr: number | null };

type Challenge = { id: string; name: string; start_date: string; end_date: string };
type ChallengeScore = { challenge_id: string; team_id: string; score: number | null };

type TeamStanding = {
  teamId: string;
  teamName: string;
  points: number;
  avgRR: number;
  position: number; // 1-based
  delta: number; // position change vs previous day within the selected period (negative means moved up)
};

type RealTimeStanding = {
  teamId: string;
  teamName: string;
  todayPoints: number;
  yesterdayPoints: number;
  avgRR: number;
  position: number;
};

// ---------------------------
//  NEW ROSTER BALANCING LOGIC
// ---------------------------

// Canonical "full" roster size (baseline is 10 players)
const CANONICAL_ROSTER_SIZE = 10;

// Set roster sizes by team name (lowercase)
const TEAM_ROSTER_SIZES: Record<string, number> = {
  "crusaders": 11,
  "deccan warriors": 11,
  // Add other teams with non-10 rosters here
  // 10-player teams don't need to be listed (they get 10/10 = 1)
};

// Returns multiplier: 10/10, 10/11, etc.
function getRosterFactor(teamName: string): number {
  const size =
    TEAM_ROSTER_SIZES[teamName.toLowerCase()] ?? CANONICAL_ROSTER_SIZE;

  if (size <= CANONICAL_ROSTER_SIZE) return 1;
  return CANONICAL_ROSTER_SIZE / size;
}

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
  const [showTopInfo, setShowTopInfo] = useState(false);
  const [showRealTimeInfo, setShowRealTimeInfo] = useState(false);

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
  const seasonStartDate = useMemo(() => new Date(2025, 9, 15), []); // Oct 15 2025 (local)
  const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayLocal = () => startOfLocalDay(new Date());
  const ymdLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const addDaysLocal = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const todayYmdLocal = () => {
    const t = todayLocal();
    const y = t.getFullYear(); const m = String(t.getMonth() + 1).padStart(2, '0'); const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const isActiveChallenge = (c?: Challenge | null) => {
    if (!c) return false;
    const t = todayYmdLocal();
    return t >= String(c.start_date || '') && t <= String(c.end_date || '');
  };
  const formatChallengeDate = (value?: string | null) => {
    if (!value) return '—';
    const parts = String(value).split('-');
    if (parts.length !== 3) return String(value);
    const [y, m, d] = parts;
    if (!y || !m || !d) return String(value);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(m, 10) - 1;
    if (monthIndex < 0 || monthIndex > 11) return String(value);
    return `${d} ${monthNames[monthIndex]}`;
  };

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

  // Helper: day before yesterday
  const dayBeforeYesterday = useMemo(() => addDaysLocal(todayLocal(), -2), []);
  const dayBeforeYesterdayStr = useMemo(() => ymdLocal(dayBeforeYesterday), [dayBeforeYesterday]);
  
  // Today and yesterday for real-time table
  const todayDate = useMemo(() => todayLocal(), []);
  const yesterdayDate = useMemo(() => addDaysLocal(todayLocal(), -1), []);
  const todayDateStr = useMemo(() => ymdLocal(todayDate), [todayDate]);
  const yesterdayDateStr = useMemo(() => ymdLocal(yesterdayDate), [yesterdayDate]);
  
  // Format date for display (e.g., "Nov 30")
  const formatDateDisplay = (d: Date) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
  };

  // Standings table for selected period (as of day before yesterday)
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  
  // REAL-TIME STANDINGS (today + yesterday only)
  const [realTimeStandings, setRealTimeStandings] = useState<RealTimeStanding[]>([]);
  const [isLoadingRealTime, setIsLoadingRealTime] = useState(false);

  useEffect(() => {
    (async () => {
      setIsLoadingPeriod(true);
      setStandings([]); // Clear the table immediately when period changes
      const start = currentPeriod.start;
      // Use day before yesterday as the end date for the top table
      const periodEnd = dayBeforeYesterday < currentPeriod.end ? dayBeforeYesterday : currentPeriod.end;
      
      // If period end is before period start, show empty standings (0 points for all)
      const { data: allTeams } = await getSupabase().from('teams').select('id, name');
      const teams = (allTeams || []) as Array<{ id: string; name: string }>;
      
      if (periodEnd < start) {
        // Show all teams with 0 points
        const emptyStandings = teams.map((team, idx) => ({
          teamId: String(team.id),
          teamName: String(team.name),
          points: 0,
          avgRR: 0,
          position: idx + 1,
          delta: 0,
        }));
        setStandings(emptyStandings);
        setIsLoadingPeriod(false);
        return;
      }
      
      const prevEnd = ymdLocal(periodEnd) === ymdLocal(start) ? null : addDaysLocal(periodEnd, -1);

      // Fetch challenges with their end_dates and scores
      const { data: challenges } = await getSupabase()
        .from('special_challenges')
        .select('id, end_date');
      
      const { data: chScores } = await getSupabase()
        .from('special_challenge_team_scores')
        .select('challenge_id, team_id, score');

      // Build a map of challenge_id -> end_date
      const challengeEndDates = new Map<string, string>();
      (challenges || []).forEach((c: any) => {
        challengeEndDates.set(String(c.id), c.end_date || '');
      });

      // Only include challenge bonus if the challenge's end_date falls within the selected period (up to day before yesterday)
      const periodStartStr = ymdLocal(start);
      const periodEndStr = ymdLocal(periodEnd);
      
      const challengeBonusByTeam = new Map<string, number>();
      (chScores || []).forEach((r: any) => {
        const challengeId = String(r.challenge_id);
        const challengeEndDate = challengeEndDates.get(challengeId) || '';
        
        // Only add bonus if challenge end_date is within the selected period
        if (challengeEndDate && challengeEndDate >= periodStartStr && challengeEndDate <= periodEndStr) {
          const tid = String(r.team_id);
          const val = Number(r.score || 0);
          challengeBonusByTeam.set(tid, (challengeBonusByTeam.get(tid) || 0) + val);
        }
      });

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
          // -------------------------
          // REPLACED SECTION (FACTOR)
          // -------------------------
          const factor = getRosterFactor(String(team.name));
          const pointsRounded = Math.round(pts * factor);
          // Add Special Challenge bonus AFTER proportional rounding (display-only rule)
          const bonus = Number(challengeBonusByTeam.get(tid) || 0);
          const finalPoints = pointsRounded + (Number.isFinite(bonus) ? bonus : 0);
          const avgRR = rrCnt > 0 ? Math.round((rrSum / rrCnt) * 100) / 100 : 0;
          res.push({ teamId: tid, teamName: String(team.name), points: finalPoints, avgRR });
        }
        // sort by rounded (displayed) points, then RR
        res.sort((a,b)=> (b.points - a.points) || (b.avgRR - a.avgRR));
        return res;
      };

      const curr = await compute(start, periodEnd);
      const prev = prevEnd && prevEnd >= start ? await compute(start, prevEnd) : null;

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
  }, [selectedPeriod, dayBeforeYesterday]);

  // REAL-TIME SCOREBOARD: fetch today's and yesterday's entries
  useEffect(() => {
    (async () => {
      setIsLoadingRealTime(true);
      setRealTimeStandings([]);

      const { data: allTeams } = await getSupabase().from('teams').select('id, name');
      const teams = (allTeams || []) as Array<{ id: string; name: string }>;

      const results: RealTimeStanding[] = [];

      for (const team of teams) {
        const tid = String(team.id);

        // Fetch today's entries
        const { data: todayEntries } = await getSupabase()
          .from('entries')
          .select('type, rr_value')
          .eq('team_id', tid)
          .eq('status', 'approved')
          .eq('date', todayDateStr);

        // Fetch yesterday's entries
        const { data: yesterdayEntries } = await getSupabase()
          .from('entries')
          .select('type, rr_value')
          .eq('team_id', tid)
          .eq('status', 'approved')
          .eq('date', yesterdayDateStr);

        const todayEnts = todayEntries || [];
        const yesterdayEnts = yesterdayEntries || [];

        // Calculate today's points
        let todayPts = 0;
        todayEnts.forEach(e => {
          const rr = Number(e.rr_value || 0);
          const isRest = e.type === "rest";
          if (isRest && rr > 0) todayPts += 1;
          else if (!isRest) todayPts += 1;
        });

        // Calculate yesterday's points
        let yesterdayPts = 0;
        yesterdayEnts.forEach(e => {
          const rr = Number(e.rr_value || 0);
          const isRest = e.type === "rest";
          if (isRest && rr > 0) yesterdayPts += 1;
          else if (!isRest) yesterdayPts += 1;
        });

        // Apply roster factor
        const factor = getRosterFactor(String(team.name));
        const todayPointsScaled = Math.round(todayPts * factor);
        const yesterdayPointsScaled = Math.round(yesterdayPts * factor);

        // Calculate avg RR from both today and yesterday
        let rrSum = 0, rrCnt = 0;
        [...todayEnts, ...yesterdayEnts].forEach(e => {
          const rr = Number(e.rr_value || 0);
          if (rr > 0) {
            rrSum += rr;
            rrCnt++;
          }
        });
        const avgRR = rrCnt > 0 ? Math.round((rrSum / rrCnt) * 100) / 100 : 0;

        results.push({
          teamId: tid,
          teamName: String(team.name),
          todayPoints: todayPointsScaled,
          yesterdayPoints: yesterdayPointsScaled,
          avgRR,
          position: 0, // will be set after sorting
        });
      }

      // Sort by today's points desc, then avgRR desc
      results.sort((a, b) => {
        return (b.todayPoints - a.todayPoints) || (b.avgRR - a.avgRR);
      });

      // Assign positions
      results.forEach((r, idx) => {
        r.position = idx + 1;
      });

      setRealTimeStandings(results);
      setIsLoadingRealTime(false);
    })();
  }, [todayDateStr, yesterdayDateStr]);

  // ----- Challenges dropdown and team-wise scores -----
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [challengeScores, setChallengeScores] = useState<ChallengeScore[]>([]);
  const [teamsMeta, setTeamsMeta] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | null>(null);
  const [isLoadingChallenges, setIsLoadingChallenges] = useState<boolean>(true);
  const [challengeDropdownOpen, setChallengeDropdownOpen] = useState<boolean>(false);
  const challengeDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      setIsLoadingChallenges(true);
      try {
        const [{ data: chRows }, { data: scRows }, { data: tms }] = await Promise.all([
          getSupabase().from('special_challenges').select('id,name,start_date,end_date').order('created_at', { ascending: false }),
          getSupabase().from('special_challenge_team_scores').select('challenge_id,team_id,score'),
          getSupabase().from('teams').select('id,name'),
        ]);
        const chs = ((chRows || []) as any[]).map(r => ({
          id: String(r.id), name: String(r.name), start_date: String(r.start_date || ''), end_date: String(r.end_date || ''),
        })) as Challenge[];
        setChallenges(chs);
        setChallengeScores(((scRows || []) as any[]).map(r => ({
          challenge_id: String(r.challenge_id), team_id: String(r.team_id), score: r.score == null ? null : Number(r.score),
        })));
        setTeamsMeta(((tms || []) as any[]).map(r => ({ id: String(r.id), name: String(r.name) })));
        const active = chs.find(c => isActiveChallenge(c));
        setSelectedChallengeId(active ? active.id : (chs[0]?.id ?? null));
      } finally {
        setIsLoadingChallenges(false);
      }
    })();
  }, []);

  const selectedChallenge = useMemo(
    () => challenges.find(c => c.id === selectedChallengeId) || null,
    [challenges, selectedChallengeId]
  );
  const teamNameById = useMemo(() => {
    const m = new Map<string,string>();
    (teamsMeta || []).forEach(t => m.set(String(t.id), String(t.name)));
    return m;
  }, [teamsMeta]);
  const scoresForSelected = useMemo(() => {
    if (!selectedChallenge) return [] as Array<{ team_id: string; team_name: string; score: number | null }>;
    const list = challengeScores
      .filter(s => s.challenge_id === selectedChallenge.id)
      .map(s => ({ team_id: s.team_id, team_name: teamNameById.get(s.team_id) || s.team_id, score: s.score }));
    teamsMeta.forEach(t => {
      if (!list.find(r => r.team_id === t.id)) list.push({ team_id: t.id, team_name: t.name, score: null });
    });
    return list.sort((a,b) => {
      const as = a.score == null ? -Infinity : Number(a.score);
      const bs = b.score == null ? -Infinity : Number(b.score);
      return bs - as || a.team_name.localeCompare(b.team_name);
    });
  }, [selectedChallenge, challengeScores, teamsMeta, teamNameById]);

  useEffect(() => {
    if (!challengeDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (challengeDropdownRef.current && !challengeDropdownRef.current.contains(event.target as Node)) {
        setChallengeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [challengeDropdownOpen]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-rfl-navy mb-2">Leaderboard</h1>
          <p className="text-gray-600">Track your team’s race to the top!</p>
        </div>

        <div className="space-y-6">
        <Card className="bg-white shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-rfl-navy">Leaderboard</CardTitle>
                <div className="flex items-center gap-1.5">
                  <CardDescription>As of {formatDateDisplay(dayBeforeYesterday)}</CardDescription>
                  <div className="relative">
                    <button
                      onClick={() => setShowTopInfo(v => !v)}
                      className="text-gray-400 hover:text-rfl-navy transition-colors"
                      aria-label="More information"
                    >
                      <Info className="w-4 h-4" />
                    </button>
                    {showTopInfo && (
                      <>
                        {/* Backdrop to close on tap outside */}
                        <div className="fixed inset-0 z-10" onClick={() => setShowTopInfo(false)} />
                        {/* Mobile: fixed centered below icon area, Desktop: absolute left-aligned */}
                        <div className="fixed left-4 right-4 top-32 z-20 p-4 bg-white border border-gray-200 rounded-lg shadow-xl text-sm text-gray-700 sm:absolute sm:left-0 sm:right-auto sm:top-6 sm:w-72 sm:p-3">
                          <p>This table shows the official standings as of {formatDateDisplay(dayBeforeYesterday)}. Final points are submitted and cannot be changed.</p>
                          <p className="mt-2 text-gray-500">For real-time scores from today and yesterday, check the table below.</p>
                          <button 
                            onClick={() => setShowTopInfo(false)}
                            className="mt-3 text-xs text-rfl-coral hover:underline"
                          >
                            Close
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
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
                        <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-bold text-rfl-coral text-sm w-16">{t.points}</td>
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

        {/* BOTTOM TABLE: Real-time Scoreboard (today + yesterday) */}
        <Card className="bg-white shadow-md">
          <CardHeader>
            <div>
              <CardTitle className="text-xl text-rfl-navy">Real-time Scoreboard</CardTitle>
              <div className="flex items-center gap-1.5">
                <CardDescription>Today's and yesterday's scores</CardDescription>
                <div className="relative">
                  <button
                    onClick={() => setShowRealTimeInfo(v => !v)}
                    className="text-gray-400 hover:text-rfl-navy transition-colors"
                    aria-label="More information"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  {showRealTimeInfo && (
                    <>
                      {/* Backdrop to close on tap outside */}
                      <div className="fixed inset-0 z-10" onClick={() => setShowRealTimeInfo(false)} />
                      {/* Mobile: fixed centered below icon area, Desktop: absolute left-aligned */}
                      <div className="fixed left-4 right-4 top-auto bottom-40 z-20 p-4 bg-white border border-gray-200 rounded-lg shadow-xl text-sm text-gray-700 sm:absolute sm:left-0 sm:right-auto sm:bottom-auto sm:top-6 sm:w-72 sm:p-3">
                        <p>This table shows real-time scores ranked by today's points. Avg RR is calculated from both today's and yesterday's entries. These standings are subject to change as more entries come in.</p>
                        <p className="mt-2 text-gray-500">For official finalized standings, please refer to the Leaderboard table above.</p>
                        <button 
                          onClick={() => setShowRealTimeInfo(false)}
                          className="mt-3 text-xs text-rfl-coral hover:underline"
                        >
                          Close
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-gray-600">
                  <tr>
                    <th className="py-2 pr-2 text-xs font-semibold w-12">Rank</th>
                    <th className="py-2 pr-2 text-xs font-semibold">Team Name</th>
                    <th className="py-2 pr-2 text-xs font-semibold text-right whitespace-nowrap">{formatDateDisplay(todayDate)}</th>
                    <th className="py-2 pr-2 text-xs font-semibold text-right whitespace-nowrap">{formatDateDisplay(yesterdayDate)}</th>
                    <th className="py-2 pr-2 text-xs font-semibold text-right">Avg RR</th>
                  </tr>
                </thead>

                <tbody>
                  {realTimeStandings.map(t => {
                    const logoName = t.teamName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '') + '_Logo.jpeg';
                    const logoPath = `/img/${logoName}`;

                    return (
                      <tr key={t.teamId} className="border-t hover:bg-gray-50">
                        <td className="py-2 pr-2 font-bold text-rfl-navy text-sm w-12">{t.position}</td>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={logoPath}
                              onError={e => ((e.target as HTMLImageElement).src = '/img/placeholder-team.svg')}
                              className="w-6 h-6 rounded border object-cover"
                            />
                            <span className="font-medium text-rfl-navy text-sm whitespace-nowrap">{t.teamName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-2 text-right font-bold text-rfl-coral text-sm">{t.todayPoints}</td>
                        <td className="py-2 pr-2 text-right font-bold text-rfl-coral text-sm">{t.yesterdayPoints}</td>
                        <td className="py-2 pr-2 text-right font-semibold text-rfl-navy text-sm">
                          {t.avgRR.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}

                  {isLoadingRealTime ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-gray-600">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rfl-coral"></div>
                          <span>Loading...</span>
                        </div>
                      </td>
                    </tr>
                  ) : !realTimeStandings.length ? (
                    <tr><td colSpan={5} className="py-8 text-center text-gray-600">No data yet.</td></tr>
                  ) : null}

                </tbody>
              </table>
            </div>
          </CardContent>

        </Card>

        {/* Challenges dropdown + team-wise scores */}
        <Card className="bg-white shadow-md">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl text-rfl-navy">Challenges</CardTitle>
                <CardDescription>Team-wise scores per challenge</CardDescription>
                <p className="text-xs text-gray-600 mt-1">All points are added to the Team leaderboard above</p>
              </div>
              <div className="relative" ref={challengeDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    if (isLoadingChallenges || !challenges.length) return;
                    setChallengeDropdownOpen((prev) => !prev);
                  }}
                  disabled={isLoadingChallenges || !challenges.length}
                  className={`flex items-center w-36 px-2 py-1.5 text-sm border rounded-md transition ${
                    isLoadingChallenges || !challenges.length
                      ? "border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50"
                      : "border-gray-300 bg-white hover:bg-gray-50 text-gray-700 focus:outline-none focus:ring-2 focus:ring-rfl-coral focus:border-transparent"
                  }`}
                >
                  {/* make inner area flex-1 with min-w-0 so truncate works reliably */}
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-rfl-navy truncate">
                      {selectedChallenge
                        ? selectedChallenge.name
                        : isLoadingChallenges
                          ? "Loading..."
                          : "Select challenge"}
                    </span>

                    {/* ensure badge doesn't shrink */}
                    {/* {selectedChallenge && isActiveChallenge(selectedChallenge) && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 flex-shrink-0">
                        Active
                      </span>
                    )} */}
                  </span>

                  {/* ensure chevron never shrinks or disappears */}
                  <ChevronDown className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${challengeDropdownOpen ? "rotate-180" : ""}`} />
                </button>

                {challengeDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                    <div className="py-1 max-h-72 overflow-auto">
                      {challenges.map((c) => {
                        const active = isActiveChallenge(c);
                        const isSelected = selectedChallengeId === c.id;
                        return (
                          <button
                            key={c.id}
                            className={`w-full text-left px-4 py-2 text-sm flex flex-col gap-1 hover:bg-gray-100 ${
                              isSelected ? 'bg-rfl-coral/10 text-rfl-coral' : 'text-gray-700'
                            }`}
                            onClick={() => {
                              setSelectedChallengeId(c.id);
                              setChallengeDropdownOpen(false);
                            }}
                          >
                            <span className="flex items-center justify-between">
                          <span className="px-3 py-1 rounded-md bg-gray-100 text-sm font-medium text-rfl-navy border border-gray-200">
                            {c.name}
                          </span>
                              {active && (
                            <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                  Active
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-gray-500">
                          {formatChallengeDate(c.start_date)} to {formatChallengeDate(c.end_date)}
                            </span>
                          </button>
                        );
                      })}
                      {!challenges.length && (
                        <div className="px-4 py-3 text-sm text-gray-500">No challenges yet.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!challenges.length && !isLoadingChallenges ? (
              <div className="py-8 text-gray-600 text-center text-sm">No challenges yet.</div>
            ) : (
              <div className="overflow-hidden">
                {selectedChallenge && (
                  <div className="mb-4 flex items-center gap-3 text-sm min-h-[40px]">
                    <span className="inline-flex items-center px-4 py-2 rounded-md bg-gray-100 text-rfl-navy font-semibold border border-gray-200 max-w-[240px] truncate">
                      {selectedChallenge.name}
                    </span>
                    <span className="text-gray-600">
                      {formatChallengeDate(selectedChallenge.start_date)} to {formatChallengeDate(selectedChallenge.end_date)}
                    </span>
                    {isActiveChallenge(selectedChallenge) && (
                      <span className="text-xs px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-200">
                        Active
                      </span>
                    )}
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="text-left text-gray-600">
                    <tr>
                      <th className="py-2 pr-2 text-xs font-semibold w-12">Rank</th>
                      <th className="py-2 pr-2 text-xs font-semibold">Team</th>
                      <th className="py-2 pr-2 text-xs font-semibold text-right w-24">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(isLoadingChallenges || !selectedChallenge) ? (
                      <tr><td colSpan={3} className="py-8 text-gray-600 text-center text-sm">
                        <div className="flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rfl-coral"></div>
                          <span>Loading...</span>
                        </div>
                      </td></tr>
                    ) : (
                      scoresForSelected.map((r, idx) => {
                        const active = isActiveChallenge(selectedChallenge);
                        const showNotUpdated = (r.score == null);
                        return (
                          <tr key={r.team_id} className={`border-t ${active ? 'hover:bg-gray-50' : ''}`}>
                            <td className="py-2 pr-2 [font-variant-numeric:tabular-nums] text-sm w-12">{idx + 1}</td>
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <img
                                  src={`/img/${r.team_name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')}_Logo.jpeg`}
                                  alt={`${r.team_name} logo`}
                                  className="w-6 h-6 rounded border border-gray-200 object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = '/img/placeholder-team.svg';
                                  }}
                                />
                                <span className="text-sm text-rfl-navy font-medium">{r.team_name}</span>
                              </div>
                            </td>

                            <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold">
                              {showNotUpdated ? 'Not updated' : (r.score == null ? '' : r.score)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  )
}
