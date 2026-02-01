'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type PageState = 'loading' | 'ready' | 'success' | 'error' | 'no-session'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pageState, setPageState] = useState<PageState>('loading')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if we have a recovery session from the URL hash
    const checkSession = async () => {
      try {
        // The Supabase client automatically picks up tokens from the URL hash
        // We need to wait for it to process the hash
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          setPageState('error')
          setError(error.message)
          return
        }

        if (session) {
          setPageState('ready')
        } else {
          // Check if there's a hash with recovery tokens
          const hash = window.location.hash
          if (hash && hash.includes('type=recovery')) {
            // Wait a moment for Supabase to process the hash
            setTimeout(async () => {
              const { data: { session: retrySession } } = await supabase.auth.getSession()
              if (retrySession) {
                setPageState('ready')
              } else {
                setPageState('no-session')
              }
            }, 1000)
          } else {
            setPageState('no-session')
          }
        }
      } catch (err) {
        console.error('Error checking session:', err)
        setPageState('error')
        setError('Failed to verify recovery session')
      }
    }

    // Listen for auth state changes (including recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setPageState('ready')
      } else if (event === 'SIGNED_IN' && session) {
        // User might be signed in via recovery token
        const hash = window.location.hash
        if (hash && hash.includes('type=recovery')) {
          setPageState('ready')
        }
      }
    })

    checkSession()

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase.auth])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({ password })
      
      if (error) throw error
      
      setPageState('success')
      
      // Redirect to library after a short delay
      setTimeout(() => {
        router.push('/library')
        router.refresh()
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password')
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center">
          <p className="text-muted-foreground">Verifying recovery link...</p>
        </div>
      </div>
    )
  }

  // No valid session
  if (pageState === 'no-session') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Invalid or Expired Link</h1>
            <p className="text-muted-foreground">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
          </div>
          <Link href="/signin">
            <Button className="w-full">Back to Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Error state
  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Something Went Wrong</h1>
            <p className="text-muted-foreground">{error || 'An error occurred'}</p>
          </div>
          <Link href="/signin">
            <Button className="w-full">Back to Sign In</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Success state
  if (pageState === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md space-y-8 text-center">
          <div>
            <h1 className="text-3xl font-bold mb-2">Password Updated</h1>
            <p className="text-muted-foreground">
              Your password has been successfully updated. Redirecting...
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Ready state - show form
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Set New Password</h1>
          <p className="text-muted-foreground">Enter your new password below</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
              autoComplete="new-password"
              placeholder="At least 6 characters"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              minLength={6}
              autoComplete="new-password"
              placeholder="Confirm your new password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-3 rounded">{error}</div>
          )}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>

        <div className="text-center">
          <Link href="/signin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
