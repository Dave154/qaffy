export default function Login() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold text-gray-900">Vendor sign in</h1>
      <input
        type="email"
        placeholder="you@example.com"
        className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm"
      />
      <button
        type="button"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
      >
        Send magic link
      </button>
    </div>
  )
}
