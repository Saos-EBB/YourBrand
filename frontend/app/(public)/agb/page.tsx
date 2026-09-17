'use client'

import { useRouter } from 'next/navigation'
import { LEGAL_INFO } from '@/config/public.config'
import { LegalPageDemoNotice, LegalPageDisclaimer } from '@/components/LegalPageNotice'

export default function AgbPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-background pb-8">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          ← Zurück
        </button>

        <h1 className="text-2xl font-bold text-on-surface">Nutzungsbedingungen</h1>

        <LegalPageDemoNotice />

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Geltungsbereich</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Diese Nutzungsbedingungen gelten für die Nutzung der Demo-Version von YourDemo,
            betrieben von {LEGAL_INFO.name} als privates, nicht-kommerzielles Portfolio-Projekt.
            Es besteht kein Vertragsverhältnis im Sinne eines kommerziellen Dienstes.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Keine Verfügbarkeitsgarantie</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Das Backend läuft nur zeitweise (in der Regel werktags, für maximal ca. 12 Stunden am
            Stück) und wird ohne Ankündigung gestartet, beendet oder verändert. Es besteht kein
            Anspruch auf Erreichbarkeit, bestimmte Betriebszeiten oder Funktionsfähigkeit.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Kein Anspruch auf Datenerhalt</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Eingegebene Daten (Konten, Profile, Nachrichten, Uploads) können jederzeit und ohne
            Ankündigung gelöscht werden — unter anderem bei jedem Neustart des Backends. Es besteht
            kein Anspruch auf Speicherung, Sicherung oder Wiederherstellung von Daten.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Nutzung auf eigenes Risiko</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Die Nutzung der Demo erfolgt auf eigenes Risiko. Es wird keine Haftung für Schäden
            übernommen, die durch die Nutzung, Nichtverfügbarkeit oder Datenverlust entstehen.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Keine kommerzielle Nutzung</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Die Demo dient ausschließlich der Vorstellung der Software im Rahmen einer
            Bewerbung/eines Portfolios. Eine kommerzielle Nutzung, Weiterverwendung oder das
            Anbieten der Demo als eigenen Dienst ist nicht gestattet.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Keine echten Daten Dritter</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Es ist untersagt, echte personenbezogene Daten anderer Personen (z.B. echte
            E-Mail-Adressen, Fotos oder Namen Dritter ohne deren Einwilligung) in die Demo
            einzugeben.
          </p>
        </section>

        <LegalPageDisclaimer />
      </div>
    </main>
  )
}
