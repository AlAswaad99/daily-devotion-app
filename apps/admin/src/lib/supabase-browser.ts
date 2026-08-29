import { createBrowserClient } from '@supabase/ssr'

/**
 * The dashboard uses the anon key under the signed-in admin's own session.
 * There is no service-role client in this codebase on purpose: RLS is where the
 * privacy guarantees live, and a service-role key would bypass all of them.
 */
export const createClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
