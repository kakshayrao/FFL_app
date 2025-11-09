import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { auth } from "@/auth";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { date, type, workout_type, duration, distance, steps, holes, team_id } = body;

  // Lookup age for senior thresholds
  const { data: acct } = await getSupabase()
    .from('accounts')
    .select('age')
    .eq('id', session.user.id)
    .maybeSingle();
  const userAge = (acct?.age ?? null) as number | null;
  const isSenior = typeof userAge === 'number' && userAge >= 65;
  const baseDuration = isSenior ? 30 : 45; // minutes
  const baseSteps = isSenior ? 5000 : 10000; // steps

  // check existing entry
  const { data: existing } = await getSupabase()
    .from("entries")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("date", date)
    .maybeSingle();

  type EntryPayload = {
    user_id: string;
    team_id?: string;
    date: string;
    type: 'workout' | 'rest';
    workout_type?: string;
    duration?: number;
    distance?: number;
    steps?: number;
    holes?: number;
    rr_value?: number;
  };

  const payload: EntryPayload = {
    user_id: session.user.id,
    team_id,
    date,
    type,
    workout_type,
    duration,
    distance,
    steps,
    holes,
  };

  // RR calculation with senior thresholds
  if (type === 'rest') payload.rr_value = 1.0;
  else if (workout_type === 'steps' && steps) payload.rr_value = Math.min(steps / baseSteps, 2.5);
  else if (workout_type === 'golf' && holes) payload.rr_value = Math.min(holes / 9, 2.5);
  else if (workout_type === 'run') {
    const rrDur = typeof duration === 'number' ? duration / baseDuration : 0;
    const rrDist = typeof distance === 'number' ? distance / 4 : 0; // distance unchanged
    const rr = Math.max(rrDur, rrDist);
    payload.rr_value = Math.min(rr, 2.5);
  } else if (workout_type === 'cycling') {
    const rrDur = typeof duration === 'number' ? duration / baseDuration : 0;
    const rrDist = typeof distance === 'number' ? distance / 10 : 0;
    const rr = Math.max(rrDur, rrDist);
    payload.rr_value = Math.min(rr, 2.5);
  } else if (typeof duration === 'number') {
    // gym, yoga, swimming, badminton_pickleball, basketball_cricket, meditation
    payload.rr_value = Math.min(duration / baseDuration, 2.5);
  } else payload.rr_value = 1.0;

  if (existing) {
    const { error } = await getSupabase().from("entries").update(payload).eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, updated: true });
  }

  const { error } = await getSupabase().from("entries").insert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, created: true });
}


