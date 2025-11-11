'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dumbbell, Trophy, Users, BookOpen, User, Menu, X, Key, Eye, EyeOff, LogOut, Flag } from 'lucide-react'
import { signOut, useSession } from 'next-auth/react'
import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

const navItems = [
  { href: '/dashboard', label: 'My Progress', icon: Dumbbell },
  { href: '/team', label: 'My Team', icon: Users },
  { href: '/leaderboards', label: 'Leaderboard', icon: Trophy },
  { href: '/my-challenges', label: 'My Challenges', icon: Flag },
  { href: '/rules', label: 'Rules', icon: BookOpen },
]

function PasswordUpdateModal({ onClose, userId }: { onClose: () => void; userId?: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      // Validation
      if (!currentPassword || !newPassword || !confirmPassword) {
        setError('All fields are required')
        return
      }

      if (newPassword !== confirmPassword) {
        setError('New passwords do not match')
        return
      }

      if (currentPassword === newPassword) {
        setError('New password must be different from current password')
        return
      }


      // Call API route to update password
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to update password')
        return
      }

      setSuccess(true)
      setTimeout(() => {
        onClose()
      }, 2000)

    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Password Updated!</h3>
            <p className="text-gray-600">Your password has been successfully updated.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Update Password</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-rfl-coral bg-white text-gray-900 placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <div className="relative">
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-rfl-coral bg-white text-gray-900 placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-rfl-coral bg-white text-gray-900 placeholder-gray-400"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex space-x-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-rfl-coral hover:bg-rfl-coral/90"
              disabled={loading}
            >
              {loading ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const name = session?.user?.name ?? null
  const role = (session?.user as any)?.role as 'player' | 'leader' | 'governor' | undefined
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [teamName, setTeamName] = useState<string | null>(null)

  // Fetch team name for logo (two-step fetch for reliability)
  useEffect(() => {
    const fetchTeamName = async () => {
      if (!session?.user?.id) return

      try {
        // Step 1: get the user's team_id
        const { data: account } = await getSupabase()
          .from('accounts')
          .select('team_id')
          .eq('id', session.user.id)
          .maybeSingle()

        const teamId: string | null = (account as any)?.team_id ?? null
        if (!teamId) {
          console.log('No team_id for user', session.user.id)
          return
        }

        // Step 2: lookup team name by id
        const { data: team } = await getSupabase()
          .from('teams')
          .select('name')
          .eq('id', teamId)
          .maybeSingle()

        const teamNameFetched: string | null = (team as any)?.name ?? null
        if (teamNameFetched) {
          setTeamName(teamNameFetched)
        } else {
          console.log('Team record not found for id', teamId)
        }
      } catch (error) {
        console.error('Error fetching team name:', error)
      }
    }

    fetchTeamName()
  }, [session?.user?.id])

  // Convert team name to logo filename format
  const getTeamLogoPath = (teamName: string | null) => {
    if (!teamName) return '/img/placeholder-team.svg'

    // Normalize team names to expected file names
    const normalized = teamName
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')

    // Some logos have a fixed prefix like 'Pristine_' while others are single words
    // Try multiple candidates in order
    const candidates = [
      `/img/${normalized}_Logo.jpeg`,
      `/img/Pristine_${normalized}_Logo.jpeg`,
    ]

    // We can't synchronously check file existence on client; return first candidate.
    // The <img> has onError fallback to placeholder.
    return candidates[0]
  }

  // Minimal header for governors only
  if (role === 'governor') {
    return (
      <nav className="bg-rfl-navy text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white">
                <img src="/img/PFL_Logo.jpeg" alt="PFL Logo" className="w-full h-full object-cover" />
              </div>
              <div className="text-sm sm:text-base">Welcome, {name ?? 'Governor'}</div>
            </div>
            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-2">
              {name ? (
                <>
                  <Button onClick={() => setShowPasswordModal(true)} variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy">
                    <Key className="w-4 h-4 mr-1" />
                    Update Password
                  </Button>
                  <Button onClick={() => signOut({ callbackUrl: '/' })} variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy flex items-center">
                    <LogOut className="w-4 h-4 mr-1" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <Link href="/signin">
                  <Button variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy">Sign In</Button>
                </Link>
              )}
            </div>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded hover:bg-rfl-light-blue/30"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute right-0 top-0 h-full w-64 bg-rfl-navy text-white shadow-xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded overflow-hidden bg-white">
                    <img src="/img/PFL_Logo.jpeg" alt="PFL Logo" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-sm">Welcome, {name ?? 'Governor'}</span>
                </div>
                <button className="p-2 rounded hover:bg-rfl-light-blue/30" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 py-3 space-y-2">
                {name ? (
                  <>
                    <button
                      className="w-full text-left px-3 py-2 rounded-md bg-white text-rfl-navy font-medium flex items-center gap-2"
                      onClick={() => { setMobileOpen(false); setShowPasswordModal(true); }}
                    >
                      <Key className="w-4 h-4" />
                      Update Password
                    </button>
                    <button
                      className="w-full text-left px-3 py-2 rounded-md bg-white text-rfl-navy font-medium flex items-center gap-2"
                      onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }); }}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link href="/signin" className="block px-3 py-2 rounded-md bg-white text-rfl-navy font-medium" onClick={() => setMobileOpen(false)}>
                    Sign In
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
        {showPasswordModal && (
          <PasswordUpdateModal onClose={() => setShowPasswordModal(false)} userId={session?.user?.id} />
        )}
      </nav>
    )
  }

  return (
    <nav className="bg-rfl-navy text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* RFL Logo/Brand */}
          <div className="flex items-center space-x-4 shrink-0">
            <Link href="/dashboard" className="flex items-center space-x-2 shrink-0">
              <div className="w-10 h-10 rounded-lg overflow-hidden bg-white">
                <img src="/img/PFL_Logo.jpeg" alt="PFL Logo" className="w-full h-full object-cover" />
              </div>
              <div className="whitespace-nowrap leading-tight">
                <h1 className="text-lg font-bold whitespace-nowrap">PFL</h1>
                <p className="text-xs text-gray-300 whitespace-nowrap">Pristine Fitness League</p>
              </div>
            </Link>
          </div>

          {/* Navigation Links (desktop) */}
          <div className="hidden md:flex items-center justify-center flex-1 space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = item.href === '/dashboard'
                ? (pathname === '/dashboard' || pathname === '/')
                : pathname.startsWith(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-rfl-coral text-white'
                      : 'text-gray-300 hover:text-white hover:bg-rfl-light-blue'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>

          {/* User Menu + Mobile toggle */}
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {name ? (
                <div className="w-6 h-6 rounded border border-white/20 overflow-hidden bg-white">
                  <img 
                    src={getTeamLogoPath(teamName)} 
                    alt={`${teamName || 'Team'} logo`} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = '/img/placeholder-team.svg';
                    }}
                  />
                </div>
              ) : (
                <User className="w-5 h-5" />
              )}
              <span className="text-sm">{name ?? 'Guest'}</span>
            </div>
            {/* Desktop-only auth actions */}
            <div className="hidden md:flex items-center space-x-2">
              {name ? (
                <>
                  <Button onClick={() => signOut({ callbackUrl: '/' })} variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy flex items-center">
                    <LogOut className="w-4 h-4 mr-1" />
                    Sign Out
                  </Button>
                  <Button onClick={() => setShowPasswordModal(true)} variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy">
                    <Key className="w-4 h-4 mr-1" />
                    Update Password
                  </Button>
                </>
              ) : (
                <Link href="/signin">
                  <Button variant="outline" size="sm" className="text-rfl-navy border-white hover:bg-white hover:text-rfl-navy">
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
            {/* Hamburger toggle (mobile only) */}
            <button
              className="md:hidden p-2 rounded hover:bg-rfl-light-blue/30"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile overlay drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-64 bg-rfl-navy text-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                {name ? (
                  <div className="w-6 h-6 rounded border border-white/20 overflow-hidden bg-white">
                    <img 
                      src={getTeamLogoPath(teamName)} 
                      alt={`${teamName || 'Team'} logo`} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/img/placeholder-team.svg';
                      }}
                    />
                  </div>
                ) : (
                  <User className="w-5 h-5" />
                )}
                <span className="text-sm">{name ?? 'Guest'}</span>
              </div>
              <button className="p-2 rounded hover:bg-rfl-light-blue/30" aria-label="Close menu" onClick={() => setMobileOpen(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-2 pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
                const Icon = item.icon
              const isActive = item.href === '/dashboard'
                ? (pathname === '/dashboard' || pathname === '/')
                : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium transition-colors ${
                      isActive
                        ? 'bg-rfl-coral text-white'
                        : 'text-gray-300 hover:text-white hover:bg-rfl-light-blue'
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
            <div className="mt-auto px-4 py-3 border-t border-white/10 space-y-2">
              {name ? (
                <>
                  <button
                    className="w-full text-left px-3 py-2 rounded-md bg-white text-rfl-navy font-medium flex items-center gap-2"
                    onClick={() => { setMobileOpen(false); signOut({ callbackUrl: '/' }) }}
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 rounded-md bg-white text-rfl-navy font-medium flex items-center gap-2"
                    onClick={() => { setMobileOpen(false); setShowPasswordModal(true) }}
                  >
                    <Key className="w-4 h-4" />
                    Update Password
                  </button>
                </>
              ) : (
                <Link href="/signin" className="block px-3 py-2 rounded-md bg-white text-rfl-navy font-medium" onClick={() => setMobileOpen(false)}>
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Password Update Modal */}
      {showPasswordModal && (
        <PasswordUpdateModal 
          onClose={() => setShowPasswordModal(false)}
          userId={session?.user?.id}
        />
      )}
    </nav>
  )
}