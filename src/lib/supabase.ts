import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (cachedClient) return cachedClient
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars are not set')
  }
  cachedClient = createClient(supabaseUrl, supabaseAnonKey)
  return cachedClient
}

// Database types (will be generated from Supabase later)
export interface User {
  id: string
  name: string
  email: string
  role: 'player' | 'leader'
  team_id: string
  rest_days_used: number
  created_at: string
}

export interface Team {
  id: string
  name: string
  color: string
  leader_id: string
  total_points: number
  created_at: string
}

export interface WorkoutEntry {
  id: string
  user_id: string
  team_id: string
  date: string
  type: 'workout' | 'rest'
  workout_type?: 'walk' | 'gym' | 'yoga' | 'cycling' | 'swimming' | 'badminton_pickleball' | 'basketball_cricket' | 'steps' | 'golf' | 'meditation'
  duration?: number // in minutes
  distance?: number // in km
  steps?: number
  holes?: number // for golf
  rr_value: number
  proof_url?: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// Helper functions
export const calculateRR = (entry: Partial<WorkoutEntry> & { age?: number }): number => {
  if (entry.type === 'rest') return 1.0

  const isSenior = typeof entry.age === 'number' && entry.age >= 65
  const baseDuration = isSenior ? 30 : 45
  const baseSteps = isSenior ? 5000 : 10000

  if (entry.workout_type === 'steps' && entry.steps) {
    return entry.steps >= baseSteps ? Math.min(entry.steps / baseSteps, 2.5) : 0
  }
  if (entry.workout_type === 'golf' && entry.holes) {
    return entry.holes >= 9 ? Math.min(entry.holes / 9, 2.5) : 0
  }
  if (entry.duration) {
    return entry.duration >= baseDuration ? Math.min(entry.duration / baseDuration, 2.5) : 0
  }
  return 1.0
}
