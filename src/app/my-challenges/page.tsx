'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'

type Team = { id: string; name: string }
type Challenge = {
  id: string
  name: string
  description: string
  start_date: string
  end_date: string
  scores: Record<string, number | null>
}

export default function MyChallengesPage() {
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [challengeHasScore, setChallengeHasScore] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data: tms } = await getSupabase().from('teams').select('id,name').order('name', { ascending: true })
        const teamList = (tms || []) as Team[]
        setTeams(teamList)

        const emptyScores = (list: Team[]) => {
          const s: Record<string, number | null> = {}
          for (const t of list) s[String(t.id)] = null
          return s
        }

        const { data: chRows } = await getSupabase()
          .from('special_challenges')
          .select('id,name,description,start_date,end_date')
          .order('created_at', { ascending: false })
        const { data: scRows } = await getSupabase()
          .from('special_challenge_team_scores')
          .select('challenge_id,team_id,score')

        const byId = new Map<string, Challenge>();
        (chRows || []).forEach((r: any) => {
          byId.set(String(r.id), {
            id: String(r.id),
            name: String(r.name),
            description: r.description || '',
            start_date: r.start_date || '',
            end_date: r.end_date || '',
            scores: emptyScores(teamList),
          })
        })
        ;(scRows || []).forEach((r: any) => {
          const id = String(r.challenge_id)
          const tid = String(r.team_id)
          if (!byId.has(id)) return
          const ch = byId.get(id)!
          ch.scores[tid] = r.score === null || r.score === undefined ? null : Number(r.score)
        })
        setChallenges(Array.from(byId.values()))
        // Map of which challenges have at least one non-null score
        const hasScoreMap: Record<string, boolean> = {}
        ;(scRows || []).forEach((r: any) => {
          const cid = String(r.challenge_id)
          const val = r.score === null || r.score === undefined ? null : Number(r.score)
          if (val !== null && Number.isFinite(val)) hasScoreMap[cid] = true
        })
        setChallengeHasScore(hasScoreMap)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Format 'YYYY-MM-DD' → 'DD/MM/YYYY'
  function formatDMY(s: string | null | undefined): string {
    if (!s) return '—'
    const parts = String(s).split('-')
    if (parts.length !== 3) return String(s)
    const [y, m, d] = parts
    if (!y || !m || !d) return String(s)
    return `${d}/${m}/${y}`
  }
  // Today as local YMD
  function todayLocalYMD(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  // Active if today within [start, end]
  function isChallengeActive(start?: string | null, end?: string | null): boolean {
    if (!start || !end) return false
    const t = todayLocalYMD()
    return t >= String(start) && t <= String(end)
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        <p className="text-sm text-gray-600">Loading challenges…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
      <h1 className="text-xl font-semibold text-rfl-navy">My Challenges</h1>
      <div className="bg-white rounded-lg shadow p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-2 pr-1 w-64">Challenge</th>
                <th className="py-2 pr-3 w-40">Date Range</th>
                <th className="py-2 pr-2 w-80">Description</th>
              </tr>
            </thead>
            <tbody>
              {challenges.map((ch) => {
                const active = isChallengeActive(ch.start_date, ch.end_date)
                return (
                  <tr
                    key={ch.id}
                    className={`border-t align-top ${active ? 'bg-yellow-50 ring-1 ring-rfl-coral/40' : ''}`}
                  >
                    <td className="py-2 pr-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-rfl-navy">{ch.name}</span>
                        {active && (
                          <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-rfl-coral text-white">
                            Active
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-gray-700">
                        {formatDMY(ch.start_date)} → {formatDMY(ch.end_date)}
                      </span>
                    </td>
                    <td className="py-2 pr-2">
                      <div className="text-md text-gray-800 whitespace-pre-wrap">
                        {ch.description || '—'}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!challenges.length && (
                <tr>
                  <td colSpan={3} className="py-8 text-center text-gray-500">
                    No challenges yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

