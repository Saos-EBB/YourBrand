export type Locale = 'de' | 'en' | 'leicht'

// Makes every key at every level optional — used for incomplete locale stubs.
// When a stub is ready to be made complete, replace DeepPartial<TranslationKeys>
// with TranslationKeys on that locale and TypeScript will surface every missing key.
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown> ? DeepPartial<T[K]> : T[K]
}

// ─── German (source of truth) ─────────────────────────────────────────────────

const de = {
  common: {
    save:    'Speichern',
    cancel:  'Abbrechen',
    loading: 'Lädt...',
    error:   'Ein Fehler ist aufgetreten.',
    back:    'Zurück',
  },
  auth: {
    login:    'Anmelden',
    logout:   'Abmelden',
    register: 'Registrieren',
    email:    'E-Mail',
    password: 'Passwort',
  },
  profile: {
    editProfile: 'Profil bearbeiten',
    saveProfile: 'Profil speichern',
    setupTitle:  'Profil einrichten',
  },
  onboarding: {
    stepPhoto:          'Foto hinzufügen',
    stepInterests:      'Interessen wählen',
    stepBio:            'Über dich',
    stepDone:           'Fertig!',
    skip:               'Überspringen',
    next:               'Weiter',
    finish:             'Abschließen',
    welcomeTitle:       'Willkommen bei YourDemo!',
    welcomeBody:        'Richte dein Profil ein damit andere dich finden können.',
    start:              "Los geht's",
    photoSubtitle:      '(optional, aber empfohlen)',
    interestsSubtitle:  'Wähle mindestens ein Interesse',
    doneTitle:          'Du bist bereit! 🎉',
    doneBody:           'Dein Profil ist jetzt sichtbar für andere Nutzer.',
    discover:           'Jetzt entdecken',
  },
  chat: {
    blocked:          'Du hast diesen Nutzer blockiert.',
    blockedBy:        'Dieser Nutzer hat dich blockiert.',
    inputPlaceholder: 'Nachricht schreiben...',
  },
  ban: {
    screenText:     'Dein Account wurde gesperrt.',
    contactSupport: 'Support kontaktieren',
    logout:         'Abmelden',
  },
} as const

// ─── Public types ─────────────────────────────────────────────────────────────

// Full required shape — inferred from German so it stays in sync automatically.
export type TranslationKeys = typeof de

// ─── All locales ──────────────────────────────────────────────────────────────

export const translations = {
  de,
  en:     {} as DeepPartial<TranslationKeys>, // TODO
  leicht: {} as DeepPartial<TranslationKeys>, // TODO
} satisfies Record<Locale, DeepPartial<TranslationKeys>>
