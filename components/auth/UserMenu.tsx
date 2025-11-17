'use client'

import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export function UserMenu() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setIsLoading(false)
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setIsLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground">
        {user.email}
      </span>
      <Button onClick={handleSignOut} variant="outline" size="sm">
        Sign Out
      </Button>
    </div>
  )
}

