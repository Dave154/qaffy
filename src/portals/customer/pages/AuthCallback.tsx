import { redirect } from 'react-router'
import type { Route } from './+types/AuthCallback'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'

// React Router route modules require the loader and component to share this file.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!isSupabaseServerConfigured || !code) {
    throw redirect('/login')
  }

  const { supabase, headers } = getSupabaseServerClient(request)
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    throw redirect(`/login?error=${encodeURIComponent(error.message)}`, { headers })
  }

  const { data: userData } = await supabase.auth.getUser()
  const { data: profile } = userData.user
    ? await supabase.from('profiles').select('name, phone').eq('id', userData.user.id).maybeSingle()
    : { data: null }

  if (!userData.user || !profile?.name || !profile.phone) {
    throw redirect('/complete-profile', { headers })
  }

  throw redirect('/', { headers })
}

export default function AuthCallback() {
  return null
}