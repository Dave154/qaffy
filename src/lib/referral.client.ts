const referralCookieName = 'qaffy_referral_code'
const referralCookieMaxAge = 60 * 60 * 24 * 30

function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? ''
  return /^QF[A-Z0-9]{6}$/.test(code) ? code : null
}

export function captureReferralCodeFromUrl() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const code = normalizeReferralCode(new URLSearchParams(window.location.search).get('ref'))
  if (!code) return null
  document.cookie = `${referralCookieName}=${encodeURIComponent(code)}; Max-Age=${referralCookieMaxAge}; Path=/; SameSite=Lax`
  return code
}

export function clearReferralCodeCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${referralCookieName}=; Max-Age=0; Path=/; SameSite=Lax`
}