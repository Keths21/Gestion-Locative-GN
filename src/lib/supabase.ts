import { createBrowserClient } from '@supabase/ssr'
import { configSupabase } from './config-supabase'

export function createClient() {
  const { url, cleAnon } = configSupabase()
  return createBrowserClient(url, cleAnon)
}
