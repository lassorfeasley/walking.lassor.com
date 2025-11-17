'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { LoginForm } from './LoginForm'

interface AuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sign In / Sign Up</DialogTitle>
        </DialogHeader>
        <LoginForm />
      </DialogContent>
    </Dialog>
  )
}

