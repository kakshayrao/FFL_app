'use client'

import { useEffect, useMemo, useState } from 'react'
import { Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getSupabase } from '@/lib/supabase'

type TeamRow = { team_id: string; team_name: string; points: number; avg_rr: number | null; rest_days?: number | null }
type IndividualRow = { user_id: string; first_name?: string; last_name?: string; username?: string | null; team_id?: string | null; team_name?: string | null; points: number; avg_rr: number | null; rest_days?: number | null; missed_days?: number | null }
type Team = { id: string; name: string }
type Account = { id: string; first_name: string | null; last_name: string | null; username: string | null; team_id: string | null }
type LeagueAccount = { id: string; role?: string | null; team_id?: string | null; age?: number | null; gender?: string | null }

// Display-only proportional adjustment for 13-player teams
const THIRTEEN_PLAYER_TEAMS = new Set<string>([
  'dbecc2c2-6184-4692-a0f7-693adeae0b81', // Frolic Fetizens
  '7059747a-d1b8-479c-aff2-6a6a79c88998', // Interstellar
]);
const THIRTEEN_TEAM_FACTOR = 12 / 13;

// Local-date helpers (device-local semantics)
function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDaysLocal(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function parseYmdLocal(s: string): Date {
  const [y,m,d] = s.split('-').map(v=>parseInt(v,10));
  return new Date(y, (m||1)-1, d||1);
}

const SEASON_START = '2025-10-25';

export default function GovernorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [asOf, setAsOf] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);

  const [teamLeaderboard, setTeamLeaderboard] = useState<TeamRow[]>([]);
  const [individualLeaderboard, setIndividualLeaderboard] = useState<IndividualRow[]>([]);
  const [entriesForAggregates, setEntriesForAggregates] = useState<any[]>([]);
  const [leagueAccounts, setLeagueAccounts] = useState<LeagueAccount[]>([]);
  const [restDaysByUser, setRestDaysByUser] = useState<Record<string, number>>({});
  const [missedDaysByUser, setMissedDaysByUser] = useState<Record<string, number>>({});
  const [teamMembers, setTeamMembers] = useState<Account[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<Array<{ received_at: string } & Record<string, any>>>([]);
  // Tab state for section navigation
  type GovTab = 'teamLeaderboard' | 'activitySnapshot' | 'leagueSummary' | 'teamSummary' | 'individualLeaderboard';
  const [tab, setTab] = useState<GovTab>('teamLeaderboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  // Sync tab from hash so Navbar mobile links can target sections
  useEffect(() => {
    const applyFromHash = () => {
      if (typeof window === 'undefined') return;
      const h = window.location.hash.replace('#','');
      const allowed = new Set(['teamLeaderboard','activitySnapshot','leagueSummary','teamSummary','individualLeaderboard']);
      if (allowed.has(h)) setTab(h as GovTab);
    };
    applyFromHash();
    window.addEventListener('hashchange', applyFromHash);
    return () => window.removeEventListener('hashchange', applyFromHash);
  }, []);
  const [ilbPage, setIlbPage] = useState<number>(1);
  const ilbPageSize = 10;

  // Gate by role and compute as-of (yesterday local)
  useEffect(() => {
    if (status === 'loading') return;
    const role = (session?.user as any)?.role;
    if (role !== 'governor') {
      router.replace('/dashboard');
      return;
    }
    const yesterday = addDaysLocal(new Date(), -1);
    setAsOf(ymdLocal(yesterday));
  }, [session, status, router]);

  // Load data when asOf set
  useEffect(() => {
    const load = async () => {
      if (!asOf) return;
      setLoading(true);
      try {
        // Teams list (for naming and ordering)
        const { data: tms } = await getSupabase().from('teams').select('id,name').order('name', { ascending: true });
        const teamList = (tms || []) as Team[];
        setTeams(teamList);
        if (!selectedTeamId && teamList.length) setSelectedTeamId(String(teamList[0].id));

        // Accounts (players + leaders) to ensure zero-entry users are included
        const { data: allAccounts } = await getSupabase().from('accounts').select('id, first_name, last_name, username, team_id, role, age, gender');
        const filteredAccounts = ((allAccounts||[]) as Array<{ id: string; first_name: string|null; last_name: string|null; username: string|null; team_id: string|null; role: string; age?: number|null; gender?: string|null }>)
          .filter(a => (a.role === 'player' || a.role === 'leader'));
        setLeagueAccounts(filteredAccounts.map(a=>({ id: String(a.id), role: a.role, team_id: a.team_id ? String(a.team_id) : null, age: (typeof a.age === 'number' ? a.age : null), gender: (a as any).gender ?? null })));

        // Entries for season-to-date up to asOf (yesterday local)
        const { data: ents } = await getSupabase()
          .from('entries')
          .select('user_id,team_id,workout_type,duration,distance,steps,type,status,date,rr_value')
          .gte('date', SEASON_START)
          .lte('date', asOf)
          .eq('status', 'approved');
        const all = (ents || []) as Array<{ user_id: string; team_id: string | null; type: string; rr_value: number | null; workout_type: string | null; duration: number | null; distance: number | null; steps: number | null; date: string }>;        
        setEntriesForAggregates(all);
        // Build rest-day counts per user for season to date through asOf
        const restMap: Record<string, number> = {};
        const datesByUser: Record<string, Set<string>> = {};
        for (const e of all) {
          if (String(e.type) === 'rest') {
            const uid = String(e.user_id);
            restMap[uid] = (restMap[uid] || 0) + 1;
          }
          const uid2 = String(e.user_id);
          const ds = String(e.date);
          if (!datesByUser[uid2]) datesByUser[uid2] = new Set<string>();
          datesByUser[uid2].add(ds);
        }
        setRestDaysByUser(restMap);
        // Compute missed days per user = total days since season start through asOf minus unique entry days
        const start = parseYmdLocal(SEASON_START);
        const end = parseYmdLocal(asOf);
        const totalDays = Math.floor((end.getTime() - start.getTime()) / (24*3600*1000)) + 1;
        const missedMap: Record<string, number> = {};
        Object.entries(datesByUser).forEach(([uid, set]) => {
          const done = (set as Set<string>).size;
          missedMap[uid] = Math.max(totalDays - done, 0);
        });
        setMissedDaysByUser(missedMap);

        // Team aggregates from entries (points = count of approved entries; RR avg excluding zero values)
        const teamAgg = new Map<string, { points: number; rrSum: number; rrCnt: number }>();
        for (const e of all) {
          const tid = String(e.team_id || '');
          if (!tid) continue;
          const rec = teamAgg.get(tid) || { points: 0, rrSum: 0, rrCnt: 0 };
          rec.points += 1;
          const rr = typeof e.rr_value === 'number' ? e.rr_value : Number(e.rr_value || 0);
          if (rr > 0) { rec.rrSum += rr; rec.rrCnt += 1; }
          teamAgg.set(tid, rec);
        }
        const teamRows: TeamRow[] = teamList.map(t => {
          const agg = teamAgg.get(String(t.id)) || { points: 0, rrSum: 0, rrCnt: 0 };
          const avg = agg.rrCnt > 0 ? Math.round((agg.rrSum / agg.rrCnt) * 100) / 100 : 0;
          let pts = agg.points;
          if (THIRTEEN_PLAYER_TEAMS.has(String(t.id))) {
            pts = Math.round(pts * THIRTEEN_TEAM_FACTOR * 100) / 100;
          }
          return { team_id: String(t.id), team_name: String(t.name), points: pts, avg_rr: avg } as TeamRow;
        });
        setTeamLeaderboard(teamRows);

        // Individual leaderboard from entries
        const userAgg = new Map<string, { points: number; rrSum: number; rrCnt: number }>();
        for (const e of all) {
          const uid = String(e.user_id);
          const rec = userAgg.get(uid) || { points: 0, rrSum: 0, rrCnt: 0 };
          rec.points += 1;
          const rr = typeof e.rr_value === 'number' ? e.rr_value : Number(e.rr_value || 0);
          if (rr > 0) { rec.rrSum += rr; rec.rrCnt += 1; }
          userAgg.set(uid, rec);
        }
        const teamNameById = new Map<string,string>();
        teamList.forEach(t => teamNameById.set(String(t.id), String(t.name)));
        const indiv: IndividualRow[] = filteredAccounts.map(a => {
          const agg = userAgg.get(String(a.id)) || { points: 0, rrSum: 0, rrCnt: 0 };
          const avg = agg.rrCnt > 0 ? Math.round((agg.rrSum / agg.rrCnt) * 100) / 100 : 0;
          const tName = a.team_id ? (teamNameById.get(String(a.team_id)) || null) : null;
          return {
            user_id: String(a.id),
            first_name: a.first_name || undefined,
            last_name: a.last_name || undefined,
            username: a.username || null,
            team_id: a.team_id ? String(a.team_id) : undefined,
            team_name: tName || undefined,
            points: agg.points,
            avg_rr: avg,
            rest_days: restMap[String(a.id)] || 0,
            missed_days: missedMap[String(a.id)] || 0,
          } as IndividualRow;
        });
        setIndividualLeaderboard(indiv);

        // ---- Web Analytics drain events (latest moment; fetch last 30 days window) ----
        {
          const now = new Date();
          const startWindow = addDaysLocal(now, -7); // align with typical dashboard default (last 7 days)
          const { data: wa } = await getSupabase()
            .from('web_analytics_events')
            .select('event, received_at')
            .gte('received_at', startWindow.toISOString())
            .lte('received_at', now.toISOString());

          const events = ((wa || []) as Array<{ event: any; received_at: string }>).map((row) => {
            const ev = typeof row.event === 'string' ? (() => { try { return JSON.parse(row.event); } catch { return {}; } })() : row.event;
            return { received_at: row.received_at, ...ev } as { received_at: string } & Record<string, any>;
          });
          setAnalyticsEvents(events);
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [asOf, selectedTeamId]);

  // Load accounts for selected team to include players and leaders even if they have 0 entries
  useEffect(() => {
    const loadMembers = async () => {
      if (!selectedTeamId) { setTeamMembers([]); return; }
      const { data } = await getSupabase().from('accounts').select('id, first_name, last_name, username, team_id').eq('team_id', selectedTeamId);
      setTeamMembers(((data||[]) as Account[]).sort((a,b)=>{
        const an = (a.first_name||'').toLowerCase();
        const bn = (b.first_name||'').toLowerCase();
        return an.localeCompare(bn);
      }));
    };
    loadMembers();
  }, [selectedTeamId]);

  // Team drilldown list: filter individual leaderboard by team
  const teamPlayers = useMemo(() => {
    if (!selectedTeamId) return [] as IndividualRow[];
    // Map leaderboard by user for quick lookup
    const lbByUser = new Map<string, { points: number; avg_rr: number | null }>();
    (individualLeaderboard || []).forEach(r => lbByUser.set(String(r.user_id), { points: Number(r.points), avg_rr: r.avg_rr }));
    // Build rows for every member of the team
    const rows: IndividualRow[] = (teamMembers || []).map(m => {
      const lb = lbByUser.get(String(m.id));
      return {
        user_id: String(m.id),
        first_name: m.first_name || '',
        last_name: m.last_name || '',
        username: m.username,
        team_id: m.team_id ? String(m.team_id) : undefined,
        points: lb ? lb.points : 0,
        avg_rr: lb ? lb.avg_rr : null,
        rest_days: restDaysByUser[String(m.id)] || 0,
        missed_days: missedDaysByUser[String(m.id)] || 0,
      } as IndividualRow;
    });
    return rows.sort((a,b)=> (Number(b.points)-Number(a.points)) || (Number(b.avg_rr||0)-Number(a.avg_rr||0)));
  }, [individualLeaderboard, selectedTeamId, teamMembers, restDaysByUser, missedDaysByUser]);

  // Aggregate by activity
  const aggregates = useMemo(() => {
    const by: Record<string, { entries: number; duration: number; distance: number; steps: number }> = {};
    for (const e of entriesForAggregates) {
      const key = e.workout_type ?? 'unknown';
      if (!by[key]) by[key] = { entries: 0, duration: 0, distance: 0, steps: 0 };
      by[key].entries += 1;
      by[key].duration += Number(e.duration ?? 0);
      by[key].distance += Number(e.distance ?? 0);
      by[key].steps += Number(e.steps ?? 0);
    }
    return Object.entries(by).map(([workout_type, v]) => ({ 
      workout_type, 
      entries: v.entries, 
      duration: Math.round(v.duration * 100) / 100, 
      distance: Math.round(v.distance * 100) / 100, 
      steps: Math.round(v.steps * 100) / 100 
    })).sort((a,b)=> b.entries - a.entries);
  }, [entriesForAggregates]);

  // Totals for aggregates row
  const aggregatesTotal = useMemo(() => {
    const t = { entries: 0, duration: 0, distance: 0, steps: 0 };
    for (const r of aggregates) {
      t.entries += Number(r.entries || 0);
      t.duration += Number(r.duration || 0);
      t.distance += Number(r.distance || 0);
      t.steps += Number(r.steps || 0);
    }
    return {
      entries: t.entries,
      duration: Math.round(t.duration * 100) / 100,
      distance: Math.round(t.distance * 100) / 100,
      steps: Math.round(t.steps * 100) / 100,
    };
  }, [aggregates]);

  // League-wide avg RR (as of yesterday)
  const leagueAvgRR = useMemo(() => {
    // Average of team average RRs (as-of yesterday), unweighted across teams
    const vals = (teamLeaderboard || [])
      .map(t => (typeof t.avg_rr === 'number' ? t.avg_rr : Number(t.avg_rr || 0)))
      .filter(v => v > 0);
    if (!vals.length) return 0;
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.round((sum / vals.length) * 100) / 100;
  }, [teamLeaderboard]);

  const restDaysTotal = useMemo(() => entriesForAggregates.filter((e:any) => String(e.type) === 'rest').length, [entriesForAggregates]);

  // League composition
  const playersCount = useMemo(() => leagueAccounts.length, [leagueAccounts]);
  const teamsCount = useMemo(() => (teams || []).length, [teams]);
  const genderCounts = useMemo(() => {
    let male=0, female=0, other=0, unknown=0;
    for (const a of leagueAccounts) {
      const g = (a.gender || '').toString().toLowerCase();
      if (g === 'male' || g === 'm') male++;
      else if (g === 'female' || g === 'f') female++;
      else if (g) other++;
      else unknown++;
    }
    return { male, female, other, unknown };
  }, [leagueAccounts]);
  const roleCounts = useMemo(() => {
    let players = 0, leaders = 0;
    for (const a of leagueAccounts) {
      if ((a.role || '').toString() === 'player') players++;
      else if ((a.role || '').toString() === 'leader') leaders++;
    }
    return { players, leaders };
  }, [leagueAccounts]);
  const ageBrackets = useMemo(() => {
    const b = {
      juniors: 0,         // ≤18
      youngAdults: 0,     // 19–35
      adults: 0,          // 36–49
      superAdults: 0,     // 50–64
      seniors: 0,         // 65–79
      superSeniors: 0,    // >80
    };
    for (const a of leagueAccounts) {
      const age = typeof a.age === 'number' ? a.age : null;
      if (age === null) continue;
      if (age <= 18) b.juniors++;
      else if (age <= 35) b.youngAdults++;
      else if (age <= 49) b.adults++;
      else if (age <= 64) b.superAdults++;
      else if (age <= 79) b.seniors++;
      else b.superSeniors++;
    }
    return b;
  }, [leagueAccounts]);

  // Analytics aggregations (latest moment)
  const analyticsAgg = useMemo(() => {
    const pageviews = analyticsEvents.filter(e => String(e.eventType || e.type || '') === 'pageview').length || analyticsEvents.length;
    // Use sessionId if present, else fall back to deviceId-origin combination to approximate
    const sessionKey = (e: any) => (e.sessionId != null ? `s:${e.sessionId}` : (e.deviceId != null ? `d:${e.deviceId}` : `o:${e.origin || ''}`));

    const perSession = new Map<string, { pv: number }>();
    for (const ev of analyticsEvents) {
      const key = sessionKey(ev);
      const rec = perSession.get(key) || { pv: 0 };
      rec.pv += 1;
      perSession.set(key, rec);
    }
    const visitors = perSession.size;
    let singlePageSessions = 0;
    perSession.forEach(v => { if (v.pv === 1) singlePageSessions++; });
    const bounceRate = visitors > 0 ? Math.round((singlePageSessions / visitors) * 100) : 0;

    // Pages (by unique sessions)
    type Row = { path: string; sessions: Set<string>; };
    const byPath = new Map<string, Row>();
    for (const ev of analyticsEvents) {
      const path = (ev.path || '/').toString();
      const key = sessionKey(ev);
      const r = byPath.get(path) || { path, sessions: new Set<string>() };
      r.sessions.add(key);
      byPath.set(path, r);
    }
    const pages = Array.from(byPath.values())
      .map(r => ({ path: r.path, visitors: r.sessions.size }))
      .sort((a,b)=> b.visitors - a.visitors)
      .slice(0, 10);

    // Countries (by unique sessions)
    const byCountry = new Map<string, Set<string>>();
    for (const ev of analyticsEvents) {
      const ctry = (ev.country || '').toString() || 'Unknown';
      const key = sessionKey(ev);
      const s = byCountry.get(ctry) || new Set<string>();
      s.add(key);
      byCountry.set(ctry, s);
    }
    const countries = Array.from(byCountry.entries())
      .map(([ctry, set]) => ({ country: ctry, visitors: set.size }))
      .sort((a,b)=> b.visitors - a.visitors)
      .slice(0, 6);

    // Devices (by unique sessions)
    const byDevice = new Map<string, Set<string>>();
    for (const ev of analyticsEvents) {
      const dev = (ev.deviceType || '').toString() || 'Unknown';
      const key = sessionKey(ev);
      const s = byDevice.get(dev) || new Set<string>();
      s.add(key);
      byDevice.set(dev, s);
    }
    const devices = Array.from(byDevice.entries())
      .map(([name, set]) => ({ name, visitors: set.size }))
      .sort((a,b)=> b.visitors - a.visitors)
      .slice(0, 4);

    // Operating Systems (by unique sessions)
    const byOS = new Map<string, Set<string>>();
    for (const ev of analyticsEvents) {
      const os = (ev.osName || '').toString() || 'Unknown';
      const key = sessionKey(ev);
      const s = byOS.get(os) || new Set<string>();
      s.add(key);
      byOS.set(os, s);
    }
    const osList = Array.from(byOS.entries())
      .map(([name, set]) => ({ name, visitors: set.size }))
      .sort((a,b)=> b.visitors - a.visitors)
      .slice(0, 6);

    return { visitors, pageviews, bounceRate, pages, countries, devices, osList };
  }, [analyticsEvents]);

  // Sorted individual leaderboard and pagination (as of yesterday)
  const sortedIndividuals = useMemo(() => {
    return (individualLeaderboard || [])
      .slice()
      .sort((a,b)=> (Number(b.points)-Number(a.points)) || (Number(b.avg_rr||0)-Number(a.avg_rr||0)));
  }, [individualLeaderboard]);
  const ilbTotalPages = Math.max(1, Math.ceil(sortedIndividuals.length / ilbPageSize));
  const ilbPageSafe = Math.min(Math.max(ilbPage, 1), ilbTotalPages);
  const ilbSlice = useMemo(() => {
    const from = (ilbPageSafe - 1) * ilbPageSize; const to = from + ilbPageSize;
    return sortedIndividuals.slice(from, to);
  }, [sortedIndividuals, ilbPageSafe]);

  if (status === 'loading' || loading || !asOf) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <p className="text-sm text-gray-600">Loading governor dashboard…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header with tab navigation */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">As of {asOf}</div>
        {/* Desktop tabs */}
        <div className="hidden md:flex items-center gap-2">
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='teamLeaderboard'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('teamLeaderboard'); if (typeof window!=='undefined') window.location.hash='teamLeaderboard'; }}>Team Leaderboard</button>
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='activitySnapshot'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('activitySnapshot'); if (typeof window!=='undefined') window.location.hash='activitySnapshot'; }}>League Activity Snapshot</button>
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='leagueSummary'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('leagueSummary'); if (typeof window!=='undefined') window.location.hash='leagueSummary'; }}>League Summary</button>
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='teamSummary'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('teamSummary'); if (typeof window!=='undefined') window.location.hash='teamSummary'; }}>Team Summary</button>
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='individualLeaderboard'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('individualLeaderboard'); if (typeof window!=='undefined') window.location.hash='individualLeaderboard'; }}>Individual Leaderboard</button>
        </div>
        {/* Mobile hamburger for tab navigation */}
        <div className="md:hidden relative">
          <button aria-label="Open menu" className="p-2 rounded border" onClick={()=>setMobileMenuOpen(v=>!v)}>
            <Menu className="w-5 h-5" />
          </button>
          {mobileMenuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow z-10">
              {[
                {k:'teamLeaderboard', label:'Team Leaderboard'},
                {k:'activitySnapshot', label:'League Activity Snapshot'},
                {k:'leagueSummary', label:'League Summary'},
                {k:'teamSummary', label:'Team Summary'},
                {k:'individualLeaderboard', label:'Individual Leaderboard'},
              ].map((it)=> (
                <button key={String(it.k)} className={`block w-full text-left px-3 py-2 text-sm ${tab===it.k as GovTab ? 'bg-gray-100 text-rfl-navy':'text-gray-800'}`} onClick={()=>{ setTab(it.k as GovTab); setMobileMenuOpen(false); }}>
                  {it.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Card 1: Team leaderboard */}
      {tab === 'teamLeaderboard' && (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3">Team Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 pr-2 w-12">Rank</th>
                <th className="py-2 pr-2">Team Name</th>
                <th className="py-2 pr-2 text-right w-20">Points</th>
                <th className="py-2 pr-2 text-right w-24">Avg RR</th>
              </tr>
            </thead>
            <tbody>
              {teamLeaderboard
                .slice()
                .sort((a,b)=> (Number(b.points)-Number(a.points)) || (Number(b.avg_rr||0)-Number(a.avg_rr||0)))
                .map((t, idx) => (
                  <tr key={t.team_id} className="border-t hover:bg-gray-50">
                    <td className="py-2 pr-2 [font-variant-numeric:tabular-nums] font-bold text-rfl-navy">{idx+1}</td>
                    <td className="py-2 pr-2 font-medium text-rfl-navy">{t.team_name}</td>
                    <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-bold text-rfl-coral">{Math.round(t.points)}</td>
                    <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold text-rfl-navy">{typeof t.avg_rr === 'number' ? t.avg_rr.toFixed(2) : '0.00'}</td>
                  </tr>
                ))}
              {!teamLeaderboard.length && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-500">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Card 2: Aggregate activity snapshot (moved up under leaderboard) */}
      {tab === 'activitySnapshot' && (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3">League Activity Snapshot (Aggregate)</h2>
        <div className="overflow-x-auto pb-2">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 px-2">Activity</th>
                <th className="py-2 px-2 text-right">Entries</th>
                <th className="py-2 px-2 text-right">Total Duration</th>
                <th className="py-2 px-2 text-right">Total Distance</th>
                <th className="py-2 px-2 text-right">Total Steps</th>
              </tr>
            </thead>
            <tbody>
              {aggregates.map((r) => (
                <tr key={r.workout_type} className="border-t">
                  <td className="py-2 px-2 whitespace-nowrap">{r.workout_type}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap [font-variant-numeric:tabular-nums]">{r.entries}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap [font-variant-numeric:tabular-nums]">{r.duration}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap [font-variant-numeric:tabular-nums]">{r.distance}</td>
                  <td className="py-2 px-2 text-right whitespace-nowrap [font-variant-numeric:tabular-nums]">{r.steps}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold">
                <td className="py-2 px-2 text-right">Totals</td>
                <td className="py-2 px-2 text-right [font-variant-numeric:tabular-nums]">{aggregatesTotal.entries}</td>
                <td className="py-2 px-2 text-right [font-variant-numeric:tabular-nums]">{aggregatesTotal.duration}</td>
                <td className="py-2 px-2 text-right [font-variant-numeric:tabular-nums]">{aggregatesTotal.distance}</td>
                <td className="py-2 px-2 text-right [font-variant-numeric:tabular-nums]">{aggregatesTotal.steps}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="mt-2 text-xs text-gray-500">Season-to-date through {asOf}</div>
      </div>
      )}

      {/* League summary block: avg RR, total rests, composition */}
      {tab === 'leagueSummary' && (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3">League Summary</h2>
        {/* Avg RR — League */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold text-rfl-navy">Avg RR — League</div>
            <div className="text-xs text-gray-600">Scale: 1.00 → 2.00</div>
          </div>
          {(() => {
            const min = 1.0, max = 2.0, span = max - min;
            const pct = Math.max(0, Math.min(100, ((leagueAvgRR - min) / span) * 100));
            return (
              <div>
                <div className="relative h-2 rounded-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400">
                  <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${pct}% - 4px)` }}>
                    <span className="block w-2 h-2 rounded-full bg-rfl-coral border border-white"></span>
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-700">League Avg RR: {leagueAvgRR.toFixed(2)}</div>
              </div>
            );
          })()}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-rfl-peach/50 rounded">
            <div className="text-xs text-gray-600">Players</div>
            <div className="text-lg font-bold text-rfl-navy">{playersCount}</div>
          </div>
          <div className="p-3 bg-rfl-peach/50 rounded">
            <div className="text-xs text-gray-600">Teams</div>
            <div className="text-lg font-bold text-rfl-navy">{teamsCount}</div>
          </div>
          <div className="p-3 bg-rfl-peach/50 rounded">
            <div className="text-xs text-gray-600">Total Rest Days</div>
            <div className="text-lg font-bold text-rfl-navy">{restDaysTotal}</div>
          </div>
          <div className="p-3 bg-rfl-peach/50 rounded">
            <div className="text-xs text-gray-600">Avg RR</div>
            <div className="text-lg font-bold text-rfl-navy">{leagueAvgRR.toFixed(2)}</div>
          </div>
        </div>

        {/* Composition */}
        <div className="mt-4">
          <div className="text-sm font-semibold text-rfl-navy mb-2">League Composition</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-center">
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-600">Men</div>
              <div className="text-base font-semibold text-rfl-navy">{genderCounts.male}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-600">Women</div>
              <div className="text-base font-semibold text-rfl-navy">{genderCounts.female}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-600">Players</div>
              <div className="text-base font-semibold text-rfl-navy">{roleCounts.players}</div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-600">Leaders</div>
              <div className="text-base font-semibold text-rfl-navy">{roleCounts.leaders}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Juniors ≤18</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.juniors}</div>
            </div>
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Young Adults 19–35</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.youngAdults}</div>
            </div>
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Adults 36–49</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.adults}</div>
            </div>
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Super Adults 50–64</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.superAdults}</div>
            </div>
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Seniors 65–79</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.seniors}</div>
            </div>
            <div className="p-3 bg-white border rounded">
              <div className="text-[11px] text-gray-600">Super Seniors &gt;80</div>
              <div className="text-base font-semibold text-rfl-navy">{ageBrackets.superSeniors}</div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Web Analytics section intentionally not rendered */}

      {/* Card 3: Team drilldown */}
      {tab === 'teamSummary' && (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Team Summary (Players)</h2>
          <select className="border rounded px-2 py-1 text-sm" value={selectedTeamId ?? ''} onChange={(e)=> setSelectedTeamId(e.target.value)}>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 pr-2 w-12">Rank</th>
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 pr-2 text-right w-20">Points</th>
                <th className="py-2 pr-2 text-right w-24">Avg RR</th>
                <th className="py-2 pr-2 text-right w-24">Rest Days</th>
                <th className="py-2 pr-2 text-right w-24">Missed Days</th>
              </tr>
            </thead>
            <tbody>
              {teamPlayers.map((p, idx) => (
                <tr key={String(p.user_id)} className="border-t hover:bg-gray-50">
                  <td className="py-2 pr-2 [font-variant-numeric:tabular-nums] font-bold text-rfl-navy">{idx+1}</td>
                  <td className="py-2 pr-2">
                    <div className="font-medium">{(p as any).first_name ?? ''} {(p as any).last_name ?? ''}</div>
                    {p.username && <div className="text-xs text-gray-500">@{p.username}</div>}
                  </td>
                  <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-bold text-rfl-coral">{p.points}</td>
                  <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold text-rfl-navy">{typeof p.avg_rr === 'number' ? p.avg_rr.toFixed(2) : '0.00'}</td>
                  <td className="py-2 pr-2 text-right">{p.rest_days ?? restDaysByUser[String(p.user_id)] ?? 0}</td>
                  <td className="py-2 pr-2 text-right">{p.missed_days ?? 0}</td>
                </tr>
              ))}
              {!teamPlayers.length && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No players yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Card 4: Individual leaderboard (league-wide) with pagination */}
      {tab === 'individualLeaderboard' && (
      <div className="bg-white rounded-lg shadow p-4">
        <h2 className="text-base font-semibold mb-3">Individual Leaderboard</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 pr-2 w-12">Rank</th>
                <th className="py-2 pr-2">Player</th>
                <th className="py-2 pr-2 text-right w-20">Points</th>
                <th className="py-2 pr-2 text-right w-24">RR</th>
                <th className="py-2 pr-2 text-right w-24">Rest Days</th>
                <th className="py-2 pr-2 text-right w-24">Missed Days</th>
              </tr>
            </thead>
            <tbody>
              {ilbSlice
                .map((u, idx) => (
                  <tr key={String(u.user_id)} className="border-t hover:bg-gray-50">
                    <td className="py-2 pr-2 [font-variant-numeric:tabular-nums] font-bold text-rfl-navy">{(ilbPageSafe - 1) * ilbPageSize + idx + 1}</td>
                    <td className="py-2 pr-2">
                      <div className="font-medium">{(u as any).first_name ?? 'Player'} {(u as any).last_name ?? ''}</div>
                      {u.team_name && <div className="text-xs text-gray-500">{u.team_name}</div>}
                    </td>
                    <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-bold text-rfl-coral">{u.points}</td>
                    <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold text-rfl-navy">{typeof u.avg_rr === 'number' ? u.avg_rr.toFixed(2) : '0.00'}</td>
                    <td className="py-2 pr-2 text-right">{u.rest_days ?? restDaysByUser[String(u.user_id)] ?? 0}</td>
                    <td className="py-2 pr-2 text-right">{missedDaysByUser[String(u.user_id)] ?? 0}</td>
                  </tr>
                ))}
              {!sortedIndividuals.length && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500">No data yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-600">Page {ilbPageSafe} of {ilbTotalPages}</div>
          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 rounded border text-sm ${ilbPageSafe<=1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
              onClick={() => setIlbPage(p => Math.max(1, p-1))}
              disabled={ilbPageSafe<=1}
            >
              Prev
            </button>
            <button
              className={`px-3 py-1 rounded border text-sm ${ilbPageSafe>=ilbTotalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}`}
              onClick={() => setIlbPage(p => Math.min(ilbTotalPages, p+1))}
              disabled={ilbPageSafe>=ilbTotalPages}
            >
              Next
            </button>
          </div>
        </div>
      </div>
      )}
    </div>
  )
}


