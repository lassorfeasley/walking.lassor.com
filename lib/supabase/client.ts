import { createBrowserClient } from '@supabase/ssr'

// Legacy export - use createClient from './browser' instead
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

