import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from 'react-router'
import type { Route } from './+types/root'
import stylesheetUrl from './index.css?url'
import { Toaster } from 'sonner'
import RouteLoadingScreen from './components/RouteLoadingScreen'

const defaultTitle = 'Qaffy | Fresh laundry, zero hassle'
const defaultDescription = 'Reliable semester laundry for Nile University students, with free campus pickup and delivery.'

function getSiteOrigin() {
  const configuredOrigin = import.meta.env.VITE_SITE_URL?.trim()
  if (configuredOrigin) return configuredOrigin.replace(/\/$/, '')
  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:5173'
}

export const meta: Route.MetaFunction = ({ location }) => {
  const siteOrigin = getSiteOrigin()
  const pageUrl = new URL(`${location.pathname}${location.search}`, siteOrigin).toString()
  const imageUrl = new URL('/qaffy-logo.png', siteOrigin).toString()

  return [
    { title: defaultTitle },
    { name: 'description', content: defaultDescription },
    { name: 'keywords', content: 'laundry service, laundry pickup, laundry delivery, Qaffy' },
    { name: 'robots', content: 'index, follow' },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'Qaffy' },
    { property: 'og:title', content: defaultTitle },
    { property: 'og:description', content: defaultDescription },
    { property: 'og:url', content: pageUrl },
    { property: 'og:image', content: imageUrl },
    { property: 'og:image:alt', content: 'Qaffy Laundry Service' },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: defaultTitle },
    { name: 'twitter:description', content: defaultDescription },
    { name: 'twitter:image', content: imageUrl },
    { tagName: 'link', rel: 'canonical', href: pageUrl },
  ]
}

export const links: Route.LinksFunction = () => [
  { rel: 'stylesheet', href: stylesheetUrl },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'manifest', href: '/manifest.webmanifest' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#00b7d4" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <Toaster position="top-right" richColors closeButton />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return (
    <>
      <Outlet />
      <RouteLoadingScreen />
    </>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error'

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <p className="text-gray-700">{message}</p>
    </main>
  )
}
