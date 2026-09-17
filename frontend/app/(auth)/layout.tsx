import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col px-4">
      <div className="flex-1 flex flex-col items-center justify-center py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 text-center">
            <Link
              href="/"
              className="text-3xl font-bold text-on-surface tracking-tight"
              aria-label="XXX home"
            >
              YourDemo
            </Link>
          </div>
          {children}
        </div>
      </div>
      <footer className="border-t border-outline-variant py-4 text-center text-xs text-on-surface-variant">
        © {process.env.NEXT_PUBLIC_COPYRIGHT_YEAR} {process.env.NEXT_PUBLIC_BRAND_NAME}{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/impressum" className="hover:text-on-surface transition-colors">Impressum</Link>{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/datenschutz" className="hover:text-on-surface transition-colors">Datenschutz</Link>{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/agb" className="hover:text-on-surface transition-colors">AGB</Link>
      </footer>
    </div>
  )
}
