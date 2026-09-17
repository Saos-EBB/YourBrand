import Link from 'next/link'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <footer className="border-t border-outline-variant py-4 text-center text-xs text-on-surface-variant">
        © {process.env.NEXT_PUBLIC_COPYRIGHT_YEAR} {process.env.NEXT_PUBLIC_BRAND_NAME}{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/impressum" className="hover:text-on-surface transition-colors">Impressum</Link>{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/datenschutz" className="hover:text-on-surface transition-colors">Datenschutz</Link>{' '}
        <span aria-hidden="true">·</span>{' '}
        <Link href="/agb" className="hover:text-on-surface transition-colors">AGB</Link>
      </footer>
    </>
  )
}
