"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { AlertCircle, CheckCircle2, Info } from "lucide-react"
import { format } from "date-fns"

interface CredentialStatus {
  token_hint: string
  expires_at: string
  instagram_business_account_id?: string
  notes?: string
  updated_at: string
  updated_by?: string
}

interface VerificationResult {
  success: boolean
  profile?: {
    id: string
    name: string
    email?: string | null
  }
  error?: string
}

export default function InstagramTokenAdminPage() {
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [status, setStatus] = useState<CredentialStatus | null>(null)
  const [expiresAt, setExpiresAt] = useState("")
  const [tokenHint, setTokenHint] = useState("")
  const [businessId, setBusinessId] = useState("")
  const [notes, setNotes] = useState("")
  const [verificationToken, setVerificationToken] = useState("")
  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [verifyLoading, setVerifyLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const response = await fetch("/api/admin/instagram-token/status")
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load status")
        }
        if (payload.credential) {
          setStatus(payload.credential)
          setExpiresAt(payload.credential.expires_at.slice(0, 10))
          setTokenHint(payload.credential.token_hint)
          setBusinessId(payload.credential.instagram_business_account_id ?? "")
          setNotes(payload.credential.notes ?? "")
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

  const handleVerify = async () => {
    if (!verificationToken) {
      setVerificationResult({
        success: false,
        error: "Provide a token to verify.",
      })
      return
    }

    setVerifyLoading(true)
    try {
      const response = await fetch("/api/admin/instagram-token/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: verificationToken }),
      })
      const payload = await response.json()
      setVerificationResult(payload)
    } catch (err) {
      setVerificationResult({
        success: false,
        error: err instanceof Error ? err.message : "Verification failed",
      })
    } finally {
      setVerifyLoading(false)
    }
  }

  const handleSave = async () => {
    if (!expiresAt || !tokenHint) {
      setError("Expiration date and token hint are required.")
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch("/api/admin/instagram-token/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenHint: tokenHint.trim(),
          expiresAt,
          instagramBusinessAccountId: businessId || undefined,
          notes: notes || undefined,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || "Failed to save status")
      }
      setStatus(payload.credential)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save status")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-8 space-y-2">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          Admin
        </p>
        <h1 className="text-3xl font-semibold">Instagram Token Management</h1>
        <p className="text-muted-foreground max-w-2xl text-sm">
          Store metadata about your long-lived Instagram token, verify new
          tokens, and keep track of expiration dates. The actual token should be
          pasted into your Vercel environment variables—this page only records
          the last 4 characters and expiration info.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Token Verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="verification-token">
                Long-lived token (temporary input)
              </Label>
              <Textarea
                id="verification-token"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value)}
                placeholder="Paste the long-lived token here to verify"
                rows={4}
              />
            </div>
            <div className="flex gap-3">
              <Button onClick={handleVerify} disabled={verifyLoading}>
                {verifyLoading ? "Verifying..." : "Verify token"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setVerificationToken("")}
              >
                Clear
              </Button>
            </div>
            {verificationResult?.success && verificationResult.profile ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-100/60 p-3 text-sm text-emerald-900">
                <CheckCircle2 className="h-4 w-4" />
                Verified as {verificationResult.profile.name} (
                {verificationResult.profile.id})
              </div>
            ) : null}
            {verificationResult && !verificationResult.success ? (
              <div className="flex items-center gap-2 rounded-md bg-amber-100 p-3 text-sm text-amber-900">
                <AlertCircle className="h-4 w-4" />
                {verificationResult.error ?? "Token verification failed"}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Current Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {loadingStatus ? (
              <p className="text-muted-foreground">Loading current status...</p>
            ) : status ? (
              <div className="space-y-2">
                <p>
                  <span className="font-medium">Token hint:</span>{" "}
                  {status.token_hint}
                </p>
                <p>
                  <span className="font-medium">Expires:</span>{" "}
                  {format(new Date(status.expires_at), "PPP")}
                </p>
                {status.instagram_business_account_id ? (
                  <p>
                    <span className="font-medium">IG Business ID:</span>{" "}
                    {status.instagram_business_account_id}
                  </p>
                ) : null}
                {status.notes ? (
                  <p className="text-muted-foreground">{status.notes}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No token metadata stored. Use the form below to add details once
                you generate a token.
              </p>
            )}

            <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Info className="h-4 w-4" />
                Quick reference
              </div>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  In Graph API Explorer, select the app, add permissions
                  (<code>instagram_basic</code>, <code>instagram_content_publish</code>,{" "}
                  <code>pages_show_list</code>, <code>pages_read_engagement</code>), click
                  “Generate Access Token”.
                </li>
                <li>
                  Exchange it for a 60-day token:
                  <pre className="mt-1 rounded bg-background p-2">
                    {`https://graph.facebook.com/v21.0/oauth/access_token?
grant_type=fb_exchange_token
&client_id=APP_ID
&client_secret=APP_SECRET
&fb_exchange_token=SHORT_TOKEN`}
                  </pre>
                </li>
                <li>
                  Paste the new token into Vercel (Preview + Production) as{" "}
                  <code>INSTAGRAM_ACCESS_TOKEN</code> and record the last 4 chars +
                  expiry below.
                </li>
              </ol>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Save metadata</CardTitle>
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
              <Label htmlFor="token-hint">Token hint (last 4 chars)</Label>
              <Input
                id="token-hint"
                value={tokenHint}
                onChange={(e) => setTokenHint(e.target.value)}
                placeholder="e.g., 5XQK"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expires-at">Expiration date</Label>
              <Input
                id="expires-at"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-id">Instagram Business Account ID</Label>
              <Input
                id="business-id"
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                placeholder="1784..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context"
              />
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save metadata"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

