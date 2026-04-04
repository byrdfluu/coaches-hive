import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="page-shell">
      <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="public-kicker">404</p>
        <h1 className="public-title mt-2 text-4xl md:text-5xl">Page not found</h1>
        <p className="mt-3 max-w-xl text-sm text-[#4a4a4a] md:text-base">
          The page you requested does not exist or has been moved.
        </p>
        <Link
          href="/"
          className="mt-6 rounded-full bg-[#b80f0a] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#b80f0a]"
        >
          Go home
        </Link>
      </div>
    </main>
  )
}
