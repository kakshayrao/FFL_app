import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { auth, authOptions } from '@/auth'
import { getSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const session = (await (async () => {
      try {
        return await auth()
      } catch {
        return null
      }
    })()) || (await getServerSession(authOptions as any))
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { currentPassword, newPassword } = await req.json()

    // Validation
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'New password must be different from current password' }, { status: 400 })
    }


    // Verify current password
    const { data: account, error: fetchError } = await getSupabase()
      .from('accounts')
      .select('password')
      .eq('id', session.user.id)
      .single()

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 })
    }

    if (String(account.password) !== String(currentPassword)) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Update password
    const { error: updateError } = await getSupabase()
      .from('accounts')
      .update({ password: newPassword })
      .eq('id', session.user.id)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update password. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    // Provide clearer error messaging for auth/session issues
    if (String(error?.message || '').toLowerCase().includes('auth') || String(error).includes('auth() is not a function')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Password update error:', error)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }
}
