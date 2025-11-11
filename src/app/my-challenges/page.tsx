'use client'

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
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
  const [descOpenId, setDescOpenId] = useState<string | null>(null)

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
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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
                <th className="py-2 pr-2 w-64">Challenge</th>
                <th className="py-2 pr-2 w-40">Date Range</th>
                {teams.map((t) => (
                  <th key={String(t.id)} className="py-2 px-2 text-right whitespace-nowrap">
                    {t.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {challenges.map((ch) => (
                <tr key={ch.id} className="border-t align-top">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-rfl-navy">{ch.name}</span>
                      {ch.description ? (
                        <button
                          className="p-1 rounded hover:bg-gray-100"
                          title="Show description"
                          onClick={()=> setDescOpenId(v => v === ch.id ? null : ch.id)}
                        >
                          <Info className="w-4 h-4 text-gray-600" />
                        </button>
                      ) : null}
                    </div>
                    {descOpenId === ch.id && ch.description ? (
                      <div className="mt-2 text-xs text-gray-600 whitespace-pre-wrap">{ch.description}</div>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2 whitespace-nowrap">
                    <span className="text-gray-700">
                      {(ch.start_date || '—')} → {(ch.end_date || '—')}
                    </span>
                  </td>
                  {teams.map((t) => (
                    <td key={`${ch.id}-${String(t.id)}`} className="py-2 px-2 text-right">
                      <span className="[font-variant-numeric:tabular-nums]">
                        {ch.scores[String(t.id)] ?? ''}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
              {!challenges.length && (
                <tr>
                  <td colSpan={2 + teams.length} className="py-8 text-center text-gray-500">
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

