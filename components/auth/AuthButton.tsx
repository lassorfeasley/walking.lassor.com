'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { Button } from '@/components/ui/button'
import { AuthDialog } from './AuthDialog'

export function AuthButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setIsAuthenticated(!!user)
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setIsAuthenticated(!!session)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  if (isAuthenticated) {
    return null // UserMenu will show instead
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="default">
        Sign In
      </Button>
      <AuthDialog open={isOpen} onOpenChange={setIsOpen} />
    </>
  )
}

