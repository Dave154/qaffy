import { data } from 'react-router'
import type { Route } from './+types/push-subscriptions'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../lib/supabase.server'

type PushSubscriptionPayload = {
  endpoint?: string
  keys?: { p256dh?: string; auth?: string }
}

export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Supabase is not configured.' }, { status: 500 })
  if (!['POST', 'DELETE'].includes(request.method)) return data({ ok: false, message: 'Method not allowed.' }, { status: 405 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  if (request.method === 'DELETE') {
    const payload = await request.json() as PushSubscriptionPayload
    if (!payload.endpoint) return data({ ok: false, message: 'Push endpoint is missing.' }, { status: 400, headers })
    const { error } = await supabase.from('push_subscriptions').delete().eq('customer_id', userData.user.id).eq('endpoint', payload.endpoint)
    if (error) return data({ ok: false, message: error.message }, { status: 500, headers })
    return data({ ok: true }, { headers })
  }

  const payload = await request.json() as PushSubscriptionPayload
  const endpoint = payload.endpoint?.trim()
  const p256dh = payload.keys?.p256dh?.trim()
  const auth = payload.keys?.auth?.trim()
  if (!endpoint || !p256dh || !auth) return data({ ok: false, message: 'Push subscription is incomplete.' }, { status: 400, headers })

  const { error } = await supabase.from('push_subscriptions').upsert({
    customer_id: userData.user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: request.headers.get('user-agent'),
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) return data({ ok: false, message: error.message }, { status: 500, headers })

  return data({ ok: true }, { headers })
}
