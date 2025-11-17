'use client'

import { usePathname } from 'next/navigation'
import { UserMenu } from './UserMenu'
import { AuthButton } from './AuthButton'

/**
 * Navigation bar that only shows on admin pages
 * Public pages (/, /panorama/[id]) don't show this nav
 */
export function AdminNav() {
  const pathname = usePathname()
  
  // Admin pages that should show the nav
  const isAdminPage = pathname?.startsWith('/upload') ||
    pathname?.startsWith('/edit') ||
    pathname?.startsWith('/library') ||
    pathname?.startsWith('/signin')

  if (!isAdminPage) {
    return null
  }

  return (
    <nav className="border-b p-4">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-xl font-bold">Walking Forward</h1>
        <div className="flex items-center gap-4">
          <UserMenu />
          <AuthButton />
        </div>
      </div>
    </nav>
  )
}

