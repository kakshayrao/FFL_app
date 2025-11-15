'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

type Challenge = {
  id: string
  name: string
  description: string
  start_date: string
  end_date: string
  rules_pdf_url?: string | null
}

function PDFModal({ pdfUrl, onClose }: { pdfUrl: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div className="flex items-center justify-center min-h-screen p-6">
        <div
          className="relative w-full max-w-7xl max-h-[95vh] bg-white rounded-lg shadow-lg overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Rules PDF</h2>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-md text-gray-500 hover:text-gray-700"
              aria-label="Close"
            >
              <svg className="h-6 w-6" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M15.5 4.5L4.5 15.5M4.5 4.5l11 11"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
            <embed src={pdfUrl} type="application/pdf" className="w-full h-full min-h-[72vh]" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ChallengeDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const challengeId = useMemo(() => {
    const val = params?.id
    return Array.isArray(val) ? val[0] : val
  }, [params])

  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showPdfModal, setShowPdfModal] = useState(false)

  useEffect(() => {
    if (!challengeId) return
    let isMounted = true

    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const { data, error: fetchError } = await getSupabase()
          .from('special_challenges')
          .select('id,name,description,start_date,end_date,rules_pdf_url')
          .eq('id', challengeId)
          .maybeSingle()

        if (fetchError) throw fetchError
        if (!isMounted) return

        if (!data) {
          setError('Challenge not found.')
          setChallenge(null)
          return
        }

        setChallenge({
          id: String(data.id),
          name: String(data.name ?? 'Untitled Challenge'),
          description: data.description ?? '',
          start_date: data.start_date ?? '',
          end_date: data.end_date ?? '',
          rules_pdf_url: data.rules_pdf_url ?? null,
        })
      } catch (err: any) {
        if (!isMounted) return
        setError(err?.message ?? 'Unable to load this challenge.')
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    load()

    return () => {
      isMounted = false
    }
  }, [challengeId])

  useEffect(() => {
    if (!challengeId && !loading) {
      router.replace('/my-challenges')
    }
  }, [challengeId, loading, router])

  function formatDMY(s: string | null | undefined): string {
    if (!s) return '—'
    const parts = String(s).split('-')
    if (parts.length !== 3) return String(s)
    const [y, m, d] = parts
    if (!y || !m || !d) return String(s)
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const monthIndex = parseInt(m) - 1
    if (monthIndex < 0 || monthIndex > 11) return String(s)
    const monthName = monthNames[monthIndex]
    return `${d} ${monthName}`
  }

  function isChallengeActive(start?: string | null, end?: string | null): boolean {
    if (!start || !end) return false
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    return today >= String(start) && today <= String(end)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">My Challenges</p>
          <h1 className="text-2xl font-semibold text-rfl-navy">Challenge Details</h1>
        </div>
        <Link
          href="/my-challenges"
          className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:text-gray-900"
        >
          <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 5.5L8 10l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to list
        </Link>
      </div>

      {loading && (
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500 shadow-sm">
          Loading challenge…
        </div>
      )}

      {!loading && error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-6 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {!loading && !error && challenge && (
        <div className="space-y-5">
          <section className="rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-rfl-navy">Challenge Name</p>
                <p className="mt-1 text-sm tracking-wide text-gray-500">{challenge.name}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isChallengeActive(challenge.start_date, challenge.end_date) ? (
                  <span className="inline-flex items-center rounded-full border border-green-200 bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                    Not Active
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Start Date</p>
                <p className="mt-1 text-sm text-gray-800">{formatDMY(challenge.start_date)}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">End Date</p>
                <p className="mt-1 text-sm text-gray-800">{formatDMY(challenge.end_date)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rules & Description</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">
              {challenge.description?.trim().length ? challenge.description : 'No rules provided for this challenge yet.'}
            </p>
            {challenge.rules_pdf_url && (
              <button
                onClick={() => setShowPdfModal(true)}
                className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 underline underline-offset-2 hover:text-indigo-700"
              >
                View rules PDF
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path
                    d="M6 7.5V6a2 2 0 0 1 2-2h6m0 0-4.5 4.5M14 4l-4.5 4.5M4 9v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </section>
        </div>
      )}

      {showPdfModal && challenge?.rules_pdf_url && (
        <PDFModal pdfUrl={challenge.rules_pdf_url} onClose={() => setShowPdfModal(false)} />
      )}
    </div>
  )
}