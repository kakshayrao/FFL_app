'use client'

import { useEffect, useMemo, useState } from 'react'
import { Menu, Info, Plus, Pencil, Trash2, Save, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { getSupabase } from '@/lib/supabase'

type TeamRow = { team_id: string; team_name: string; points: number; avg_rr: number | null; rest_days?: number | null }
type IndividualRow = { user_id: string; first_name?: string; last_name?: string; username?: string | null; team_id?: string | null; team_name?: string | null; points: number; avg_rr: number | null; rest_days?: number | null; missed_days?: number | null }
type Team = { id: string; name: string }
type Account = { id: string; first_name: string | null; last_name: string | null; username: string | null; team_id: string | null }
type LeagueAccount = { id: string; role?: string | null; team_id?: string | null; age?: number | null; gender?: string | null }

// Local-only data model (will be wired to DB later)
type Challenge = {
  id: string;
  name: string;
  description: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  rules_pdf_url?: string | null;
  scores: Record<string, number | null>; // key: team_id
};

// Display-only proportional adjustment for 11-player teams
// Normalize 11-player team totals to a 10-player baseline by multiplying by 10/11.
const ELEVEN_PLAYER_TEAMS = new Set<string>([
  '76514ecd-e8c9-4868-892f-30fb2d1c42d6', // Crusaders (11 players)
  '7a9419d7-0c0d-4c2d-b962-24af3448d0b6', // Deccan Warriors (11 players)
]);
const ELEVEN_TEAM_FACTOR = 10 / 11;

const CHALLENGE_RULES_BUCKET = 'challenge-rules';

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
function formatRangeNoYear(start: string, end: string): string {
  if (!start && !end) return '—';
  if (!start) return `— → ${end}`;
  if (!end) return `${start} → —`;
  // Extract month-day from YYYY-MM-DD
  const formatMD = (s: string) => {
    const parts = s.split('-');
    if (parts.length < 3) return s;
    return `${parts[1]}/${parts[2]}`;
  };
  return `${formatMD(start)} → ${formatMD(end)}`;
}

const SEASON_START = '2025-10-15';

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
  type GovTab = 'teamLeaderboard' | 'challenges' | 'activitySnapshot' | 'leagueSummary' | 'teamSummary' | 'individualLeaderboard';
  const [tab, setTab] = useState<GovTab>('teamLeaderboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  
  useEffect(() => {
    const applyFromHash = () => {
      if (typeof window === 'undefined') return;
      const h = window.location.hash.replace('#','');
      const allowed = new Set(['teamLeaderboard','challenges','activitySnapshot','leagueSummary','teamSummary','individualLeaderboard']);
      if (allowed.has(h)) setTab(h as GovTab);
    };
    applyFromHash();
    window.addEventListener('hashchange', applyFromHash);
    return () => window.removeEventListener('hashchange', applyFromHash);
  }, []);
  const [ilbPage, setIlbPage] = useState<number>(1);
  const ilbPageSize = 10;

  // Special Challenges (local state; to be wired later)
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [descOpenId, setDescOpenId] = useState<string | null>(null);
  // Governor Challenges tab: selected challenge for leaderboard view
  const [selectedChallengeIdGov, setSelectedChallengeIdGov] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; start_date: string; end_date: string }>({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [draftPdf, setDraftPdf] = useState<File | null>(null);
  const [pendingPdf, setPendingPdf] = useState<Record<string, File | null>>({});
  const [removePdfFlags, setRemovePdfFlags] = useState<Record<string, boolean>>({});

  function generateUuid() {
    try { return crypto.randomUUID(); } catch { return `ch_${Date.now()}`; }
  }
  function handleDraftPdf(file: File | null) {
    setDraftPdf(file);
  }
  function handlePendingPdf(challengeId: string, file: File | null) {
    setPendingPdf(prev => ({ ...prev, [challengeId]: file }));
    if (file) {
      setRemovePdfFlags(prev => {
        const next = { ...prev };
        delete next[challengeId];
        return next;
      });
    }
  }
  function markRemovePdf(challengeId: string) {
    setRemovePdfFlags(prev => ({ ...prev, [challengeId]: true }));
    setPendingPdf(prev => ({ ...prev, [challengeId]: null }));
  }
  function clearRemovePdf(challengeId: string) {
    setRemovePdfFlags(prev => {
      const next = { ...prev };
      delete next[challengeId];
      return next;
    });
  }
  function emptyScores(teamList: Team[]) {
    const s: Record<string, number | null> = {};
    for (const t of teamList) s[String(t.id)] = null;
    return s;
  }
  function sanitizeFileName(name: string) {
    return name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }
  function isPdfFile(file: File) {
    const mime = (file.type || '').toLowerCase();
    if (mime) return mime === 'application/pdf';
    return file.name.toLowerCase().endsWith('.pdf');
  }
  async function uploadChallengeRulesPdf(challengeId: string, file: File) {
    if (!isPdfFile(file)) {
      throw new Error('Only PDF files are supported for challenge rules.');
    }
    const supabase = getSupabase();
    const safeName = sanitizeFileName(file.name || `challenge-rules.pdf`);
    const path = `rules/${challengeId}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from(CHALLENGE_RULES_BUCKET)
      .upload(path, file, {
        cacheControl: '3600',
        upsert: true,
        contentType: file.type || 'application/pdf',
      });
    if (uploadError) {
      throw uploadError;
    }
    const { data } = supabase.storage.from(CHALLENGE_RULES_BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      throw new Error('Failed to retrieve public URL for uploaded PDF.');
    }
    return data.publicUrl;
  }
  function openCreate() {
    setDraft({ name: '', description: '', start_date: '', end_date: '' });
    setCreateOpen(true);
    setDraftPdf(null);
  }
  async function addChallenge() {
    if (!draft.name.trim()) return;
    const payload = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
    } as any;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('special_challenges')
      .insert(payload)
      .select('id,name,description,start_date,end_date,rules_pdf_url')
      .single();
    if (error) {
      alert(`Create failed: ${error.message}`);
      return;
    }
    let rulesPdfUrl = data.rules_pdf_url || null;
    if (draftPdf) {
      try {
        const uploadedUrl = await uploadChallengeRulesPdf(String(data.id), draftPdf);
        const { error: updErr } = await supabase
          .from('special_challenges')
          .update({ rules_pdf_url: uploadedUrl })
          .eq('id', data.id);
        if (updErr) {
          throw updErr;
        }
        rulesPdfUrl = uploadedUrl;
      } catch (err: any) {
        alert(`PDF upload failed: ${err?.message || err}`);
      }
    }
    const row: Challenge = {
      id: String(data.id),
      name: String(data.name),
      description: data.description || '',
      start_date: data.start_date || '',
      end_date: data.end_date || '',
      rules_pdf_url: rulesPdfUrl,
      scores: emptyScores(teams),
    };
    setChallenges(prev => [row, ...prev]);
    setCreateOpen(false);
    setDraftPdf(null);
  }
  function startEdit(id: string) {
    setEditingId(id);
  }
  function cancelEdit() {
    setEditingId(null);
  }
  async function saveEdit(id: string, payload: Partial<Challenge>) {
    // Find the row from state
    const current = challenges.find(c => c.id === id);
    if (!current) { setEditingId(null); return; }

    // Update core fields
    const upd = {
      name: current.name,
      description: current.description,
      start_date: current.start_date || null,
      end_date: current.end_date || null,
    } as any;
    const supabase = getSupabase();
    const { error: updErr } = await supabase
      .from('special_challenges')
      .update(upd)
      .eq('id', id);
    if (updErr) {
      alert(`Save failed (challenge): ${updErr.message}`);
      return;
    }

    // Upsert non-null scores
    const upsertRows: Array<{ challenge_id: string; team_id: string; score: number | null }> = [];
    const deleteTeamIds: string[] = [];
    for (const t of teams) {
      const tid = String(t.id);
      const val = current.scores[tid];
      if (val === null || val === undefined || val === '' as any) {
        deleteTeamIds.push(tid);
      } else {
        upsertRows.push({ challenge_id: id, team_id: tid, score: Number(val) });
      }
    }
    if (upsertRows.length) {
      const { error: upErr } = await getSupabase()
        .from('special_challenge_team_scores')
        .upsert(upsertRows, { onConflict: 'challenge_id,team_id' });
      if (upErr) {
        alert(`Save failed (scores): ${upErr.message}`);
        return;
      }
    }
    if (deleteTeamIds.length) {
      const { error: delErr } = await supabase
        .from('special_challenge_team_scores')
        .delete()
        .eq('challenge_id', id)
        .in('team_id', deleteTeamIds);
      if (delErr) {
        alert(`Save failed (clear scores): ${delErr.message}`);
        return;
      }
    }

    let nextRulesUrl = current.rules_pdf_url || null;
    if (removePdfFlags[id]) {
      const { error: clearErr } = await supabase
        .from('special_challenges')
        .update({ rules_pdf_url: null })
        .eq('id', id);
      if (clearErr) {
        alert(`Save failed (remove PDF): ${clearErr.message}`);
        return;
      }
      nextRulesUrl = null;
      clearRemovePdf(id);
    } else if (pendingPdf[id]) {
      try {
        const uploadedUrl = await uploadChallengeRulesPdf(id, pendingPdf[id]!);
        const { error: updPdfErr } = await supabase
          .from('special_challenges')
          .update({ rules_pdf_url: uploadedUrl })
          .eq('id', id);
        if (updPdfErr) throw updPdfErr;
        nextRulesUrl = uploadedUrl;
      } catch (err: any) {
        alert(`Save failed (upload PDF): ${err?.message || err}`);
        return;
      } finally {
        setPendingPdf(prev => ({ ...prev, [id]: null }));
      }
    }

    setPendingPdf(prev => ({ ...prev, [id]: null }));
    // Update local state last
    setChallenges(prev => prev.map(ch => ch.id === id ? { ...ch, ...payload, rules_pdf_url: nextRulesUrl } : ch));
    setEditingId(null);
  }
  async function deleteChallenge(id: string) {
    if (!confirm('Delete this challenge?')) return;
    const { error } = await getSupabase()
      .from('special_challenges')
      .delete()
      .eq('id', id);
    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }
    setChallenges(prev => prev.filter(ch => ch.id !== id));
  }
  function setScore(challengeId: string, teamId: string, value: string) {
    const parsed = value === '' ? null : Number(value);
    if (parsed !== null && Number.isNaN(parsed)) return;
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, scores: { ...ch.scores, [teamId]: parsed } };
    }));
  }

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
        // Fetch team-wise and user-wise to avoid 1000-row limit
        const all: Array<{ user_id: string; team_id: string | null; type: string; rr_value: number | null; workout_type: string | null; duration: number | null; distance: number | null; steps: number | null; date: string }> = [];
        
        // Fetch entries for each team
        for (const team of teamList) {
          const { data: teamEnts } = await getSupabase()
            .from('entries')
            .select('user_id,team_id,workout_type,duration,distance,steps,type,status,date,rr_value')
            .eq('team_id', team.id)
            .gte('date', SEASON_START)
            .lte('date', asOf)
            .eq('status', 'approved');
          if (teamEnts) all.push(...teamEnts);
        }
        
        // Also fetch entries with null team_id (if any)
        const { data: nullTeamEnts } = await getSupabase()
          .from('entries')
          .select('user_id,team_id,workout_type,duration,distance,steps,type,status,date,rr_value')
          .is('team_id', null)
          .gte('date', SEASON_START)
          .lte('date', asOf)
          .eq('status', 'approved');
        if (nullTeamEnts) all.push(...nullTeamEnts);        
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
          let adjusted = agg.points;
          if (ELEVEN_PLAYER_TEAMS.has(String(t.id))) {
            adjusted = agg.points * ELEVEN_TEAM_FACTOR;
          }
          const pointsRounded = Math.round(adjusted);
          return { team_id: String(t.id), team_name: String(t.name), points: pointsRounded, avg_rr: avg } as TeamRow;
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

        // ---- Load Special Challenges + scores ----
        {
        const { data: chRows } = await getSupabase()
          .from('special_challenges')
          .select('id,name,description,start_date,end_date,rules_pdf_url')
            .order('created_at', { ascending: false });
          const { data: scRows } = await getSupabase()
            .from('special_challenge_team_scores')
            .select('challenge_id,team_id,score');
          const byId = new Map<string, Challenge>();
          (chRows || []).forEach((r: any) => {
            byId.set(String(r.id), {
              id: String(r.id),
              name: String(r.name),
              description: r.description || '',
              start_date: r.start_date || '',
              end_date: r.end_date || '',
              rules_pdf_url: r.rules_pdf_url || null,
              scores: emptyScores(teamList),
            });
          });
          (scRows || []).forEach((r: any) => {
            const id = String(r.challenge_id);
            const tid = String(r.team_id);
            if (!byId.has(id)) return;
            const ch = byId.get(id)!;
            ch.scores[tid] = r.score === null || r.score === undefined ? null : Number(r.score);
          });
          setChallenges(Array.from(byId.values()));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [asOf, selectedTeamId]);

  // Keep governor tab's selected challenge in sync with loaded challenges (prefer active challenge)
  useEffect(() => {
    if (!challenges.length) { setSelectedChallengeIdGov(null); return; }
    const today = new Date();
    const y = today.getFullYear(), m = String(today.getMonth()+1).padStart(2,'0'), d = String(today.getDate()).padStart(2,'0');
    const t = `${y}-${m}-${d}`;
    const active = challenges.find(c => t >= String(c.start_date || '') && t <= String(c.end_date || ''));
    setSelectedChallengeIdGov(prev => {
      if (prev && challenges.some(c => c.id === prev)) return prev;
      return (active?.id) || challenges[0].id;
    });
  }, [challenges]);

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
      const key = e.workout_type ?? 'restdays';
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
          <button className={`px-3 py-1.5 rounded text-sm ${tab==='challenges'?'bg-rfl-navy text-white':'bg-gray-100 text-gray-800'}`} onClick={()=>{ setTab('challenges'); if (typeof window!=='undefined') window.location.hash='challenges'; }}>Challenges</button>
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
                {k:'challenges', label:'Challenges'},
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
      <>
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
      </>
      )}

      {/* Challenges tab: Manage and view leaderboard-style scores */}
      {tab === 'challenges' && (
        <div className="space-y-4">
          {/* Manage Challenges */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Challenges</h2>
              <button
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-rfl-navy text-white hover:opacity-90"
                onClick={openCreate}
              >
                <Plus className="w-4 h-4" /> Add Challenge
              </button>
            </div>

            {createOpen && (
              <div className="mb-3 border rounded p-3 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <input className="border rounded px-2 py-1 text-sm" placeholder="Challenge name"
                    value={draft.name} onChange={(e)=>setDraft(v=>({...v, name: e.target.value}))} />
                  <input className="border rounded px-2 py-1 text-sm" placeholder="Start date (YYYY-MM-DD)"
                    value={draft.start_date} onChange={(e)=>setDraft(v=>({...v, start_date: e.target.value}))} />
                  <input className="border rounded px-2 py-1 text-sm" placeholder="End date (YYYY-MM-DD)"
                    value={draft.end_date} onChange={(e)=>setDraft(v=>({...v, end_date: e.target.value}))} />
                  <div className="flex items-center gap-2">
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-rfl-navy text-white"
                      onClick={addChallenge}><Save className="w-4 h-4" /> Save</button>
                    <button className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm border"
                      onClick={()=>{ setCreateOpen(false); setDraftPdf(null); }}><X className="w-4 h-4" /> Cancel</button>
                  </div>
                </div>
                <textarea className="mt-2 w-full border rounded px-2 py-1 text-sm" rows={2} placeholder="Description"
                  value={draft.description} onChange={(e)=>setDraft(v=>({...v, description: e.target.value}))} />
                <div className="mt-3 flex flex-col gap-1 text-xs text-gray-600">
                  <label className="font-semibold text-gray-700">Attach rules PDF (optional)</label>
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e)=> handleDraftPdf(e.target.files?.[0] ?? null)}
                    className="text-sm text-gray-700 file:mr-2 file:rounded file:border file:border-gray-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-gray-50"
                  />
                  {draftPdf && (
                    <span className="text-gray-600">Selected: {draftPdf.name}</span>
                  )}
                </div>
              </div>
            )}




            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-left text-gray-600">
                  <tr>
                    <th className="py-2 pr-2 w-64">Challenge</th>
                    <th className="py-2 pr-2 w-40">Date Range</th>
                    {teams.map(t => (
                      <th key={String(t.id)} className="py-2 px-2 text-right whitespace-nowrap">{t.name}</th>
                    ))}
                    <th className="py-2 px-2 text-right w-28">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {challenges.map(ch => {
                    const editing = editingId === ch.id;
                    return (
                      <tr key={ch.id} className="border-t align-top">
                        <td className="py-2 pr-2">


































                          {!editing ? (
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-rfl-navy">{ch.name}</span>
                              <button className="p-1 rounded hover:bg-gray-100" onClick={()=> setDescOpenId(v => v === ch.id ? null : ch.id)} title="Show description">
                                <Info className="w-4 h-4 text-gray-600" />
                              </button>
                            </div>
                          ) : (
                            <input className="border rounded px-2 py-1 text-sm w-full" value={ch.name}
                              onChange={(e)=> setChallenges(prev => prev.map(c => c.id===ch.id ? ({ ...c, name: e.target.value }) : c))} />
                          )}
                          {descOpenId === ch.id && !editing && ch.description && (
                            <div className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">{ch.description}</div>
                          )}
                          {editing && (
                            <textarea className="mt-2 w-full border rounded px-2 py-1 text-sm" rows={2}
                              value={ch.description}
                              onChange={(e)=> setChallenges(prev => prev.map(c => c.id===ch.id ? ({ ...c, description: e.target.value }) : c))} />
                          )}
                          {!editing && ch.rules_pdf_url && (
                            <div className="mt-2 text-xs">
                              <a
                                href={ch.rules_pdf_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500 underline"
                              >
                                View rules PDF
                              </a>
                            </div>
                          )}
                          {editing && (
                            <div className="mt-3 space-y-2 text-xs text-gray-600">
                              {ch.rules_pdf_url && !removePdfFlags[ch.id] && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <a
                                    href={ch.rules_pdf_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-500 underline"
                                  >
                                    Current rules PDF
                                  </a>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                                    onClick={()=> markRemovePdf(ch.id)}
                                  >
                                    Remove file
                                  </button>
                                </div>
                              )}
                              {removePdfFlags[ch.id] && (
                                <div className="flex flex-wrap items-center gap-2 text-red-600">
                                  <span>This PDF will be removed when you save.</span>
                                  <button
                                    type="button"
                                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium hover:bg-red-50"
                                    onClick={()=> clearRemovePdf(ch.id)}
                                  >
                                    Undo
                                  </button>
                                </div>
                              )}
                              <div className="flex flex-col gap-1">
                                <label className="font-semibold text-gray-700">Upload new PDF</label>
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  onChange={(e)=> handlePendingPdf(ch.id, e.target.files?.[0] ?? null)}
                                  className="text-sm text-gray-700 file:mr-2 file:rounded file:border file:border-gray-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium hover:file:bg-gray-50"
                                />
                                {pendingPdf[ch.id] && (
                                  <span className="text-gray-600">Selected: {pendingPdf[ch.id]?.name}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {!editing ? (
                            <span className="text-gray-700">{(ch.start_date || '—')} → {(ch.end_date || '—')}</span>
                          ) : (
                            <div className="grid grid-cols-1 gap-1">
                              <input className="border rounded px-2 py-1 text-sm" placeholder="YYYY-MM-DD" value={ch.start_date}
                                onChange={(e)=> setChallenges(prev => prev.map(c => c.id===ch.id ? ({ ...c, start_date: e.target.value }) : c))} />
                              <input className="border rounded px-2 py-1 text-sm" placeholder="YYYY-MM-DD" value={ch.end_date}
                                onChange={(e)=> setChallenges(prev => prev.map(c => c.id===ch.id ? ({ ...c, end_date: e.target.value }) : c))} />
                            </div>
                          )}
                        </td>
                        {teams.map(t => (
                          <td key={`${ch.id}-${String(t.id)}`} className="py-2 px-2 text-right">
                            {!editing ? (
                              <span className="[font-variant-numeric:tabular-nums]">{ch.scores[String(t.id)] ?? ''}</span>
                            ) : (
                              <input
                                className="w-20 border rounded px-2 py-1 text-sm text-right"
                                value={ch.scores[String(t.id)] ?? ''}
                                onChange={(e)=> setScore(ch.id, String(t.id), e.target.value)}
                                inputMode="numeric"
                              />
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-right whitespace-nowrap">
                          {!editing ? (
                            <div className="inline-flex items-center gap-2">
                              <button className="p-1 rounded border hover:bg-gray-50" onClick={()=> startEdit(ch.id)} title="Edit"><Pencil className="w-4 h-4" /></button>
                              <button className="p-1 rounded border hover:bg-gray-50" onClick={()=> deleteChallenge(ch.id)} title="Delete"><Trash2 className="w-4 h-4 text-red-600" /></button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-2">
                              <button className="p-1 rounded border bg-rfl-navy text-white hover:opacity-90" onClick={()=> saveEdit(ch.id, {})} title="Save"><Save className="w-4 h-4" /></button>
                              <button className="p-1 rounded border hover:bg-gray-50" onClick={cancelEdit} title="Cancel"><X className="w-4 h-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!challenges.length && (
                    <tr><td colSpan={2 + teams.length + 1} className="py-8 text-center text-gray-500">No challenges yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leaderboard-style view for selected challenge (matches player view) */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold">Challenge Leaderboard</h2>
              <div>
                <select
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white"
                  value={selectedChallengeIdGov || ''}
                  onChange={(e)=> setSelectedChallengeIdGov(e.target.value || null)}
                  disabled={!challenges.length}
                >
                  {challenges.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {(() => {
              const chosen = selectedChallengeIdGov ? challenges.find(c=>c.id===selectedChallengeIdGov) || null : null;
              const rows = (chosen ? teams.map(tm => {
                const sc = challenges.find(c=>c.id===chosen.id)?.scores[String(tm.id)] ?? null;
                return { team_id: String(tm.id), team_name: tm.name, score: sc == null ? null : Number(sc) };
              }) : []).sort((a,b)=> {
                const as = a.score == null ? -Infinity : Number(a.score);
                const bs = b.score == null ? -Infinity : Number(b.score);
                return bs - as || a.team_name.localeCompare(b.team_name);
              });
              return (
                <div className="overflow-x-auto">
                  {!chosen ? (
                    <div className="py-8 text-gray-600 text-center text-sm">No challenges yet.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-600">
                        <tr>
                          <th className="py-2 pr-2 w-12">Rank</th>
                          <th className="py-2 pr-2">Team</th>
                          <th className="py-2 pr-2 text-right w-24">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, idx) => (
                          <tr key={r.team_id} className="border-t">
                            <td className="py-2 pr-2 [font-variant-numeric:tabular-nums]">{idx+1}</td>
                            <td className="py-2 pr-2">
                              <span className="text-sm text-rfl-navy font-medium">{r.team_name}</span>
                            </td>
                            <td className="py-2 pr-2 text-right [font-variant-numeric:tabular-nums] font-semibold">
                              {r.score == null ? 'Not updated' : r.score}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
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
