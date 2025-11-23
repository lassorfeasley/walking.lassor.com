"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AlertCircle, Info } from "lucide-react"
import { addDays, format, formatDistanceToNow } from "date-fns"

interface CredentialStatus {
  last_refreshed_at: string
  refresher_note?: string
}

export default function InstagramTokenAdminPage() {
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [history, setHistory] = useState<CredentialStatus[]>([])
  const [refreshDate, setRefreshDate] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shortToken, setShortToken] = useState("")
  const [appSecret, setAppSecret] = useState("")
  const [exchangeUrl, setExchangeUrl] = useState<string | null>(null)

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
  }, [])

  const handleSave = async () => {
    if (!refreshDate) {
      setError("Select the date you refreshed the token.")
      return
    }
    setSaving(true)
    setError(null)
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save status")
    } finally {
      setSaving(false)
    }
  }

  const buildExchangeUrl = () => {
    if (!shortToken || !appSecret) {
      setExchangeUrl(null)
      return
    }
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: "APP_ID",
      client_secret: appSecret.trim(),
      fb_exchange_token: shortToken.trim(),
    })
    setExchangeUrl(
      `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`
    )
  }

  return (
    <div className="container mx-auto px-4 py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Long-lived token URL builder</CardTitle>
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
            2. Paste the app secret (find it on{" "}
            <a
              href="https://developers.facebook.com/apps/1538979573913777/settings/basic/"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              App Settings &gt; Basic
            </a>
            ).
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="short-token">Short-lived token</Label>
              <textarea
                id="short-token"
                className="min-h-[120px] w-full rounded-md border bg-background p-2 text-xs"
                value={shortToken}
                onChange={(e) => setShortToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app-secret">App secret</Label>
              <textarea
                id="app-secret"
                className="min-h-[120px] w-full rounded-md border bg-background p-2 text-xs"
                placeholder="Paste the Facebook app secret here..."
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
              />
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
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mark token refreshed</CardTitle>
          <p className="text-muted-foreground text-sm">
            Use this form immediately after pasting the new long-lived token into
            your environment variables. We’ll remind you 10 days before the next
            refresh window.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="flex items-center gap-2 rounded-md bg-rose-100 p-3 text-sm text-rose-900">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : null}
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
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save refresh date"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRefreshDate(new Date().toISOString().slice(0, 10))
                setNote("")
              }}
            >
              Mark as today
            </Button>
          </div>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Refresh history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.last_refreshed_at}
                className="rounded-lg border p-3 text-sm"
              >
                <p className="font-medium">
                  {format(new Date(entry.last_refreshed_at), "PPP")}
                </p>
                <p className="text-xs text-muted-foreground">
                  Next due:{" "}
                  {format(
                    addDays(new Date(entry.last_refreshed_at), 60),
                    "PPP"
                  )}
                </p>
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

