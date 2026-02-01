"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, CheckCircle, Clock, RefreshCw, Upload } from "lucide-react"
import { addDays, format } from "date-fns"

interface CredentialStatus {
  last_refreshed_at: string
  refresher_note?: string
  access_token?: string
  expires_at?: string
}

interface TokenStatus {
  hasToken: boolean
  source: 'database' | 'environment' | null
  expiresAt: string | null
  daysUntilExpiration: number | null
  isExpiringSoon: boolean
  isValid: boolean
}

export default function InstagramTokenAdminPage() {
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [history, setHistory] = useState<CredentialStatus[]>([])
  const [refreshDate, setRefreshDate] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [shortToken, setShortToken] = useState("")
  const [appId, setAppId] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [exchangeUrl, setExchangeUrl] = useState<string | null>(null)
  
  // New state for token management
  const [tokenStatus, setTokenStatus] = useState<TokenStatus | null>(null)
  const [loadingTokenStatus, setLoadingTokenStatus] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [importing, setImporting] = useState(false)

  // Load token status
  const loadTokenStatus = async () => {
    try {
      const response = await fetch("/api/admin/instagram-token/refresh")
      const payload = await response.json()
      if (response.ok) {
        setTokenStatus(payload)
      }
    } catch (err) {
      console.error("Failed to load token status:", err)
    } finally {
      setLoadingTokenStatus(false)
    }
  }

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/admin/instagram-token/status")
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load status")
        }
        if (payload.credentials) {
          setHistory(payload.credentials)
          if (payload.credentials.length > 0) {
            const latest = payload.credentials[0]
            setRefreshDate(latest.last_refreshed_at.slice(0, 10))
            setNote(latest.refresher_note ?? "")
          }
        }
      } catch (err) {
        console.error(err)
        setError(err instanceof Error ? err.message : "Failed to load status")
      } finally {
        setLoadingStatus(false)
      }
    }

    loadStatus()
    loadTokenStatus()
  }, [])

  const handleRefreshToken = async () => {
    setRefreshing(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/admin/instagram-token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Failed to refresh token")
      }
      setSuccess("Token refreshed successfully! New expiration: " + 
        (payload.expiresAt ? format(new Date(payload.expiresAt), "PPP") : "60 days from now"))
      await loadTokenStatus()
      // Reload history to show the new entry
      const statusResponse = await fetch("/api/admin/instagram-token/status")
      const statusPayload = await statusResponse.json()
      if (statusResponse.ok && statusPayload.credentials) {
        setHistory(statusPayload.credentials)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh token")
    } finally {
      setRefreshing(false)
    }
  }

  const handleImportFromEnv = async () => {
    setImporting(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/admin/instagram-token/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importFromEnv: true }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Failed to import token")
      }
      setSuccess("Token imported and refreshed successfully!")
      await loadTokenStatus()
      // Reload history
      const statusResponse = await fetch("/api/admin/instagram-token/status")
      const statusPayload = await statusResponse.json()
      if (statusResponse.ok && statusPayload.credentials) {
        setHistory(statusPayload.credentials)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import token")
    } finally {
      setImporting(false)
    }
  }

  const handleSave = async () => {
    if (!refreshDate) {
      setError("Select the date you refreshed the token.")
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const response = await fetch("/api/admin/instagram-token/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refreshedAt: refreshDate,
          refresherNote: note || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save status")
      }
      setHistory([payload.credential, ...history])
      setSuccess("Refresh date saved.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save status")
    } finally {
      setSaving(false)
    }
  }

  const buildExchangeUrl = () => {
    if (!shortToken || !appId || !appSecret) {
      setExchangeUrl(null)
      setError("Please fill in all fields: short-lived token, App ID, and App secret")
      return
    }
    setError(null)
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId.trim(),
      client_secret: appSecret.trim(),
      fb_exchange_token: shortToken.trim(),
    })
    setExchangeUrl(
      `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
    )
  }

  const getStatusColor = () => {
    if (!tokenStatus?.hasToken) return "bg-gray-100 text-gray-700"
    if (!tokenStatus.isValid) return "bg-red-100 text-red-700"
    if (tokenStatus.isExpiringSoon) return "bg-yellow-100 text-yellow-700"
    return "bg-green-100 text-green-700"
  }

  const getStatusIcon = () => {
    if (!tokenStatus?.hasToken) return <AlertCircle className="h-5 w-5" />
    if (!tokenStatus.isValid) return <AlertCircle className="h-5 w-5" />
    if (tokenStatus.isExpiringSoon) return <Clock className="h-5 w-5" />
    return <CheckCircle className="h-5 w-5" />
  }

  const getStatusText = () => {
    if (!tokenStatus?.hasToken) return "No token configured"
    if (!tokenStatus.isValid) return "Token is invalid or expired"
    if (tokenStatus.isExpiringSoon) {
      return `Token expiring soon (${tokenStatus.daysUntilExpiration} days left)`
    }
    return `Token valid (${tokenStatus.daysUntilExpiration} days until expiration)`
  }

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      {/* Token Status Card - NEW */}
      <Card>
        <CardHeader>
          <CardTitle>Token Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingTokenStatus ? (
            <p className="text-sm text-muted-foreground">Loading token status...</p>
          ) : (
            <>
              <div className={`flex items-center gap-3 p-4 rounded-lg ${getStatusColor()}`}>
                {getStatusIcon()}
                <div>
                  <p className="font-medium">{getStatusText()}</p>
                  {tokenStatus?.source && (
                    <p className="text-sm opacity-80">
                      Source: {tokenStatus.source === 'database' ? 'Database (auto-refresh enabled)' : 'Environment variable'}
                    </p>
                  )}
                  {tokenStatus?.expiresAt && (
                    <p className="text-sm opacity-80">
                      Expires: {format(new Date(tokenStatus.expiresAt), "PPP 'at' p")}
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-md bg-rose-100 p-3 text-sm text-rose-900">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 rounded-md bg-green-100 p-3 text-sm text-green-900">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  {success}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {tokenStatus?.hasToken && tokenStatus?.isValid && (
                  <Button 
                    onClick={handleRefreshToken} 
                    disabled={refreshing}
                    className="gap-2"
                  >
                    <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                    {refreshing ? "Refreshing..." : "Refresh Token Now"}
                  </Button>
                )}

                {(!tokenStatus?.hasToken || tokenStatus?.source === 'environment') && (
                  <Button 
                    onClick={handleImportFromEnv} 
                    disabled={importing}
                    variant="outline"
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    {importing ? "Importing..." : "Import from Environment Variable"}
                  </Button>
                )}
              </div>

              {tokenStatus?.source === 'database' && (
                <p className="text-sm text-muted-foreground">
                  Your token is stored in the database and will be automatically refreshed 
                  when it&apos;s within 7 days of expiring.
                </p>
              )}

              {tokenStatus?.source === 'environment' && (
                <p className="text-sm text-muted-foreground">
                  Your token is stored in environment variables. Click &quot;Import from Environment Variable&quot; 
                  to move it to the database for automatic refresh.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Manual Token Setup - for initial setup or recovery */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Token Setup</CardTitle>
          <p className="text-muted-foreground text-sm">
            Only needed if you need to create a new token from scratch (e.g., after token expires completely).
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p>
            1. Paste the short-lived token from{" "}
            <a
              href="https://developers.facebook.com/tools/explorer/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Graph API Explorer
            </a>
            .
          </p>
          <p>
            2. Get your App ID and App Secret from{" "}
            <a
              href="https://developers.facebook.com/apps/1538979573913777/settings/basic/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              App Settings &gt; Basic
            </a>
            .
          </p>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="short-token">Short-lived token</Label>
              <textarea
                id="short-token"
                className="min-h-[100px] w-full rounded-md border bg-background p-2 text-xs"
                placeholder="Paste the short-lived token from Graph API Explorer..."
                value={shortToken}
                onChange={(e) => setShortToken(e.target.value)}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="app-id">App ID</Label>
                <Input
                  id="app-id"
                  placeholder="e.g., 1538979573913777"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="app-secret">App Secret</Label>
                <Input
                  id="app-secret"
                  type="password"
                  placeholder="Paste the Facebook app secret here..."
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                />
              </div>
            </div>
          </div>
          <Button type="button" onClick={buildExchangeUrl}>
            Generate exchange URL
          </Button>
          {exchangeUrl ? (
            <div className="space-y-2">
              <div className="rounded border bg-background p-3 text-xs break-all">
                {exchangeUrl}
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
              >
                <a href={exchangeUrl} target="_blank" rel="noreferrer">
                  Open exchange URL in new tab
                </a>
              </Button>
              <p className="text-xs text-muted-foreground">
                After getting the long-lived token, add it to your INSTAGRAM_ACCESS_TOKEN 
                environment variable, then click &quot;Import from Environment Variable&quot; above.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Manual date tracking - legacy, kept for reference */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Refresh Tracking</CardTitle>
          <p className="text-muted-foreground text-sm">
            Legacy: Use this only if you need to manually track token refresh dates 
            without using the automatic system.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="refresh-date">Token refreshed on</Label>
              <Input
                id="refresh-date"
                type="date"
                value={refreshDate}
                onChange={(e) => setRefreshDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refresh-note">Notes (optional)</Label>
              <Input
                id="refresh-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g., Updated on staging + prod"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleSave} disabled={saving} variant="outline">
              {saving ? "Saving..." : "Save refresh date"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setRefreshDate(new Date().toISOString().slice(0, 10))
                setNote("")
              }}
            >
              Set to today
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Refresh History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((entry, index) => (
              <div
                key={`${entry.last_refreshed_at}-${index}`}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">
                  {format(new Date(entry.last_refreshed_at), "PPP")}
                </p>
                {entry.expires_at ? (
                  <p className="text-xs text-muted-foreground">
                    Expires: {format(new Date(entry.expires_at), "PPP")}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Next due (estimated):{" "}
                    {format(
                      addDays(new Date(entry.last_refreshed_at), 60),
                      "PPP"
                    )}
                  </p>
                )}
                {entry.refresher_note ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    {entry.refresher_note}
                  </p>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
