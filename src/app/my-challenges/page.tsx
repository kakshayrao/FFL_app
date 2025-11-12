'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
        const challengeList = Array.from(byId.values())
        setChallenges(challengeList)
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

  // Format 'YYYY-MM-DD' → 'DD-MM-YYYY'
  function formatDMY(s: string | null | undefined): string {
    if (!s) return '—'
    const parts = String(s).split('-')
    if (parts.length !== 3) return String(s)
    const [y, m, d] = parts
    if (!y || !m || !d) return String(s)
    return `${d}-${m}-${y}`
  }

  const sortedChallenges = useMemo(() => challenges, [challenges])
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
      <div className="space-y-3">
        {sortedChallenges.map((ch, idx) => {
          const active = isChallengeActive(ch.start_date, ch.end_date)
          return (
            <Link
              key={ch.id}
              href={`/my-challenges/${ch.id}`}
              className={`flex items-center gap-4 rounded-lg border bg-white px-5 py-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-rfl-navy ${
                active ? 'border-green-200 ring-offset-2' : ''
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rfl-navy text-sm font-semibold text-white">
                {idx + 1}
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-rfl-navy">{ch.name}</p>
                  {active && (
                    <span className="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-green-700">
                      Active
                    </span>
                  )}
                  {challengeHasScore[ch.id] && (
                    <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                      Scores Posted
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {formatDMY(ch.start_date)} to {formatDMY(ch.end_date)}
                </div>
              </div>
              <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M7 5l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          )
        })}
        {!sortedChallenges.length && (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">
            No challenges yet.
          </div>
        )}
      </div>
    </div>
  )
}

