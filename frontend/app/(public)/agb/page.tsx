'use client'

import { useRouter } from 'next/navigation'
import { useTenant } from '@/components/TenantProvider'
import { LegalPageDemoNotice, LegalPageDisclaimer } from '@/components/LegalPageNotice'

export default function AgbPage() {
  const router = useRouter()
  // Impressum-Angaben pro Mandant (tenants/<slug>/tenant.json "legal").
  const { legal, brand, modules } = useTenant()

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
            Diese Nutzungsbedingungen gelten für die Nutzung der Demo-Version von {brand.name},
            betrieben von {legal.name} als privates, nicht-kommerzielles Portfolio-Projekt.
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

        {/* Nur mit Modul "board" — die Zustimmung zu oeffentlichen Aushaengen verweist hierher */}
        {modules.board && (
          <section id="board" className="space-y-2 scroll-mt-6">
            <h2 className="text-sm font-semibold text-on-surface">§ 7 Schwarzes Brett</h2>
            <ol className="list-decimal pl-5 space-y-1.5 text-sm text-on-surface-variant leading-relaxed">
              <li>Mitglieder können Aushänge auf dem Schwarzen Brett veröffentlichen und selbst wählen, wer sie sieht: Mitglieder im Umkreis von 150 m, 500 m, 1 km oder 3 km um den Ort im eigenen Profil, oder alle.</li>
              <li>Ein Aushang mit der Sichtbarkeit „Alle“ ist öffentlich. Er kann ohne Anmeldung aufgerufen werden, auch auf der Startseite. Sichtbar sind Spitzname, Straße (ohne Hausnummer), Art, Titel, Text und Ablaufdatum.</li>
              <li>Für den Inhalt ist das Mitglied verantwortlich. Nicht erlaubt sind Angaben über andere Personen ohne deren Zustimmung, gewerbliche Werbung und Inhalte, die gegen Gesetze oder diese Bedingungen verstoßen.</li>
              <li>Aushänge laufen nach 14 Tagen ab. Das Mitglied kann sie vorher abnehmen. {brand.name} kann Aushänge entfernen, die gegen diese Regeln verstoßen.</li>
            </ol>
          </section>
        )}

        <LegalPageDisclaimer />
      </div>
    </main>
  )
}
