export default function Login() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(168,85,247,0.2),transparent_30%),linear-gradient(180deg,_#f8f5ff_0%,_#f9fafb)] px-4">
      <div className="w-full max-w-md rounded-[30px] border border-violet-100 bg-white/90 p-6 shadow-xl shadow-violet-100 backdrop-blur-xl">
        <div className="mb-6 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-violet-500">Welcome</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Sign in to Qaffy</h1>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Full name</label>
            <input className="w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400" placeholder="Aisha Bello" />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Phone number</label>
            <input className="w-full bg-transparent text-base text-slate-900 placeholder:text-slate-400" placeholder="0803 123 4567" />
          </div>
        </div>

        <button
          type="button"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md shadow-violet-200"
        >
          <span>G</span>
          Continue with Google
        </button>
      </div>
    </div>
  )
}
