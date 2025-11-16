"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSupabase } from "@/lib/supabase";
import { ChevronDown } from "lucide-react";

type MemberRow = {
  user_id: string;
  name: string;
  approved_points: number;
  avg_rr: number | null;
  rest_used?: number;
  missed_days?: number;
};

type PendingEntry = {
  id: string;
  user_id: string;
  date: string;
  type: string;
  workout_type: string | null;
  duration: number | null;
  distance: number | null;
  steps: number | null;
  holes: number | null;
  rr_value: number | null;
  status: 'pending' | 'approved' | 'rejected';
  proof_url: string | null;
  accounts: { first_name: string };
};

function formatLocalDateLabel(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split('-').map(v => parseInt(v, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return dt.toDateString();
}

function formatDMY(iso: string) {
  const [y, m, d] = iso.split('-').map(v => parseInt(v, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${String(dt.getDate()).padStart(2, '0')} ${dt.toLocaleString('en-US', { month: 'short' })}`;
}

function startOfWeekMondayLocal(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  copy.setDate(copy.getDate() - day);
  copy.setHours(0,0,0,0);
  return copy;
}

function ymd(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// League date functions (fixed season: Oct 15, 2025 → Jan 12, 2026)
function firstWeekStart(_year: number): Date {
  return new Date(Date.UTC(2025, 9, 15)); // Oct 15, 2025
}

function seasonEndStart(_year: number): Date {
  return new Date(Date.UTC(2026, 0, 12)); // Jan 12, 2026
}

function addDaysUTC(d: Date, days: number): Date {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function getWeekNumber(seasonStart: Date, date: Date): number {
  const diffTime = date.getTime() - seasonStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}

export default function TeamPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role as 'player' | 'leader' | 'governor' | undefined;

  useEffect(() => {
    if (role === 'governor') {
      router.replace('/governor');
    }
  }, [role, router]);
  const userId = session?.user?.id;
  const [teamId, setTeamId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;
  const [previewEntry, setPreviewEntry] = useState<PendingEntry | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("overall");
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [teamMissedDays, setTeamMissedDays] = useState<number>(0);
  const [teamRestDays, setTeamRestDays] = useState<number>(0);

  // Generate dropdown options based on league dates
  const dropdownOptions = useMemo(() => {
    const seasonStart = firstWeekStart(0);
    const seasonEnd = seasonEndStart(0);
    const today = new Date();
    
    const options = [{ value: "overall", label: "Season Total" }];
    
    // Add weeks that are completed or currently in progress
    let weekStart = new Date(seasonStart);
    let weekNum = 1;
    
    while (weekStart.getTime() <= Math.min(seasonEnd.getTime(), today.getTime())) {
      const weekEnd = addDaysUTC(weekStart, 6);
      const weekEndDate = new Date(Math.min(weekEnd.getTime(), today.getTime()));
      
      // Include week if it has started (even if not fully completed)
      if (weekStart.getTime() <= today.getTime()) {
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEndDate.toISOString().split('T')[0];
        const isCurrentWeek = (new Date(startStr) <= today) && (new Date(endStr) >= today);
        options.push({
          value: `week-${weekNum}`,
          label: `Week ${weekNum}${isCurrentWeek ? ' (Current)' : ''}`
        });
      }
      
      weekStart = addDaysUTC(weekStart, 7);
      weekNum++;
    }
    
    return options;
  }, []);

  // compute current week value (e.g. 'week-3') if today falls inside season
  const currentWeekValue = useMemo(() => {
    const seasonStart = firstWeekStart(0);
    const seasonEnd = seasonEndStart(0);
    const today = new Date();
    if (today.getTime() < seasonStart.getTime()) return null;
    const weekNum = getWeekNumber(seasonStart, today);
    const weekStart = addDaysUTC(seasonStart, (weekNum - 1) * 7);
    if (weekStart.getTime() > seasonEnd.getTime()) return null;
    return `week-${weekNum}`;
  }, []);

  // If nothing selected by user (default overall), set to current week so label shows dates
  useEffect(() => {
    // Default to 'overall' — don't auto-switch to current week
    // User can manually select weeks from dropdown if desired
  }, [currentWeekValue]);

  // discover the user's team
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await getSupabase().from('accounts').select('team_id').eq('id', userId).maybeSingle();
      setTeamId(data?.team_id ?? null);
    })();
  }, [userId]);

  // Reload members data when time period changes
  useEffect(() => {
    if (teamId) {
      loadMembersSummary(teamId, selectedPeriod);
      loadTeamSummary(teamId, selectedPeriod);
    }
  }, [teamId, selectedPeriod]);

  async function loadTeamSummary(currentTeamId: string, timePeriod: string = "overall") {
    // Determine date range based on time period
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    if (timePeriod !== "overall") {
      const currentYear = new Date().getUTCFullYear();
      const seasonStart = firstWeekStart(currentYear);
      const weekNum = parseInt(timePeriod.split('-')[1]);
      const weekStart = addDaysUTC(seasonStart, (weekNum - 1) * 7);
      const weekEnd = addDaysUTC(weekStart, 6);
      
      startDate = weekStart.toISOString().split('T')[0];
      endDate = weekEnd.toISOString().split('T')[0];
    }

    // Fetch team members
    const { data: teamUsers } = await getSupabase()
      .from('accounts')
      .select('id')
      .eq('team_id', currentTeamId);
    const memberIds = (teamUsers || []).map((u: { id: string }) => String(u.id));

    // Fetch approved entries for team with date filter
    let query = getSupabase()
      .from('entries')
      .select('user_id, type, date')
      .eq('team_id', currentTeamId)
      .eq('status', 'approved');
    
    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    }
    
    const { data: entries } = await query;

    // Calculate rest days
    const restDays = (entries || []).filter((e: { type: string }) => e.type === 'rest').length;
    setTeamRestDays(restDays);

    // Calculate missed days
    const memberSet = new Set(memberIds);
    const byDateUser = new Set((entries || []).map((e: { date: string; user_id: string }) => `${String(e.date)}|${String(e.user_id)}`));
    
    let missed = 0;
    let cur: Date;
    let endDateCalc: Date;
    
    if (timePeriod === "overall") {
      // Overall: from fixed season start through yesterday (do not count today)
      cur = firstWeekStart(0);
      const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
      endDateCalc = new Date(todayUtc.getTime() - 24 * 3600 * 1000);
    } else {
      // Weekly: from week start to week end (or today if current week)
      const seasonStart = firstWeekStart(0);
      const weekNum = parseInt(timePeriod.split('-')[1]);
      cur = addDaysUTC(seasonStart, (weekNum - 1) * 7);
      const weekEnd = addDaysUTC(cur, 6);
      const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
      const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 3600 * 1000);
      // If current week is ongoing, stop at yesterday; otherwise use week end
      endDateCalc = weekEnd.getTime() >= todayUtc.getTime() ? yesterdayUtc : weekEnd;
    }
    
    while (cur.getTime() <= endDateCalc.getTime()) {
      const ds = cur.toISOString().split('T')[0];
      memberSet.forEach((uid) => { 
        if (!byDateUser.has(`${ds}|${uid}`)) missed += 1; 
      });
      cur = new Date(cur.getTime() + 24 * 3600 * 1000);
    }
    
    setTeamMissedDays(missed);
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownOpen) {
        const target = event.target as Element;
        if (!target.closest('.dropdown-container')) {
          setDropdownOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  async function loadMembersSummary(currentTeamId: string, timePeriod: string = "overall") {
    // Fetch team members
    const { data: teamUsers } = await getSupabase()
      .from('accounts')
      .select('id, first_name')
      .eq('team_id', currentTeamId);
    const memberMap = new Map<string, MemberRow>();
    (teamUsers || []).forEach((u: { id: string; first_name: string }) => {
      memberMap.set(String(u.id), {
        user_id: String(u.id),
        name: String(u.first_name || ''),
        approved_points: 0,
        avg_rr: null,
        rest_used: 0,
        missed_days: 0,
      });
    });

    // Determine date range based on time period
    let startDate: string | null = null;
    let endDate: string | null = null;
    
    if (timePeriod !== "overall") {
      const currentYear = new Date().getUTCFullYear();
      const seasonStart = firstWeekStart(currentYear);
      const weekNum = parseInt(timePeriod.split('-')[1]);
      const weekStart = addDaysUTC(seasonStart, (weekNum - 1) * 7);
      const weekEnd = addDaysUTC(weekStart, 6);
      
      startDate = weekStart.toISOString().split('T')[0];
      endDate = weekEnd.toISOString().split('T')[0];
    }

    // Fetch approved entries for team with date filter
    let query = getSupabase()
      .from('entries')
      .select('user_id, rr_value, type, date')
      .eq('team_id', currentTeamId)
      .eq('status', 'approved');
    
    if (startDate && endDate) {
      query = query.gte('date', startDate).lte('date', endDate);
    }
    
    const { data: entries } = await query;

    const rrAgg = new Map<string, { sum: number; count: number }>();
    (entries || []).forEach((e: { user_id: string; rr_value: number | null; type: string }) => {
      const uid = String(e.user_id);
      const row = memberMap.get(uid);
      if (row) {
        const rrNum = typeof e.rr_value === 'number' ? e.rr_value : Number(e.rr_value || 0);
        const isRest = e.type === 'rest';
        row.approved_points += isRest ? (rrNum > 0 ? 1 : 0) : 1;
        if (isRest) row.rest_used = (row.rest_used || 0) + 1;
        if (rrNum > 0) {
          const agg = rrAgg.get(uid) || { sum: 0, count: 0 };
          agg.sum += rrNum;
          agg.count += 1;
          rrAgg.set(uid, agg);
        }
      }
    });

    // finalize avg rr
    rrAgg.forEach((agg, uid) => {
      const row = memberMap.get(uid);
      if (row) {
        row.avg_rr = Math.round((agg.sum / Math.max(1, agg.count)) * 100) / 100;
      }
    });

    // Missed days calculation based on time period
    const datesByUser = new Map<string, Set<string>>();
    (entries || []).forEach((e: any) => {
      const ds = String(e.date);
      const uid = String(e.user_id);
      const set = datesByUser.get(uid) || new Set<string>();
      set.add(ds);
      datesByUser.set(uid, set);
    });
    
    memberMap.forEach((row, uid) => {
      let missed = 0;
      let cur: Date;
      let endDate: Date;
      
      if (timePeriod === "overall") {
        // Overall: from fixed season start through yesterday (do not count today)
        cur = firstWeekStart(0);
        const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
        endDate = new Date(todayUtc.getTime() - 24 * 3600 * 1000);
      } else {
        // Weekly: from week start to week end (or today if current week)
        const seasonStart = firstWeekStart(0);
        const weekNum = parseInt(timePeriod.split('-')[1]);
        cur = addDaysUTC(seasonStart, (weekNum - 1) * 7);
        const weekEnd = addDaysUTC(cur, 6);
        const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
        const yesterdayUtc = new Date(todayUtc.getTime() - 24 * 3600 * 1000);
        endDate = weekEnd.getTime() >= todayUtc.getTime() ? yesterdayUtc : weekEnd;
      }
      
      const set = datesByUser.get(uid) || new Set<string>();
      while (cur.getTime() <= endDate.getTime()) {
        const ds = new Date(cur).toISOString().split('T')[0];
        if (!set.has(ds)) missed += 1;
        cur = new Date(cur.getTime() + 24 * 3600 * 1000);
      }
      row.missed_days = missed;
    });

    const sortedMembers = Array.from(memberMap.values()).sort((a,b)=> (b.approved_points||0)-(a.approved_points||0) || ((b.avg_rr||0)-(a.avg_rr||0)) );
    setMembers(sortedMembers);
  }

  async function loadPending(currentTeamId: string, pageNum: number) {
    const from = (pageNum - 1) * pageSize;
    const to = from + pageSize - 1;
    // Only show entries from today and yesterday
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const startStr = ymd(yesterday); // inclusive
    const endStr = ymd(today);       // inclusive
    // total count
    const { count } = await getSupabase()
      .from('entries')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', currentTeamId)
      .eq('status', 'approved')
      .gte('date', startStr)
      .lte('date', endStr);
    setPendingCount(count || 0);

    // page data
    const { data: pend } = await getSupabase()
      .from('entries')
      .select('id,user_id,date,type,workout_type,duration,distance,steps,holes,rr_value,status,proof_url,accounts!inner(first_name)')
      .eq('team_id', currentTeamId)
      .eq('status','approved')
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: false })
      .range(from, to);
    const normalized = (pend || []).map((e: any) => ({
      ...e,
      accounts: Array.isArray(e.accounts) ? (e.accounts[0] || { first_name: '' }) : e.accounts,
    })) as PendingEntry[];
    setPending(normalized || []);
  }

  useEffect(() => {
    if (!teamId) return;
    (async () => {
      await loadMembersSummary(teamId);
      await loadPending(teamId, page);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, page]);

  const totals = useMemo(() => {
    const pts = members.reduce((a, m) => a + (m.approved_points || 0), 0);
    const rrVals = members.map(m => m.avg_rr).filter((v): v is number => typeof v === 'number');
    const rr = rrVals.length ? (rrVals.reduce((a,b)=>a+b,0)/rrVals.length) : 0;
    return { pts, rr: Number((Math.round(rr * 100) / 100).toFixed(2)) };
  }, [members]);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-rfl-navy mb-2">Team Dashboard</h1>
          <p className="text-gray-600">Your team's progress and participation — all in one view.</p>
        </div>

      <Card className="bg-white shadow-md mb-6">
        <CardHeader>
          <CardTitle className="text-xl text-rfl-navy">Team Summary</CardTitle>
          <CardDescription>Quick overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-center">
          <div className="p-3 rounded gradient-box text-foreground">
              <div className="text-xs text-gray-600">Points</div>
              <div className="text-lg font-bold text-rfl-coral">{totals.pts}</div>
            </div>
            <div className="p-3 rounded gradient-box text-foreground">
              <div className="text-xs text-gray-600">Avg RR</div>
              <div className="text-lg font-bold text-rfl-navy">{totals.rr}</div>
            </div>
            <div className="p-3 rounded gradient-box text-foreground">
              <div className="text-xs text-gray-600">Days Missed</div>
              <div className="text-lg font-bold text-rfl-navy">{teamMissedDays}</div>
            </div>
            <div className="p-3 rounded gradient-box text-foreground">
              <div className="text-xs text-gray-600">Rest Days Used</div>
              <div className="text-lg font-bold text-rfl-navy">{teamRestDays}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl text-rfl-navy">Members</CardTitle>
              <CardDescription>Sorted by points & RR</CardDescription>
            </div>
            <div className="relative dropdown-container">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-rfl-coral focus:border-transparent"
              >
                <span>{dropdownOptions.find(opt => opt.value === selectedPeriod)?.label || "Season Total"}</span>
                <ChevronDown className="w-4 h-4" />
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                  <div className="py-1">
                    {dropdownOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setSelectedPeriod(option.value);
                          setDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-100 ${
                          selectedPeriod === option.value ? 'bg-rfl-coral/10 text-rfl-coral' : 'text-gray-700'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {members.map((m, idx) => (
              <div key={m.user_id} className="p-3 border rounded">
                <div className="flex sm:flex-row flex-col sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-rfl-navy text-white flex items-center justify-center font-semibold">{idx+1}</div>
                    <div className="font-medium text-rfl-navy">{m.name}</div>
                  </div>
                  <div className="grid grid-cols-4 sm:gap-6 gap-3 text-xs sm:text-sm w-full sm:w-auto">
                    <div className="text-center whitespace-nowrap">
                      <div className="font-semibold text-rfl-coral">{m.approved_points ?? 0}</div>
                      <div className="text-gray-600">Points</div>
                    </div>
                    <div className="text-center whitespace-nowrap">
                      <div className="font-semibold text-rfl-coral">{m.rest_used ?? 0}</div>
                      <div className="text-gray-600">Rest</div>
                    </div>
                    <div className="text-center whitespace-nowrap">
                      <div className="font-semibold text-rfl-navy">{m.missed_days ?? 0}</div>
                      <div className="text-gray-600">Missed</div>
                    </div>
                    <div className="text-center whitespace-nowrap">
                      <div className="font-semibold text-rfl-navy">{typeof m.avg_rr === 'number' ? m.avg_rr : '-'}</div>
                      <div className="text-gray-600">RR</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {!members.length && <div className="text-gray-600">No data yet.</div>}
          </div>
        </CardContent>
      </Card>

      {/* Leader approvals */}
      {session?.user?.role === 'leader' && (
        <>
          <Card className="bg-white shadow-md mt-6">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl text-rfl-navy">Submitted Entries</CardTitle>
                  <CardDescription>View and manage submitted entries</CardDescription>
                </div>
                <div className="px-3 py-1 text-xs font-semibold rounded-full border bg-white whitespace-nowrap">Submitted: {pendingCount}</div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {pending.map((e) => (
                  <div key={e.id} className="p-3 border rounded">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-rfl-navy truncate">{e.accounts.first_name} — {formatLocalDateLabel(e.date)}</div>
                        <div className="text-sm text-gray-600">
                          {e.type === 'rest' ? 'Rest Day' : `${e.workout_type || ''}`}
                          {e.duration ? ` • ${e.duration}m` : ''}
                          {e.distance ? ` • ${e.distance}km` : ''}
                          {e.steps ? ` • ${e.steps} steps` : ''}
                          {e.holes ? ` • ${e.holes} holes` : ''}
                          {typeof e.rr_value === 'number' ? ` • RR ${Number(e.rr_value).toFixed(2)}` : ''}
                        </div>
                      </div>
                      {/* Desktop action group */}
                      <div className="hidden sm:flex shrink-0 gap-2">
                        <button className="px-3 py-1 rounded border text-blue-700 border-blue-300 hover:bg-blue-50" onClick={()=> setPreviewEntry(e)}>View</button>
                        <button className="px-3 py-1 rounded border text-red-700 border-red-300 hover:bg-red-50" onClick={async()=>{
                          const confirmed = window.confirm(`Are you sure you want to reject ${e.accounts.first_name}'s entry? This action cannot be undone. Please inform the player to correct and resubmit.`);
                          if (!confirmed) return;
                          await getSupabase().from('entries').update({ status: 'rejected' }).eq('id', e.id);
                          setPending(p=>p.filter(x=>x.id!==e.id));
                          if (teamId) { await loadMembersSummary(teamId); await loadPending(teamId, page); }
                        }}>Don't Accept</button>
                      </div>
                    </div>
                    {/* Mobile action row */}
                    <div className="mt-2 flex sm:hidden gap-2">
                      <button className="flex-1 py-2 rounded border text-blue-700 border-blue-300 hover:bg-blue-50" onClick={()=> setPreviewEntry(e)}>View</button>
                      <button className="flex-1 py-2 rounded border text-red-700 border-red-300 hover:bg-red-50" onClick={async()=>{
                        const confirmed = window.confirm(`Are you sure you want to reject ${e.accounts.first_name}'s entry? This action cannot be undone. Please inform the player to correct and resubmit.`);
                        if (!confirmed) return;
                        await getSupabase().from('entries').update({ status: 'rejected' }).eq('id', e.id);
                        setPending(p=>p.filter(x=>x.id!==e.id));
                        if (teamId) { await loadMembersSummary(teamId); await loadPending(teamId, page); }
                      }}>Don't Accept</button>
                    </div>
                  </div>
                ))}
                {!pending.length && <div className="text-gray-600">No submitted entries.</div>}
              </div>

              {/* Pagination */}
              <div className="mt-4 flex items-center justify-center gap-2">
                <button
                  className={`p-1 rounded border ${page > 1 ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={async()=>{ if (page > 1) setPage(page-1); }}
                  aria-label="Previous page"
                >
                  ‹
                </button>
                <div className="px-3 py-1 rounded bg-gray-100 text-sm font-medium text-gray-800">Page {page}</div>
                <button
                  className={`p-1 rounded border ${page * pageSize < pendingCount ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={async()=>{ if (page * pageSize < pendingCount) setPage(page+1); }}
                  aria-label="Next page"
                >
                  ›
                </button>
              </div>
            </CardContent>
          </Card>

        {/* Proof preview modal */}
        {previewEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={()=> setPreviewEntry(null)}>
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-[90%] p-3" onClick={(e)=> e.stopPropagation()}>
              <div className="flex justify-end mb-2">
                <button className="text-gray-500 hover:text-gray-700" onClick={()=> setPreviewEntry(null)}>✕</button>
              </div>
              {previewEntry.proof_url ? (
                <div className="w-full flex justify-center">
                  <img src={previewEntry.proof_url} alt="Proof" className="max-h-[60vh] object-contain" />
                </div>
              ) : (
                <div className="w-full flex justify-center py-8">
                  <div className="text-gray-500">No proof image available</div>
                </div>
              )}
              {/* Workout details */}
              <div className="mt-6 text-sm text-gray-800">
                <div className="font-semibold text-rfl-navy mb-1">Workout Details</div>
                <div className="space-y-1">
                  <div><b>Type:</b> {previewEntry.type === 'rest' ? 'Rest Day' : (previewEntry.workout_type || '—')}</div>
                  {previewEntry.duration ? <div><b>Duration:</b> {previewEntry.duration} min</div> : null}
                  {previewEntry.distance ? <div>Distance: {previewEntry.distance} km</div> : null}
                  {previewEntry.steps ? <div><b>Steps:</b> {previewEntry.steps}</div> : null}
                  {previewEntry.holes ? <div><b>Holes:</b> {previewEntry.holes}</div> : null}
                  {typeof previewEntry.rr_value === 'number' ? <div><b>RR:</b> {Number(previewEntry.rr_value).toFixed(2)}</div> : null}
                </div>
              </div>
            </div>
          </div>
        )}

        </>
      )}
      </div>
    </div>
  )
}
