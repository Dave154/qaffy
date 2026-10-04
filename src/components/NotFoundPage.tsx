import { ArrowLeft, House } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import BubblyBackground from './BubblyBackground'
import QaffyLogo from './QaffyLogo'

function getPortalHome(pathname: string) {
  if (pathname.startsWith('/admin')) return { path: '/admin', label: 'Admin home' }
  if (pathname.startsWith('/vendor')) return { path: '/vendor', label: 'Vendor home' }
  if (pathname.startsWith('/logistics')) return { path: '/logistics', label: 'Logistics home' }
  return { path: '/', label: 'Home' }
}

export default function NotFoundPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const home = getPortalHome(location.pathname)

  return (
    <main className="relative isolate flex min-h-screen overflow-hidden bg-[#f7fcfd] text-slate-900">
      <BubblyBackground contained count={9} color="var(--color-brand-primary)" opacity={0.4} scale={3} />
      <div className="relative z-40 mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
        <header className="flex items-center justify-between">
          <Link to={home.path} aria-label="Qaffy home" className="inline-flex rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary">
            <QaffyLogo />
          </Link>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full border border-brand-border/70 bg-white/90 px-5 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition duration-200 hover:-translate-y-0.5 hover:border-brand-primary/40 hover:text-brand-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary transition-colors group-hover:bg-brand-primary/15">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </span>
            Go back
          </button>
        </header>

        <section className="flex flex-1 items-center justify-center py-16 text-center">
          <div className="w-full max-w-2xl">
            <span className="text-3xl font-bold tracking-[0.12em] text-brand-primary sm:text-4xl">404</span>
            <h1 className="mt-5 text-5xl font-bold leading-[1.04] text-slate-900 sm:text-7xl">
              Page not found
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
              We couldn&apos;t find that address. Let&apos;s get you back to the right place.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to={home.path}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                <House className="h-4 w-4" aria-hidden="true" />
                {home.label}
              </Link>
            </div>
          </div>
        </section>

        <footer className="text-center text-xs font-medium text-slate-500">A fresh start is one click away.</footer>
      </div>
    </main>
  )
}