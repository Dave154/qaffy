const referralCookieName = 'qaffy_referral_code'
const referralCookieMaxAge = 60 * 60 * 24 * 30

function normalizeReferralCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() ?? ''
  return /^QF[A-Z0-9]{6}$/.test(code) ? code : null
}

export function captureReferralCodeFromUrl() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null
  const referralValue = new URLSearchParams(window.location.search).get('ref')
  if (referralValue === null) return null

  const code = normalizeReferralCode(referralValue)
  if (!code) {
    console.warn('[referral] Referral link code failed format validation')
    return null
  }

  document.cookie = `${referralCookieName}=${encodeURIComponent(code)}; Max-Age=${referralCookieMaxAge}; Path=/; SameSite=Lax`
  const storedCookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${referralCookieName}=`))
  let cookieWasStored: boolean
  try {
    cookieWasStored = storedCookie ? decodeURIComponent(storedCookie.slice(referralCookieName.length + 1)) === code : false
  } catch {
    console.error('[referral] Browser stored an unreadable referral cookie')
    return null
  }
  if (!cookieWasStored) {
    console.error('[referral] Browser did not retain the referral cookie')
    return null
  }

  console.info('[referral] Referral link code captured in browser storage')
  return code
}

export function clearReferralCodeCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${referralCookieName}=; Max-Age=0; Path=/; SameSite=Lax`
}
