'use client'

import { useRouter } from 'next/navigation'
import { LEGAL_INFO } from '@/config/public.config'
import { LegalPageDemoNotice, LegalPageDisclaimer } from '@/components/LegalPageNotice'

export default function DatenschutzPage() {
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

        <h1 className="text-2xl font-bold text-on-surface">Datenschutzerklärung</h1>

        <LegalPageDemoNotice />

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Verantwortlicher</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            {LEGAL_INFO.name}, {LEGAL_INFO.address}<br />
            {LEGAL_INFO.email}
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Hosting</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Das Frontend läuft dauerhaft bei Vercel. Das Backend (Server, Datenbank, Datei-Speicher)
            läuft auf einem privaten Rechner des Betreibers und ist nur zeitweise über einen
            ngrok-Tunnel erreichbar — beide Verbindungen sind per HTTPS verschlüsselt.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Erhobene Daten</h2>
          <ul className="text-sm text-on-surface-variant leading-relaxed list-disc pl-5 space-y-1">
            <li>Registrierung: E-Mail-Adresse, Passwort</li>
            <li>Profil: Nickname, Geburtsdatum, Stadt, Bio, Interessen, optional Foto/Audio-Upload</li>
            <li>Chat: Nachrichteninhalte zwischen Nutzern</li>
            <li>Einwilligungs-Nachweis (Consent): welcher AGB/Datenschutz-Version zugestimmt wurde,
              Zeitpunkt, ein Hash der IP-Adresse</li>
            <li>Bei Nutzung der Coin-Funktion: Zahlungsdaten über Stripe (siehe unten)</li>
          </ul>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Verschlüsselung & Sicherheit</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Passwörter werden ausschließlich als bcrypt-Hash gespeichert, nie im Klartext.
            Die E-Mail-Adresse wird AES-256-verschlüsselt gespeichert; für den Login-Abgleich
            existiert zusätzlich ein SHA-256-Hash der E-Mail (mit Salt). Der IP-Adress-Hash im
            Consent-Nachweis und der Hash des Refresh-Tokens sind SHA-256-Hashes. Übertragung
            ausschließlich per HTTPS.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Zugriffsschutz</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Für eine Tabelle mit besonders sensiblen Daten (Art. 9 DSGVO, z.B. Gesundheitsangaben)
            setzt die Datenbank echte Row-Level-Security-Policies durch — ein Nutzer kann diese
            Zeilen technisch nur lesen, wenn sie ihm gehören. Für alle anderen Daten (Profile,
            Nachrichten, Uploads etc.) erfolgt der Zugriffsschutz auf Anwendungsebene durch
            Berechtigungsprüfungen (Guards/Ownership-Checks), nicht durch datenbankseitige
            Row-Level-Security.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Zweck & Rechtsgrundlage</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Betrieb der Demo-Plattform zur Vorführung der Software (Art. 6 Abs. 1 lit. b DSGVO,
            Nutzung auf eigenen Wunsch) sowie Einwilligung in die Nutzungsbedingungen
            (Art. 6 Abs. 1 lit. a DSGVO).
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Speicherdauer & automatischer Reset</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Das Backend läuft nur zeitweise, in der Regel werktags für maximal ca. 12 Stunden am
            Stück. Bei jedem Neustart des Backends werden alle Konten und Daten, die nicht Teil des
            kuratierten Demo-Grundzustands sind — also insbesondere alle über die Registrierung
            angelegten Konten inklusive Profil, Fotos/Audio-Uploads und Nachrichten — vollständig
            gelöscht, spätestens also nach ca. 12 Stunden. Das schließt die hochgeladenen Dateien im
            Objektspeicher mit ein.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Keine E-Mail-Verifizierung</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            In dieser Demo ist die E-Mail-Verifizierung deaktiviert — ein Konto kann ohne Bestätigung
            der E-Mail-Adresse genutzt werden. Bitte deshalb keine echte oder fremde E-Mail-Adresse
            verwenden.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Zahlungen (Stripe)</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Die optionale Coin-Funktion ist an Stripe angebunden. In dieser Demo ist Stripe aktuell
            mit Test-Zugangsdaten konfiguriert — es finden keine echten Abbuchungen statt.
          </p>
        </section>

        <section className="space-y-1">
          <h2 className="text-sm font-semibold text-on-surface">Rechte der betroffenen Person</h2>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            Es besteht ein Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Eine
            Kontolöschung über die Konto-Einstellungen setzt den Account sofort auf inaktiv; nach
            30 Tagen werden E-Mail, Passwort und Profildaten automatisch anonymisiert. Nachrichten,
            Uploads und Spielhistorie können dabei ohne Personenbezug bestehen bleiben. In der
            Praxis greift für alle nicht-kuratierten Konten ohnehin der oben beschriebene
            automatische Reset bei jedem Backend-Neustart. Anfragen bitte an {LEGAL_INFO.email}.
          </p>
        </section>

        <LegalPageDisclaimer />
      </div>
    </main>
  )
}
