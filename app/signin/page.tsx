'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignInPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSignUp, setIsSignUp] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
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
        // Show success message - user needs to confirm email
        alert('Please check your email to confirm your account!')
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold mb-2">Walking Forward</h1>
          <p className="text-muted-foreground">Sign in to manage your panoramas</p>
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
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-3 rounded">{error}</div>
          )}
          <Button type="submit" disabled={isLoading} className="w-full">
            {isLoading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsSignUp(!isSignUp)}
            className="w-full"
            disabled={isLoading}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : "Don't have an account? Sign up"}
          </Button>
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

