'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type PageMode = 'signin' | 'signup' | 'forgot-password'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [mode, setMode] = useState<PageMode>('signin')
  const router = useRouter()
  const supabase = createClient()

  // Check for recovery tokens in the URL hash and redirect to reset-password page
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('type=recovery')) {
      // Redirect to reset-password page with the hash
      router.push(`/reset-password${hash}`)
    }
  }, [router])

  const isSignUp = mode === 'signup'
  const isForgotPassword = mode === 'forgot-password'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      if (isForgotPassword) {
        // Send password reset email
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/reset-password`,
        })
        if (error) throw error
        setSuccessMessage('Check your email for a password reset link!')
        return
      }

      if (isSignUp) {
        // Restrict sign-ups to admin email only
        const ADMIN_EMAIL = 'feasley@lassor.com'
        if (email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
          setError(`Sign-ups are restricted. Only ${ADMIN_EMAIL} can create an account.`)
          setIsLoading(false)
          return
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/auth/callback`,
          },
        })
        if (error) throw error
        setSuccessMessage('Please check your email to confirm your account!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
        router.push('/library')
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  const switchMode = (newMode: PageMode) => {
    setMode(newMode)
    setError(null)
    setSuccessMessage(null)
  }

  const getTitle = () => {
    if (isForgotPassword) return 'Reset Password'
    return 'Walking Forward'
  }

  const getDescription = () => {
    if (isForgotPassword) return 'Enter your email to receive a reset link'
    return 'Sign in to manage your panoramas'
  }

  const getSubmitLabel = () => {
    if (isLoading) return 'Loading...'
    if (isForgotPassword) return 'Send Reset Link'
    if (isSignUp) return 'Sign Up'
    return 'Sign In'
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">{getTitle()}</h1>
          <p className="text-muted-foreground">{getDescription()}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
              autoComplete="email"
            />
          </div>
          {!isForgotPassword && (
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
              />
            </div>
          )}
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-3 rounded">{error}</div>
          )}
          {successMessage && (
            <div className="text-sm text-green-600 bg-green-50 p-3 rounded">{successMessage}</div>
          )}
          <Button type="submit" disabled={isLoading} className="w-full">
            {getSubmitLabel()}
          </Button>
          
          {isForgotPassword ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => switchMode('signin')}
              className="w-full"
              disabled={isLoading}
            >
              ← Back to sign in
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() => switchMode(isSignUp ? 'signin' : 'signup')}
                className="w-full"
                disabled={isLoading}
              >
                {isSignUp
                  ? 'Already have an account? Sign in'
                  : "Don't have an account? Sign up"}
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  onClick={() => switchMode('forgot-password')}
                  className="text-sm text-muted-foreground hover:text-foreground"
                  disabled={isLoading}
                >
                  Forgot your password?
                </button>
              </div>
            </>
          )}
        </form>

        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to gallery
          </Link>
        </div>
      </div>
    </div>
  )
}

