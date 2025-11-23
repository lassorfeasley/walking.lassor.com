import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('instagram_credentials')
      .select('*')
      .order('last_refreshed_at', { ascending: false })

    if (error) {
      console.error('Failed to load instagram credentials', error)
      return NextResponse.json(
        { error: 'Failed to load Instagram token status' },
        { status: 500 }
      )
    }

    return NextResponse.json({ credentials: data ?? [] })
  } catch (error) {
    console.error('Instagram token status GET failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      refresherNote?: string
      refreshedAt?: string
    }

    const payload = {
      last_refreshed_at: body.refreshedAt ?? new Date().toISOString(),
      refresher_note: body.refresherNote ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('instagram_credentials')
      .insert(payload)
      .select('*')
      .single()

    if (error) {
      console.error('Failed to upsert instagram credentials', error)
      return NextResponse.json(
        { error: 'Failed to save Instagram token metadata' },
        { status: 500 }
      )
    }

    return NextResponse.json({ credential: data })
  } catch (error) {
    console.error('Instagram token status POST failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

