/**
 * Instagram Token Management
 * 
 * Handles retrieving, refreshing, and storing Instagram access tokens.
 * Tokens are stored in Supabase and automatically refreshed when expiring.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const INSTAGRAM_GRAPH_URL = 'https://graph.instagram.com'
const REFRESH_THRESHOLD_DAYS = 7 // Refresh when token expires within this many days
const TOKEN_LIFETIME_SECONDS = 5184000 // 60 days in seconds

export interface TokenInfo {
  accessToken: string
  expiresAt: Date | null
  source: 'database' | 'environment'
  isExpiringSoon: boolean
  daysUntilExpiration: number | null
}

export interface RefreshResult {
  success: boolean
  accessToken?: string
  expiresAt?: Date
  error?: string
}

/**
 * Get the current Instagram access token.
 * Checks the database first, falls back to environment variable.
 * Automatically refreshes if the token is expiring soon.
 */
export async function getAccessToken(): Promise<string | null> {
  const tokenInfo = await getTokenInfo()
  
  if (!tokenInfo) {
    return null
  }
  
  // Auto-refresh if expiring soon and we have a database token
  if (tokenInfo.isExpiringSoon && tokenInfo.source === 'database') {
    console.log('Instagram token expiring soon, attempting auto-refresh...')
    const refreshResult = await refreshAccessToken(tokenInfo.accessToken)
    if (refreshResult.success && refreshResult.accessToken) {
      return refreshResult.accessToken
    }
    // If refresh fails, still return the current token (it's not expired yet)
    console.warn('Auto-refresh failed, using existing token:', refreshResult.error)
  }
  
  return tokenInfo.accessToken
}

/**
 * Get detailed information about the current token.
 */
export async function getTokenInfo(): Promise<TokenInfo | null> {
  const supabase = createAdminClient()
  
  // Try database first
  if (supabase) {
    const { data, error } = await supabase
      .from('instagram_credentials')
      .select('access_token, expires_at')
      .not('access_token', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (!error && data?.access_token) {
      const expiresAt = data.expires_at ? new Date(data.expires_at) : null
      const now = new Date()
      const daysUntilExpiration = expiresAt 
        ? Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null
      const isExpiringSoon = daysUntilExpiration !== null && daysUntilExpiration <= REFRESH_THRESHOLD_DAYS
      
      return {
        accessToken: data.access_token,
        expiresAt,
        source: 'database',
        isExpiringSoon,
        daysUntilExpiration,
      }
    }
  }
  
  // Fall back to environment variable
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN
  if (envToken) {
    return {
      accessToken: envToken,
      expiresAt: null,
      source: 'environment',
      isExpiringSoon: false, // Can't determine for env var
      daysUntilExpiration: null,
    }
  }
  
  return null
}

/**
 * Refresh an Instagram access token.
 * Calls the Instagram Graph API to exchange the current token for a new one.
 */
export async function refreshAccessToken(currentToken: string): Promise<RefreshResult> {
  try {
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: currentToken,
    })
    
    const response = await fetch(
      `${INSTAGRAM_GRAPH_URL}/refresh_access_token?${params.toString()}`,
      { next: { revalidate: 0 } }
    )
    
    const data = await response.json()
    
    if (!response.ok || data.error) {
      return {
        success: false,
        error: data.error?.message || `Instagram API error: ${response.status}`,
      }
    }
    
    if (!data.access_token) {
      return {
        success: false,
        error: 'No access token in response',
      }
    }
    
    const expiresIn = data.expires_in || TOKEN_LIFETIME_SECONDS
    const expiresAt = new Date(Date.now() + expiresIn * 1000)
    
    // Save the new token to the database
    const saveResult = await saveAccessToken(data.access_token, expiresAt)
    if (!saveResult.success) {
      console.warn('Token refreshed but failed to save:', saveResult.error)
      // Still return success since we have the token
    }
    
    return {
      success: true,
      accessToken: data.access_token,
      expiresAt,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during token refresh',
    }
  }
}

/**
 * Save an access token to the database.
 */
export async function saveAccessToken(
  accessToken: string,
  expiresAt: Date,
  note?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createAdminClient()
  
  if (!supabase) {
    return {
      success: false,
      error: 'Admin client not available. Check SUPABASE_SERVICE_ROLE_KEY.',
    }
  }
  
  const now = new Date().toISOString()
  
  const { error } = await supabase
    .from('instagram_credentials')
    .insert({
      access_token: accessToken,
      expires_at: expiresAt.toISOString(),
      last_refreshed_at: now,
      refresher_note: note || 'Auto-refreshed',
      created_at: now,
      updated_at: now,
    })
  
  if (error) {
    return {
      success: false,
      error: error.message,
    }
  }
  
  return { success: true }
}

/**
 * Import the current environment variable token into the database.
 * Used for initial migration from env var to database storage.
 */
export async function importTokenFromEnv(): Promise<{ success: boolean; error?: string }> {
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN
  
  if (!envToken) {
    return {
      success: false,
      error: 'No INSTAGRAM_ACCESS_TOKEN environment variable found',
    }
  }
  
  // Validate the token first
  const isValid = await validateToken(envToken)
  if (!isValid) {
    return {
      success: false,
      error: 'Environment token is invalid or expired',
    }
  }
  
  // We don't know the exact expiration, so assume it was just refreshed
  // User should refresh it after import to get accurate expiration
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_SECONDS * 1000)
  
  return saveAccessToken(envToken, expiresAt, 'Imported from environment variable')
}

/**
 * Validate an Instagram access token by making a test API call.
 */
export async function validateToken(accessToken: string): Promise<boolean> {
  if (!accessToken) return false
  
  try {
    const params = new URLSearchParams({
      fields: 'id',
      access_token: accessToken,
    })
    
    const response = await fetch(
      `https://graph.facebook.com/v21.0/me?${params.toString()}`,
      { next: { revalidate: 0 } }
    )
    
    const data = await response.json()
    
    if (!response.ok || data?.error) {
      return false
    }
    
    return Boolean(data?.id)
  } catch {
    return false
  }
}
