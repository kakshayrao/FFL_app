"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Calendar, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getSupabase, calculateRR } from "@/lib/supabase";
import TeamProgressChart from "./TeamProgressChart";

// 11-player teams adjustment factor (normalize to 10-player baseline)
const ELEVEN_PLAYER_TEAMS = new Set<string>([
  '76514ecd-e8c9-4868-892f-30fb2d1c42d6', // Crusaders (11 players)
  '7a9419d7-0c0d-4c2d-b962-24af3448d0b6', // Deccan Warriors (11 players)
]);
const ELEVEN_TEAM_FACTOR = 10 / 11;

type ActivityRow = {
  date: string;
  type: string | null;
  workout_type: string | null;
  duration: number | null;
  distance: number | null;
  steps: number | null;
  holes: number | null;
  status: "pending" | "approved" | "rejected" | null;
  rr_value: number | null;
  points: number | null;
};

const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Local-date formatter (no UTC conversion) → guarantees device-local YYYY-MM-DD
function formatLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayLocalStr(): string {
  const d = new Date();
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() - 1);
  return formatLocalYYYYMMDD(d);
}

function formatDateYYYYMMDD(d: Date): string {
  // Use UTC components to avoid timezone shifting across boundaries
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .split("T")[0];
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

// Fixed season window: Oct 15, 2025 → Jan 12, 2026
function seasonFixedStart(): Date {
  return new Date(Date.UTC(2025, 9, 15)); // Oct 15, 2025
}
function seasonFixedEnd(): Date {
  return new Date(Date.UTC(2026, 0, 12)); // Jan = 0
}
const SEASON_START_LOCAL_STR = '2025-10-15';
const SEASON_END_LOCAL_STR = '2026-01-12';
function firstWeekStart(_year: number): Date {
  // Week 1 starts exactly on season start (Oct 15, 2025 - Wednesday)
  return seasonFixedStart();
}
function seasonEndStart(_year: number): Date {
  // Last allowed week start is the latest start (start + 7k) not after season end
  const start = seasonFixedStart();
  const end = seasonFixedEnd();
  const diffDays = Math.floor((end.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
  return addDaysUTC(start, diffDays * 7);
}

function formatLocalDateLabel(yyyyMmDd: string): string {
  // Parse as local date to avoid timezone shifts (YYYY-MM-DD is treated as UTC if passed to Date constructor)
  const [y, m, d] = yyyyMmDd.split('-').map((v) => parseInt(v, 10));
  const localDate = new Date(y, (m || 1) - 1, d || 1);
  return localDate.toDateString();
}

function formatDMY(iso: string) {
  const [y, m, d] = iso.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return `${String(dt.getDate()).padStart(2, '0')} ${dt.toLocaleString('en-US', { month: 'short' })}`;
}

type ActivityConfig = {
  name: string;
  fields: Array<'duration' | 'distance' | 'steps' | 'holes'>;
  rules: string[];
  minDuration?: number;
  minDistance?: number;
  minSteps?: number;
  minHoles?: number;
};

const ACTIVITY_CONFIGS: Record<string, ActivityConfig> = {
  run: {
    name: "Brisk Walk/Jog/Run",
    fields: ['distance'],
    rules: ["Distance only — min 4 km (<65) / 2.6 km (65+). One continuous stretch."],
    minDistance: 4,
  },
  gym: {
    name: "Weightlifting / Gym Workout",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  yoga: {
    name: "Yoga/Pilates/Zumba",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  cycling: {
    name: "Cycling",
    fields: ['duration', 'distance'],
    rules: ["10 kms OR 45 mins minimum"],
    minDistance: 10,
    minDuration: 45,
  },
  swimming: {
    name: "Swimming",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  horse_riding: {
    name: "Horse Riding",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  badminton_pickleball: {
    name: "Badminton/Pickleball",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  basketball_cricket: {
    name: "Basketball/Cricket",
    fields: ['duration'],
    rules: ["45 mins minimum"],
    minDuration: 45,
  },
  meditation: {
    name: "Meditation/Chanting/Breathing",
    fields: ['duration'],
    rules: ["30–45 mins minimum (30 for seniors)"],
    minDuration: 45,
  },
  steps: {
    name: "Steps",
    fields: ['steps'],
    rules: ["10,000 steps minimum"],
    minSteps: 10000,
  },
  golf: {
    name: "Golf",
    fields: ['holes'],
    rules: ["9 holes"],
    minHoles: 9,
  },
};

export default function DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userId = session?.user?.id;
  const role = (session?.user as any)?.role as 'player' | 'leader' | 'governor' | undefined;
  const [isSenior, setIsSenior] = useState<boolean>(false);

  const [openWorkout, setOpenWorkout] = useState(false);
  const [openRest, setOpenRest] = useState(false);
  const [date, setDate] = useState<string>(todayStr());
  const [activity, setActivity] = useState("steps");
  const [duration, setDuration] = useState<number | "">(45);
  const [distance, setDistance] = useState<string | number>("");
  const [steps, setSteps] = useState<number | "">("");
  const [holes, setHoles] = useState<number | "">("");
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [restUsed, setRestUsed] = useState<number>(0);
  const [validationError, setValidationError] = useState<string>("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofError, setProofError] = useState<string>("");
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState<string>("");
  const [teamPoints, setTeamPoints] = useState<number | null>(null);
  const [teamAvgRR, setTeamAvgRR] = useState<number | null>(null);
  const [teamPosition, setTeamPosition] = useState<number | null>(null);
  const [chartDates, setChartDates] = useState<string[]>([]);
  const [weekRestDays, setWeekRestDays] = useState<number>(0);
  const [teamMissedWeek, setTeamMissedWeek] = useState<number>(0);
  const [teamRestWeek, setTeamRestWeek] = useState<number>(0);
  const [myPoints, setMyPoints] = useState<number>(0);
  const [myAvgRR, setMyAvgRR] = useState<number | null>(null);
  const [myMissedDays, setMyMissedDays] = useState<number>(0);
  const [myRestUsed, setMyRestUsed] = useState<number>(0);
  const [viewWeekStart, setViewWeekStart] = useState<Date>(() => seasonFixedStart());

  // On mount, default view to the current week (Sunday→Saturday) if today falls inside the season
  useEffect(() => {
    const today = new Date();
    const seasonStart = seasonFixedStart();
    const seasonEnd = seasonFixedEnd();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (todayUtc.getTime() < seasonStart.getTime() || todayUtc.getTime() > seasonEnd.getTime()) return;
    const diffDays = Math.floor((todayUtc.getTime() - seasonStart.getTime()) / (24 * 3600 * 1000));
    const weekNum = Math.floor(diffDays / 7);
    const currentWeekStart = addDaysUTC(seasonStart, weekNum * 7);
    setViewWeekStart(currentWeekStart);
  }, []);

  const currentConfig = ACTIVITY_CONFIGS[activity];
  const sessionAge = (session?.user as any)?.age as number | undefined;
  const isSeniorEffective = (typeof sessionAge === 'number' && sessionAge >= 65) || isSenior;
  const PROOF_BUCKET = (process.env.NEXT_PUBLIC_PROOF_BUCKET as string) || 'rofl_proof_pics';
  
  // Governors should not see the player dashboard; redirect to governor view
  useEffect(() => {
    if (role === 'governor') {
      // Hard redirect to ensure cookie propagation on prod
      if (typeof window !== 'undefined') window.location.replace('/governor');
    }
  }, [role, router]);
  // Compute on client after mount to avoid SSR timezone discrepancies
  const [canLogToday, setCanLogToday] = useState<boolean>(false);
  useEffect(() => {
    const t = todayStr();
    setCanLogToday(t >= SEASON_START_LOCAL_STR && t <= SEASON_END_LOCAL_STR);
  }, []);
  const seasonGuardMsg = 'Season runs Oct 15, 2025 to Jan 12, 2026. Logging opens on Oct 15.';
  

  const validateWorkout = useMemo(() => {
    if (!userId) return { valid: false, error: "" };
    const config = ACTIVITY_CONFIGS[activity];

    if (activity === "steps") {
      const minSteps = isSeniorEffective ? 5000 : (config.minSteps || 0);
      if (!steps || Number(steps) < minSteps) {
        return { valid: false, error: `Minimum ${minSteps.toLocaleString()} steps required` };
      }
      return { valid: true, error: "" };
    }

    if (activity === "run") {
      const distanceProvided = distance !== "" && distance !== null && Number(distance) > 0;
      const minDist = isSeniorEffective ? 2.6 : 4;
      const distanceValid = distanceProvided && Number(distance) >= minDist;
      if (!distanceValid) {
        return { valid: false, error: `Minimum ${minDist} kms required for Brisk Walk/Jog/Run` };
      }
      return { valid: true, error: "" };
    }

    if (activity === "golf") {
      const holesProvided = holes !== "" && holes !== null && Number(holes) > 0;
      const holesValid = holesProvided && Number(holes) >= (config.minHoles || 0);
      if (!holesValid) {
        return { valid: false, error: `Minimum ${config.minHoles} holes required` };
      }
      return { valid: true, error: "" };
    }

    const durationProvided = duration !== "" && duration !== null && Number(duration) > 0;
    const distanceProvided = distance !== "" && distance !== null && Number(distance) > 0;
    const minDur = isSeniorEffective ? 30 : (config.minDuration || 0);
    const durationValid = durationProvided && Number(duration) >= minDur;
    const distanceValid = distanceProvided && Number(distance) >= (config.minDistance || 0);

    if (config.fields.includes('distance') && config.minDistance) {
      if (durationProvided && distanceProvided) {
        return { valid: false, error: "Please provide only one: Duration OR Distance" };
      }
      if (!durationValid && !distanceValid) {
        return { valid: false, error: `Minimum ${minDur} mins OR ${config.minDistance} kms required` };
      }
    } else {
      if (!durationValid) {
        return { valid: false, error: `Minimum ${minDur} mins required` };
      }
    }

    return { valid: true, error: "" };
  }, [userId, activity, duration, distance, steps, holes]);

  // Helpers for numeric-only validation in text inputs
  const isIntString = (v: string) => /^\d+$/.test(v);
  // Accepts integers, decimals, and intermediate states like "12." or ".5"
  const isDecimalString = (v: string) => /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(v);

  async function fetchActivity(weekStart?: Date) {
    if (!userId) return;
    const ws = weekStart || viewWeekStart;
    const we = new Date(ws);
    we.setUTCDate(ws.getUTCDate() + 6);
    const { data, error } = await getSupabase()
      .from('entries')
      .select('date,type,workout_type,duration,distance,steps,holes,status,rr_value')
      .eq('user_id', userId)
      .gte('date', formatDateYYYYMMDD(ws))
      .lte('date', formatDateYYYYMMDD(we))
      .order('date', { ascending: true });
    if (error) return;
    const entries = (data || []) as Array<Omit<ActivityRow,'points'>>;
    const filled: ActivityRow[] = [];
    let restCount = 0;
    for (let i = 0; i < 7; i++) {
      const day = new Date(ws);
      day.setUTCDate(ws.getUTCDate() + i);
      const ds = formatDateYYYYMMDD(day);
      const e = entries.find(x => String(x.date) === ds);
      const isRest = e?.type === 'rest' && e?.status === 'approved';
      if (isRest) restCount++;
      filled.push({
        date: ds,
        type: e?.type ?? null,
        workout_type: e?.workout_type ?? null,
        duration: e?.duration ?? null,
        distance: e?.distance ?? null,
        steps: e?.steps ?? null,
        holes: e?.holes ?? null,
        status: (e?.status as ActivityRow['status']) ?? null,
        rr_value: e?.rr_value ?? null,
        points: e && e.status === 'approved' ? 1 : 0,
      });
    }
    setRows(filled);
    setWeekRestDays(restCount);
  }

  useEffect(() => {
    fetchActivity(viewWeekStart);
    (async () => {
      if (!userId) return;
      // Fetch user's team id, age and name
      const { data: acct } = await getSupabase()
        .from('accounts')
        .select('team_id, age, teams(name)')
        .eq('id', userId)
        .maybeSingle();
      type Acct = { team_id: string | null; age: number | null; teams?: { name?: string } | null } | null;
      const tId = (acct as Acct)?.team_id || null;
      const tName = (acct as Acct)?.teams?.name || "";
      setTeamId(tId);
      setTeamName(tName || "");
      const ageVal = (acct as Acct)?.age ?? null;
      setIsSenior(typeof ageVal === 'number' && ageVal >= 65);

      // Fetch rest day count
      const { count } = await getSupabase()
        .from('entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'rest')
        .eq('status', 'approved');
      setRestUsed(count || 0);

      // Fetch leaderboard to compute team position (overall)
      const { data: leaderboard } = await getSupabase().rpc('rfl_team_leaderboard');
      const rowsAny = (leaderboard as unknown as Array<Record<string, unknown>>) || [];
      // Try to derive rank by points desc, rr desc if not present
      const getNum = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
      const findKey = (obj: Record<string, unknown>, keys: string[]): string | null => {
        for (const k of keys) if (k in obj) return k; return null;
      };
      const idKey = rowsAny[0] ? (findKey(rowsAny[0], ['team_id','id','teamid']) || 'team_id') : 'team_id';
      const nameKey = rowsAny[0] ? (findKey(rowsAny[0], ['team_name','name']) || 'team_name') : 'team_name';
      const ptsKey = rowsAny[0] ? (findKey(rowsAny[0], ['points','total_points','sum_points']) || 'points') : 'points';
      const rrKey = rowsAny[0] ? (findKey(rowsAny[0], ['avg_rr','average_rr','rr']) || 'avg_rr') : 'avg_rr';

      const sorted = [...rowsAny].sort((a,b)=>{
        const dp = getNum(b[ptsKey]) - getNum(a[ptsKey]);
        if (dp !== 0) return dp;
        return getNum(b[rrKey]) - getNum(a[rrKey]);
      });
      let pos: number | null = null;
      let pts: number | null = null;
      let rr: number | null = null;
      if (tId) {
        const idx = sorted.findIndex(r => String(r[idKey]) === String(tId));
        if (idx >= 0) {
          pos = idx + 1;
          let rawPts = getNum(sorted[idx][ptsKey]);
          // Apply adjustment factor for 11-player teams
          if (ELEVEN_PLAYER_TEAMS.has(String(tId))) {
            rawPts = rawPts * ELEVEN_TEAM_FACTOR;
          }
          pts = Math.round(rawPts);
          rr = getNum(sorted[idx][rrKey]);
        }
      } else if (tName) {
        const idx = sorted.findIndex(r => String(r[nameKey]) === String(tName));
        if (idx >= 0) {
          pos = idx + 1;
          let rawPts = getNum(sorted[idx][ptsKey]);
          // Apply adjustment factor for 11-player teams
          if (tId && ELEVEN_PLAYER_TEAMS.has(String(tId))) {
            rawPts = rawPts * ELEVEN_TEAM_FACTOR;
          }
          pts = Math.round(rawPts);
          rr = getNum(sorted[idx][rrKey]);
        }
      }
      if (pts !== null) setTeamPoints(pts);
      if (rr !== null) setTeamAvgRR(Math.round((rr as number) * 100) / 100);
      if (pos !== null) setTeamPosition(pos);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, viewWeekStart]);

  // Load individual overall stats (season-to-date)
  useEffect(() => {
    (async () => {
      if (!userId) return;
      const seasonStart = seasonFixedStart();
      const today = new Date();
      const yesterdayCutoff = new Date(today.getTime() - 24 * 3600 * 1000);
      const seasonStartStr = SEASON_START_LOCAL_STR;
      const todayLocalStr = formatLocalYYYYMMDD(today);

      // Fetch all my approved entries for the season
      const { data: myEntries } = await getSupabase()
        .from('entries')
        .select('type, rr_value, date')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .gte('date', seasonStartStr)
        .lte('date', todayLocalStr);

      const entries = (myEntries || []) as Array<{ type: string; rr_value: number | null; date: string }>;

      // Calculate my stats
      const points = entries.length; // every approved entry counts 1
      const rrVals = entries.map(e => (typeof e.rr_value === 'number' ? e.rr_value : Number(e.rr_value || 0))).filter(v => v > 0);
      const avgRR = rrVals.length ? Math.round((rrVals.reduce((a,b)=>a+b,0)/rrVals.length)*100)/100 : null;
      const restUsed = entries.filter(e => String(e.type) === 'rest').length;

      // Calculate missed days (days from season start through yesterday with no entry).
      const byDate = new Set(entries.map(e => String(e.date)));
      let missed = 0;
      let cur = new Date(seasonStart);
      while (cur.getTime() <= yesterdayCutoff.getTime()) {
        const ds = formatLocalYYYYMMDD(new Date(cur));
        if (!byDate.has(ds)) missed += 1;
        cur = new Date(cur.getTime() + 24 * 3600 * 1000);
      }

      setMyPoints(points);
      setMyAvgRR(avgRR);
      setMyMissedDays(missed);
      setMyRestUsed(restUsed);
    })();
  }, [userId]);

  // Compute Team overall summary (approved entries only) for season-to-date
  useEffect(() => {
    (async () => {
      let effectiveTeamId = teamId;
      if (!effectiveTeamId && userId) {
        const { data: acct } = await getSupabase()
          .from('accounts')
          .select('team_id')
          .eq('id', userId)
          .maybeSingle();
        effectiveTeamId = (acct as any)?.team_id || null;
        if (effectiveTeamId) setTeamId(effectiveTeamId);
      }
      if (!effectiveTeamId) return;

      const seasonStart = seasonFixedStart();
      const today = new Date();
      const yesterdayCutoff2 = new Date(today.getTime() - 24 * 3600 * 1000);
      const seasonStartStr = SEASON_START_LOCAL_STR;
      const todayLocalStr = formatLocalYYYYMMDD(today);
      
      // Fetch team members
      const { data: teamUsers } = await getSupabase()
        .from('accounts')
        .select('id')
        .eq('team_id', effectiveTeamId);
      const memberIds = ((teamUsers || []) as Array<{ id: string }>).map((u)=> String(u.id));
      
      // Fetch all approved entries for the team for the season
      const { data } = await getSupabase()
        .from('entries')
        .select('id, user_id, date, type, rr_value')
        .eq('team_id', effectiveTeamId)
        .eq('status', 'approved')
        .gte('date', seasonStartStr)
        .lte('date', todayLocalStr);
      const entries = (data || []) as Array<{ id: string; user_id: string; date: string; type: string | null; rr_value: number | null }>;
      const teamPts = entries.length; // every approved entry counts 1
      const rrVals = entries.map(e => (typeof e.rr_value === 'number' ? e.rr_value : Number(e.rr_value || 0))).filter(v => v > 0);
      const teamRR = rrVals.length ? Math.round((rrVals.reduce((a,b)=>a+b,0)/rrVals.length)*100)/100 : null;
      // Team rest days (approved)
      const restUsed = entries.filter(e => String(e.type) === 'rest').length;
      
      // Team missed days: per member per day with no entry from season start through yesterday
      const memberSet = new Set(memberIds);
      const byDateUser = new Set(entries.map(e => `${String(e.date)}|${String(e.user_id)}`));
      let missed = 0;
      {
        let day = new Date(seasonStart);
        while (day.getTime() <= yesterdayCutoff2.getTime()) {
          const ds = formatLocalYYYYMMDD(new Date(day));
          memberSet.forEach((uid)=>{ if (!byDateUser.has(`${ds}|${uid}`)) missed += 1; });
          day = new Date(day.getTime() + 24 * 3600 * 1000);
        }
      }
      setTeamPoints(teamPts);
      setTeamAvgRR(teamRR);
      setTeamRestWeek(restUsed);
      setTeamMissedWeek(missed);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, userId]);

  // Removed league-wide standings from dashboard (moved to leaderboards page)

  useEffect(() => {
    setDuration(currentConfig.minDuration || "");
    setDistance("");
    setSteps("");
    setHoles("");
    setValidationError("");
    setProofError("");
    setProofFile(null);
  }, [activity, currentConfig.minDuration]);

  async function onSaveWorkout() {
    if (!userId) return;
    if (!canLogToday) { alert(seasonGuardMsg); return; }
    if (todayStr() < SEASON_START_LOCAL_STR || todayStr() > SEASON_END_LOCAL_STR) { alert(seasonGuardMsg); return; }
    // Allow only current date captured at modal open time (or yesterday if implemented)
    const t = todayStr();
    const y = yesterdayLocalStr();
    if (date !== t && date !== y) { alert('You can only submit for today or yesterday.'); return; }
    if (!validateWorkout.valid) {
      setValidationError(validateWorkout.error);
      return;
    }
    // Require proof image upload
    if (!proofFile) {
      setProofError('Proof image is required.');
      return;
    }

    const { data: hasExisting } = await getSupabase().rpc("rfl_has_entry_on_date", { p_user_id: userId, p_date: date });
    if (date === t && hasExisting) {
      const ok = window.confirm('You already have a log for today. Overwrite it?');
      if (!ok) return;
    }
    if (date === y) {
      const { data: existingY } = await getSupabase().from('entries').select('id,status').eq('user_id', userId).eq('date', y).maybeSingle();
      if (!existingY || existingY.status !== 'rejected') { alert('You cannot submit yesterday’s workout unless your submission yesterday was rejected.'); return; }
      const ok = window.confirm("You're about to overwrite your rejected entry from yesterday. Continue?");
      if (!ok) return;
    }

    // Pre-submit verification warning (only for duration-based threshold, > 1.6x baseline)
    // Applies to: run, gym, yoga, cycling, swimming, badminton_pickleball, basketball_cricket
    // No warning for: steps, golf, meditation
    try {
      const warnTypes = new Set([
        'gym',
        'yoga',
        'cycling',
        'swimming',
        'badminton_pickleball',
        'basketball_cricket',
      ]);
      const hasDuration = duration !== "" && duration !== null && !Number.isNaN(Number(duration));
      if (warnTypes.has(activity) && hasDuration) {
        const baseDuration = typeof sessionAge === 'number' && sessionAge >= 65 ? 30 : 45; // mins
        const rrBasedOnDuration = Number(duration) / baseDuration;
        if (rrBasedOnDuration > 1.6) {
          const ok = window.confirm(
            "Your workout looks long and has been selected for verification. Only active minutes count — any mismatch may reduce RR or lose points. Screenshot showing avg heart rate and calories is preferred"
          );
      if (!ok) return;
    }
      }
    } catch {}

    setLoading(true);
    try {
      // 1) Upload proof image to Supabase Storage (required)
      let proofUrl: string | null = null;
      if (proofFile) {
      const safeName = proofFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const filePath = `${userId}/${date}/${Date.now()}-${safeName}`;
      const { error: uploadErr } = await getSupabase().storage.from(PROOF_BUCKET).upload(filePath, proofFile, {
        cacheControl: '3600', upsert: true, contentType: proofFile.type || 'image/jpeg'
      });
      if (uploadErr) { setProofError('Upload failed, please try again.'); throw uploadErr; }
      const { data: pub } = getSupabase().storage.from(PROOF_BUCKET).getPublicUrl(filePath);
        proofUrl = pub?.publicUrl || null;
      }

      // 2) Save workout entry with proof URL as approved (auto-approved)
      await getSupabase().rpc("rfl_upsert_workout", {
        p_user_id: userId,
        p_date: date,
        p_workout_type: activity,
        p_team_id: null,
        p_duration: activity === 'run' ? null : (duration === "" ? null : Number(duration)),
        p_distance: distance === "" ? null : Number(distance),
        p_steps: steps === "" ? null : Number(steps),
        p_holes: holes === "" ? null : Number(holes),
        p_proof_url: proofUrl,
        p_status: "approved",
      });
      setOpenWorkout(false);
      setValidationError("");
      setProofError("");
      setProofFile(null);
      await fetchActivity(viewWeekStart);
      // Refresh individual stats after saving
      window.location.reload();
    } finally {
      setLoading(false);
    }
  }

  async function onSaveRest() {
    if (!userId) return;
    if (!canLogToday) { alert(seasonGuardMsg); return; }
    if (todayStr() < SEASON_START_LOCAL_STR || todayStr() > SEASON_END_LOCAL_STR) { alert(seasonGuardMsg); return; }
    // Enforce: rest day can only be logged for today
    if (date !== todayStr()) { alert('You can only log a rest day for today.'); return; }
    
    const { data: hasExisting } = await getSupabase().rpc("rfl_has_entry_on_date", {
      p_user_id: userId,
      p_date: date,
    });
    if (hasExisting) {
      const ok = window.confirm("You already have a log for this day. Overwrite it?");
      if (!ok) return;
    }
    setLoading(true);
    try {
      await getSupabase().rpc('rfl_upsert_rest_day', { p_user_id: userId, p_date: date, p_team_id: null, p_status: 'approved' });
      setOpenRest(false);
      await fetchActivity(viewWeekStart);
      // Refresh individual stats after saving
      window.location.reload();
    } finally { setLoading(false); }
  }

  // League bounds (Sept 1 to Dec 1 of current year) for navigation
  const currentYear = new Date().getUTCFullYear();
  const seasonStart = firstWeekStart(currentYear);
  const seasonEnd = seasonEndStart(currentYear);
  const canGoPrev = viewWeekStart.getTime() > seasonStart.getTime();
  const canGoNext = viewWeekStart.getTime() < seasonEnd.getTime();
  const weekNumber = Math.max(
    1,
    Math.floor(
      (viewWeekStart.getTime() - seasonStart.getTime()) /
        (7 * 24 * 3600 * 1000)
    ) + 1
  );
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto space-y-8 mb-8">
        {/* Dashboard title positioned above Summary card content */}
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-rfl-navy mb-2">Welcome, {session?.user?.name?.split(' ')[0] || 'User'}!</h1>
          <p className="text-gray-600">Let's crush those fitness goals today 💪</p>
      </div>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Button disabled={!canLogToday} className="bg-rfl-navy hover:bg-rfl-navy/70 text-white h-8 flex-1 disabled:opacity-50" onClick={() => { if(!canLogToday){alert(seasonGuardMsg);return;} setDate(todayStr()); setOpenWorkout(true); }}>Add Workout</Button>
              <Button disabled={!canLogToday} variant="outline" className="h-8 flex-1 border-black text-rfl-navy hover:bg-rfl-navy/70 disabled:opacity-50" onClick={() => { if(!canLogToday){alert(seasonGuardMsg);return;} setDate(todayStr()); setOpenRest(true); }}>Add Rest Day</Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* My Summary */}
            <div className="rounded-lg border bg-white p-3 sm:p-4 mb-4">
              <div className="text-sm font-semibold text-rfl-navy mb-2">My Summary</div>
              
              {/* Row 1: Points and Avg RR */}
              <div className="grid grid-cols-2 gap-3 text-center mb-4">
              <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Points</div>
                  <div className="text-lg font-bold text-rfl-coral">{myPoints}</div>
                </div>
                <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Avg RR</div>
                  <div className="text-lg font-bold text-rfl-navy">{myAvgRR !== null ? Number(myAvgRR).toFixed(2) : '—'}</div>
              </div>
                  </div>

              {/* Row 2: Rest Days Used, Rest Days Unused, Missed Days */}
              <div className="grid grid-cols-3 gap-3 text-center mb-4">
                {/* <div className="p-3 bg-[#abbaab] rounded"> */}
                <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Rest Days Used</div>
                  <div className="text-lg font-bold text-rfl-coral">{myRestUsed}</div>
                  </div>
                  <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Rest Days Unused</div>
                  <div className="text-lg font-bold text-rfl-navy">{Math.max(0, 18 - myRestUsed)}</div>
                </div>
                <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Days Missed</div>
                  <div className="text-lg font-bold text-rfl-navy">{myMissedDays}</div>
              </div>
            </div>

              {/* Row 3: Avg RR — You vs Team */}
              <div className="rounded-lg border bg-white p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-rfl-navy">Avg RR — You vs Team</div>
                  <div className="text-xs text-gray-600">Scale: 1.00 → 2.00</div>
                </div>
                {(() => {
                  const you = typeof myAvgRR === 'number' ? myAvgRR : 1.0;
                  const team = typeof teamAvgRR === 'number' ? teamAvgRR : 1.0;
                  const min = 1.0, max = 2.0, span = max - min;
                  const pct = (v: number) => Math.max(0, Math.min(100, ((v - min) / span) * 100));
                  const youPct = pct(you);
                  const teamPct = pct(team);
                  return (
                    <div>
                      <div className="relative h-2 sm:h-3 rounded-full bg-gradient-to-r from-gray-200 via-gray-300 to-gray-400">
                        <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${youPct}% - 4px)` }}>
                          <span className="block w-2 h-2 rounded-full bg-rfl-coral border border-white"></span>
                        </span>
                        <span className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${teamPct}% - 4px)` }}>
                          <span className="block w-2 h-2 rounded-full bg-rfl-light-blue border border-white"></span>
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-700 mt-2">
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rfl-coral inline-block"></span> You: {typeof myAvgRR === 'number' ? myAvgRR.toFixed(2) : '—'}</div>
                        <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rfl-light-blue inline-block"></span> Team: {typeof teamAvgRR === 'number' ? teamAvgRR.toFixed(2) : '—'}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
            
            {/* Team Summary */}
              <div className="rounded-lg border bg-white p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-rfl-navy">Team Summary {teamName ? `— ${teamName}` : ''}</div>
                  {teamPosition ? (
                    <div className="text-xs px-2 py-0.5 rounded-full bg-rfl-coral text-white">Position #{teamPosition}</div>
                  ) : null}
                </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center ">
              <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Points</div>
                    <div className="text-lg font-bold text-rfl-coral">{teamPoints ?? '—'}</div>
                  </div>
                  <div className="p-3 rounded gradient-box text-foreground">
                    <div className="text-xs text-gray-600">Avg RR</div>
                    <div className="text-lg font-bold text-rfl-navy">{teamAvgRR !== null ? Number(teamAvgRR).toFixed(2) : '—'}</div>
                  </div>
                  <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Days Missed</div>
                  <div className="text-lg font-bold text-rfl-navy">{teamMissedWeek}</div>
                  </div>
                  <div className="p-3 rounded gradient-box text-foreground">
                  <div className="text-xs text-gray-600">Rest Days Used</div>
                  <div className="text-lg font-bold text-rfl-navy">{teamRestWeek}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              {(() => {
                const startStr = formatDateYYYYMMDD(viewWeekStart);
                const end = new Date(viewWeekStart);
                end.setUTCDate(viewWeekStart.getUTCDate() + 6);
                const endStr = formatDateYYYYMMDD(end);
                const todayUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
                const isCurrent = (new Date(startStr).getTime() <= todayUtc.getTime()) && (new Date(endStr).getTime() >= todayUtc.getTime());
                return (
                  <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-rfl-light-blue" /> Week {weekNumber}{isCurrent ? ' (Current)' : ''}</CardTitle>
                );
              })()}
              <div className="flex items-center gap-2">
                <button
                  className={`p-1 rounded border ${canGoPrev ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => canGoPrev && setViewWeekStart(prev => {
                    const prevWs = addDaysUTC(prev, -7);
                    return prevWs.getTime() < seasonStart.getTime() ? seasonStart : prevWs;
                  })}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="px-3 py-1 rounded bg-gray-100 text-sm font-medium text-gray-800">Week {weekNumber}</div>
                <button
                  className={`p-1 rounded border ${canGoNext ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={() => canGoNext && setViewWeekStart(prev => {
                    const nextWs = addDaysUTC(prev, 7);
                    return nextWs.getTime() > seasonEnd.getTime() ? seasonEnd : nextWs;
                  })}
                  aria-label="Next week"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.date} className="bg-white rounded border p-3 flex items-start justify-between">
                  <div>
                    <div className="font-medium text-rfl-navy">{formatLocalDateLabel(r.date)}</div>
                    <div className="text-sm text-gray-600">
                      {r?.type
                        ? (
                          r.type === 'rest'
                            ? (
                              <div>
                                <div>Rest Day</div>
                                {typeof r.rr_value === 'number' && <div>RR: {Number(r.rr_value).toFixed(2)}</div>}
                              </div>
                            )
                            : (() => {
                                const cfg = ACTIVITY_CONFIGS[r.workout_type || ''] as any;
                                const label = cfg?.name ? String(cfg.name).split(' / ')[0] : (r.workout_type || 'Activity');
                                const metric = r.duration ? `${r.duration} mins` : (r.distance ? `${r.distance} km` : (r.steps ? `${Number(r.steps).toLocaleString()} steps` : (r.holes ? `${r.holes} holes` : '')));
                                return (
                                  <div>
                                    <div>{label}{metric ? ` (${metric})` : ''}</div>
                                    {typeof r.rr_value === 'number' && <div>RR: {Number(r.rr_value).toFixed(2)}</div>}
                                  </div>
                                );
                              })()
                          )
                        : 'No Entry'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-rfl-navy">{r.points ?? 0} pt</div>
                    {r?.status && (
                      <div className={`text-xs inline-block mt-1 px-2 py-0.5 rounded-full ${
                        r.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                        r.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                      }`}>{r.status === 'approved' ? 'submitted' : r.status}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {openWorkout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-rfl-navy">Add Workout</h2>
              <button onClick={() => { setOpenWorkout(false); setValidationError(""); }} className="text-gray-500">✕</button>
            </div>
            {validationError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{validationError}</div>
            )}
            {proofError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">{proofError}</div>
            )}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Workout Date</label>
              <select value={date} onChange={(e)=> setDate(e.target.value)} className="w-full border rounded-md px-3 py-2 bg-white">
                {(() => {
                  const today = todayStr();
                  const y = yesterdayLocalStr();
                  const opts: Array<{value:string; label:string}> = [];
                  if (today >= SEASON_START_LOCAL_STR && today <= SEASON_END_LOCAL_STR) opts.push({ value: today, label: 'Today' });
                  if (y >= SEASON_START_LOCAL_STR && y <= SEASON_END_LOCAL_STR) opts.push({ value: y, label: 'Yesterday' });
                  return opts.map(opt => <option key={opt.value} value={opt.value}>{opt.label} ({opt.value})</option>);
                })()}
              </select>
              <label className="block text-sm font-medium text-gray-700">Workout Type</label>
              <select value={activity} onChange={(e)=>setActivity(e.target.value)} className="w-full border rounded-md px-3 py-2">
                <option value="run">Brisk Walk/Jog/Run</option>
                <option value="gym">Weightlifting / Gym Workout</option>
                <option value="yoga">Yoga/Pilates/Zumba</option>
                <option value="cycling">Cycling</option>
                <option value="swimming">Swimming</option>
                <option value="horse_riding">Horse Riding</option>
                <option value="badminton_pickleball">Badminton/Pickleball</option>
                <option value="basketball_cricket">Basketball/Cricket</option>
                <option value="steps">Steps</option>
                <option value="golf">Golf</option>
                {isSeniorEffective && <option value="meditation">Meditation/Chanting/Breathing</option>}
              </select>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-gray-700">
                <div className="font-medium text-rfl-navy mb-1">Requirement:</div>
                <div className="text-sm whitespace-nowrap overflow-hidden text-ellipsis">{activity === 'run' ? `Distance only — min ${isSeniorEffective ? '2.6' : '4'} km. Workout must be completed in one continuous stretch and reflected in the screenshot.` : currentConfig.rules.join(' ')}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {currentConfig.fields.includes('duration') && (
                  <div className={currentConfig.fields.length === 1 ? 'col-span-2' : 'flex items-end gap-2'}>
                    <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700">Duration (mins){currentConfig.minDuration ? ` — min ${currentConfig.minDuration}` : ''}</label>
                      <input value={duration ?? ''} onChange={(e)=>{
                        const val = e.target.value.trim();
                        if (val === '' || isIntString(val)) {
                          setDuration(val === '' ? '' : Number(val));
                          setValidationError("");
                        } else {
                          setValidationError("Enter numbers only (no letters)");
                        }
                      }} inputMode="numeric" pattern="\\d*" min={0} className="w-full border rounded-md px-3 py-2" />
                    </div>
                    {currentConfig.fields.length > 1 && <div className="pb-2 text-xs font-semibold text-gray-600">OR</div>}
                  </div>
                )}
                {currentConfig.fields.includes('distance') && (
                  <div className={currentConfig.fields.length === 1 ? 'col-span-2' : 'flex-1'}>
                    <label className="block text-sm font-medium text-gray-700">Distance (km){currentConfig.minDistance ? ` — min ${currentConfig.minDistance}` : ''}</label>
                    <input value={typeof distance === 'number' ? String(distance) : distance} onChange={(e)=>{
                      const raw = e.target.value;
                      const val = raw.trim();
                      if (val === '' || isDecimalString(val)) {
                        // keep as string while typing to preserve decimal point
                        setDistance(val);
                        setValidationError("");
                      } else {
                        setValidationError("Enter numbers only (no letters)");
                      }
                    }} inputMode="decimal" min={0} step="0.1" className="w-full border rounded-md px-3 py-2" />
                  </div>
                )}
              {activity === 'golf' ? (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Holes (golf){currentConfig.minHoles ? ` — min ${currentConfig.minHoles}` : ''}</label>
                  <input value={holes ?? ''} onChange={(e)=>{ setHoles(e.target.value === '' ? '' : Number(e.target.value)); setValidationError(""); }} type="number" min={0} className="w-full border rounded-md px-3 py-2" />
                </div>
              ) : (
                  <>
                {currentConfig.fields.includes('steps') && (
                  <div className={currentConfig.fields.length === 1 ? 'col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700">Steps{currentConfig.minSteps ? ` — min ${currentConfig.minSteps.toLocaleString()}` : ''}</label>
                        <input value={steps ?? ''} onChange={(e)=>{
                          const val = e.target.value.trim();
                          if (val === '' || isIntString(val)) {
                            setSteps(val === '' ? '' : Number(val));
                            setValidationError("");
                          } else {
                            setValidationError("Enter numbers only (no letters)");
                          }
                        }} inputMode="numeric" pattern="\\d*" min={0} className="w-full border rounded-md px-3 py-2" />
                  </div>
                )}
                {currentConfig.fields.includes('holes') && (
                  <div className={currentConfig.fields.length === 1 ? 'col-span-2' : ''}>
                    <label className="block text-sm font-medium text-gray-700">Holes (golf){currentConfig.minHoles ? ` — min ${currentConfig.minHoles}` : ''}</label>
                  <input value={holes ?? ''} onChange={(e)=>{
                    const val = e.target.value.trim();
                    if (val === '' || isIntString(val)) {
                      setHoles(val === '' ? '' : Number(val));
                      setValidationError("");
                    } else {
                      setValidationError("Enter numbers only (no letters)");
                    }
                  }} inputMode="numeric" pattern="\\d*" min={0} className="w-full border rounded-md px-3 py-2" />
                  </div>
                    )}
                  </>
                )}
              </div>

              {/* Proof upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{activity === 'steps' ? 'Upload Proof - Pic or Screenshot showing 1) Date 2) Steps' : (activity === 'run' ? 'Upload Proof - Pic or Screenshot showing 1) Date 2) Activity 3) Distance' : 'Upload Proof - Pic or Screenshot showing 1) Date 2) Activity 3) Duration')}</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e)=>{ setProofFile(e.target.files && e.target.files[0] ? e.target.files[0] : null); setProofError(""); }}
                  className="w-full border rounded-md px-3 py-2"
                />
                <div className="text-xs text-gray-500 mt-1">Required. Screenshots/photos only.</div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setOpenWorkout(false); setValidationError(""); }}>Back</Button>
              <Button disabled={loading} className="bg-rfl-navy" onClick={onSaveWorkout}>{loading ? 'Submitting…' : 'Submit'}</Button>
            </div>
          </div>
        </div>
      )}

      {openRest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-rfl-navy">Add Rest Day</h2>
              <button onClick={() => setOpenRest(false)} className="text-gray-500">✕</button>
            </div>
            <div className="space-y-3">
              <div className="text-sm text-rfl-navy font-semibold">You are taking a rest day. You have {Math.max(0, 18 - myRestUsed)} / 18 rest days left.</div>
              <div className="text-sm text-gray-700">Rest days remaining: <span className="font-semibold">{Math.max(0, 18 - myRestUsed)}</span> / 18</div>
              <label className="block text-sm font-medium text-gray-700">Workout Date</label>
              <select value={date} onChange={(e)=> setDate(e.target.value)} className="w-full border rounded-md px-3 py-2 bg-white">
                {(() => {
                  const today = todayStr();
                  const y = yesterdayLocalStr();
                  const opts: Array<{value:string; label:string}> = [];
                  if (today >= SEASON_START_LOCAL_STR && today <= SEASON_END_LOCAL_STR) opts.push({ value: today, label: 'Today' });
                  if (y >= SEASON_START_LOCAL_STR && y <= SEASON_END_LOCAL_STR) opts.push({ value: y, label: 'Yesterday' });
                  return opts.map(opt => <option key={opt.value} value={opt.value}>{opt.label} ({opt.value})</option>);
                })()}
              </select>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setOpenRest(false)}>Back</Button>
              <Button disabled={loading} className="bg-rfl-navy" onClick={onSaveRest}>{loading ? 'Submitting…' : 'Submit'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
