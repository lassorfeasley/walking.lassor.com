import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'
import {
  getTokenInfo,
  refreshAccessToken,
  importTokenFromEnv,
  validateToken,
} from '@/lib/instagram/token'

/**
 * POST /api/admin/instagram-token/refresh
 * 
 * Refresh the Instagram access token. If no token exists in the database,
 * optionally import from environment variable first.
 * 
 * Body:
 * - importFromEnv?: boolean - If true, import token from env var before refreshing
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const { importFromEnv: shouldImport } = body as { importFromEnv?: boolean }

    // Get current token info
    let tokenInfo = await getTokenInfo()

    // If no database token and import requested, import from env
    if (shouldImport && (!tokenInfo || tokenInfo.source === 'environment')) {
      const importResult = await importTokenFromEnv()
      if (!importResult.success) {
        return NextResponse.json(
          { error: importResult.error || 'Failed to import token from environment' },
          { status: 400 }
        )
      }
      // Re-fetch token info after import
      tokenInfo = await getTokenInfo()
    }

    if (!tokenInfo) {
      return NextResponse.json(
        { error: 'No Instagram token available. Set INSTAGRAM_ACCESS_TOKEN or import a token first.' },
        { status: 400 }
      )
    }

    // Validate current token before attempting refresh
    const isValid = await validateToken(tokenInfo.accessToken)
    if (!isValid) {
      return NextResponse.json(
        { 
          error: 'Current token is invalid or expired. Please obtain a new token from Facebook Graph API Explorer.',
          tokenSource: tokenInfo.source,
        },
        { status: 400 }
      )
    }

    // Refresh the token
    const refreshResult = await refreshAccessToken(tokenInfo.accessToken)

    if (!refreshResult.success) {
      return NextResponse.json(
        { error: refreshResult.error || 'Failed to refresh token' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      expiresAt: refreshResult.expiresAt?.toISOString(),
      message: 'Token refreshed successfully',
    })
  } catch (error) {
    console.error('Instagram token refresh failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/instagram-token/refresh
 * 
 * Get current token status without refreshing.
 */
export async function GET() {
  try {
    const tokenInfo = await getTokenInfo()

    if (!tokenInfo) {
      return NextResponse.json({
        hasToken: false,
        source: null,
        expiresAt: null,
        daysUntilExpiration: null,
        isExpiringSoon: false,
        isValid: false,
      })
    }

    // Validate the token
    const isValid = await validateToken(tokenInfo.accessToken)

    return NextResponse.json({
      hasToken: true,
      source: tokenInfo.source,
      expiresAt: tokenInfo.expiresAt?.toISOString() || null,
      daysUntilExpiration: tokenInfo.daysUntilExpiration,
      isExpiringSoon: tokenInfo.isExpiringSoon,
      isValid,
    })
  } catch (error) {
    console.error('Instagram token status check failed', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
