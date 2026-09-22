import { data, Link, useFetcher, useLoaderData } from 'react-router'
import type { Route } from './+types/Notifications'
import { getSupabaseServerClient, isSupabaseServerConfigured } from '../../../lib/supabase.server'
import type { NotificationEvent } from '../../../types/database.types'

type NotificationPayload = {
  title?: unknown
  body?: unknown
  details?: unknown
  url?: unknown
}

type NotificationRow = Pick<NotificationEvent, 'id' | 'notification_type' | 'payload' | 'status' | 'created_at' | 'read_at'>

function getText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function parseNotificationPayload(value: unknown): NotificationPayload {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      return parsed && typeof parsed === 'object' ? parsed as NotificationPayload : {}
    } catch {
      return {}
    }
  }

  return value && typeof value === 'object' ? value as NotificationPayload : {}
}

function getInternalUrl(value: unknown) {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) return value
  return '/notifications'
}

function formatNotificationDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Recently' : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function loader({ request }: Route.LoaderArgs) {
  if (!isSupabaseServerConfigured) return data({ notifications: [], error: 'Notifications are unavailable right now.' })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ notifications: [], error: 'Please sign in again.' }, { status: 401, headers })

  const { data: notifications, error } = await supabase
    .from('notification_events')
    .select('id, notification_type, payload, status, created_at, read_at')
    .eq('customer_id', userData.user.id)
    .order('created_at', { ascending: false })

  return data({ notifications: (notifications ?? []) as NotificationRow[], error: error?.message ?? null }, { headers })
}

// eslint-disable-next-line react-refresh/only-export-components
export async function action({ request }: Route.ActionArgs) {
  if (!isSupabaseServerConfigured) return data({ ok: false, message: 'Notifications are unavailable right now.' }, { status: 500 })

  const { supabase, headers } = getSupabaseServerClient(request)
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) return data({ ok: false, message: 'Please sign in again.' }, { status: 401, headers })

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  const notificationId = String(formData.get('notificationId') ?? '')
  const update = supabase
    .from('notification_events')
    .update({ read_at: new Date().toISOString() })
    .eq('customer_id', userData.user.id)
    .is('read_at', null)

  const { error } = intent === 'mark-all-read'
    ? await update
    : intent === 'mark-read' && notificationId
      ? await update.eq('id', notificationId)
      : { error: { message: 'Notification action is invalid.' } }

  if (error) return data({ ok: false, message: error.message }, { status: 400, headers })
  return data({ ok: true }, { headers })
}

export default function Notifications() {
  const { notifications, error } = useLoaderData<typeof loader>()
  const fetcher = useFetcher<typeof action>()
  const unreadCount = notifications.filter((notification) => !notification.read_at).length

  const markAllRead = () => {
    fetcher.submit({ intent: 'mark-all-read' }, { method: 'post' })
  }

  return (
    <div className="space-y-5 pb-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-ink lg:hidden">Notifications</h2>
          <p className="text-sm text-slate-500">{unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Your latest account updates'}</p>
        </div>
        {unreadCount > 0 && <button type="button" onClick={markAllRead} disabled={fetcher.state !== 'idle'} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Mark all as read</button>}
      </header>

      {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}

      {!error && notifications.length === 0 && <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm shadow-slate-100"><p className="text-sm text-slate-500">No notifications yet.</p></section>}

      {!error && notifications.length > 0 && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-100">
        <div className="divide-y divide-slate-100">
          {notifications.map((notification) => {
            const payload = parseNotificationPayload(notification.payload)
            const title = getText(payload.title, 'Qaffy update')
            const body = getText(payload.body, '')
            const target = getInternalUrl(payload.url)
            return (
              <Link
                key={notification.id}
                to={target}
                onClick={() => {
                  if (!notification.read_at) fetcher.submit({ intent: 'mark-read', notificationId: notification.id }, { method: 'post' })
                }}
                className={`block p-4 transition hover:bg-slate-50 sm:p-5 ${notification.read_at ? 'bg-white' : 'bg-brand-soft/30'}`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${notification.read_at ? 'bg-slate-300' : 'bg-brand-primary'}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                      <h3 className="font-semibold text-slate-900">{title}</h3>
                      <time dateTime={notification.created_at} className="shrink-0 text-xs text-slate-400">{formatNotificationDate(notification.created_at)}</time>
                    </div>
                    {body && <p className="mt-1 text-sm leading-6 text-slate-600">{body}</p>}
                    {!body && <p className="mt-1 text-sm leading-6 text-slate-600">You have a new update from Qaffy.</p>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>}
    </div>
  )
}
