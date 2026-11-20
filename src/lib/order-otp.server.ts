import { randomInt } from 'node:crypto'
import type { TransactionSql } from 'postgres'

export async function generateFourDigitOtp(tx: TransactionSql) {
  await tx`select pg_advisory_xact_lock(22017, 1)`
  for (let attempt = 0; attempt < 10000; attempt += 1) {
    const candidate = String(randomInt(0, 10000)).padStart(4, '0')
    const [collision] = await tx`
      select exists (
        select 1
        from orders
        where status in ('pending_pickup', 'paid', 'out_for_delivery')
          and (
            right(regexp_replace(coalesce(pickup_otp, ''), '[^0-9]', '', 'g'), 4) = ${candidate}
            or right(regexp_replace(coalesce(delivery_otp, ''), '[^0-9]', '', 'g'), 4) = ${candidate}
          )
      ) or exists (
        select 1
        from logistics_used_otps
        where otp_hash = (
          select encode(extensions.hmac(convert_to(${candidate}, 'UTF8'), secret, 'sha256'), 'hex')
          from private.logistics_otp_lookup_key
        )
          and expires_at > now()
      ) as collision
    `
    if (!collision?.collision) return candidate
  }

  throw new Error('Unable to generate an unused delivery OTP.')
}
