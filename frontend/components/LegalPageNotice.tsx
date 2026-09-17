export function LegalPageDemoNotice() {
  return (
    <p
      role="note"
      className="rounded-xl bg-surface-container-high px-4 py-3 text-sm text-on-surface-variant leading-relaxed"
    >
      Diese Seite gilt für eine <strong className="text-on-surface">Demo-Version</strong> von
      YourDemo — ein privates, nicht-kommerzielles Portfolio-Projekt, kein produktiver Betrieb.
    </p>
  )
}

export function LegalPageDisclaimer() {
  return (
    <p className="text-xs text-on-surface-variant leading-relaxed border-t border-outline-variant pt-4">
      Diese Texte wurden für dieses private Demo-Projekt erstellt und ersetzen keine
      Rechtsberatung.
    </p>
  )
}
