import { NextRequest, NextResponse } from 'next/server'

import { validateAccessToken } from '@/lib/instagram/api'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as { token?: string }
    if (!body?.token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    const isValid = await validateAccessToken(body.token)
    if (!isValid) {
      return NextResponse.json(
        { success: false, error: 'Token validation failed' },
        { status: 400 }
      )
    }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?fields=id,name,email&access_token=${encodeURIComponent(
        body.token
      )}`
    )
    const data = await response.json()

    if (!response.ok || data?.error) {
      return NextResponse.json(
        { success: false, error: data?.error?.message ?? 'Graph API error' },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      profile: {
        id: data.id,
        name: data.name,
        email: data.email ?? null,
      },
    })
  } catch (error) {
    console.error('Instagram token verify failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

