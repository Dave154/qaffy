import { data } from 'react-router'
import { sql } from '../lib/db.server'

export async function loader({ request }: { request: Request }) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return data({ ok: false, message: 'Unauthorized.' }, { status: 401 })
  }

  const deleted = await sql`
    delete from logistics_used_otps
    where expires_at <= now()
    returning id
  `

  return data({ ok: true, deletedCount: deleted.length })
}
