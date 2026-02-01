'use client'

import Link from 'next/link'
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
    pathname?.startsWith('/signin') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/reset-password')

  if (!isAdminPage) {
    return null
  }

  const isActive = (path: string) => pathname?.startsWith(path)

  return (
    <nav className="border-b p-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-6">
          <Link href="/library" className="text-xl font-bold hover:opacity-80">
            Walking Forward
          </Link>
          <div className="hidden md:flex items-center gap-4 text-sm">
            <Link 
              href="/library" 
              className={`hover:text-foreground ${isActive('/library') ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
              Library
            </Link>
            <Link 
              href="/upload" 
              className={`hover:text-foreground ${isActive('/upload') ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
              Upload
            </Link>
            <Link 
              href="/admin/instagram-token" 
              className={`hover:text-foreground ${isActive('/admin/instagram-token') ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
            >
              Instagram
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <UserMenu />
          <AuthButton />
        </div>
      </div>
    </nav>
  )
}

