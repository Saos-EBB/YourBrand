'use client'

import { useState } from 'react'
import type { ElementType } from 'react'
import {
  Lock, Accessibility, ShieldCheck, MessageCircle, CreditCard,
  SlidersHorizontal, UserCheck, MapPin, Bell, Funnel,
  Swords, Coins, Trophy, Ghost, ChartBar, Ban, Shuffle, Banknote,
  Building2, Globe, Sun, Moon, ArrowRight, Play,
  ChevronDown, Check, Layers, Zap, Star,
  MessageSquare, AtSign, Mail, Phone, X,
} from 'lucide-react'
import { useThemeStore } from '@/lib/store/themeStore'
import { useLanguageStore } from '@/lib/store/languageStore'
import { useTranslation } from '@/lib/i18n'

type TierKey = 'core' | 'connect' | 'premium'

interface FeatureDef {
  id: string
  icon: ElementType
  de: { title: string; desc: string; videoLabel: string }
  en: { title: string; desc: string; videoLabel: string }
}

interface TierContent {
  title: string
  desc: string
  items: string[]
}

interface TierDef {
  key: TierKey
  icon: ElementType
  light: { de: TierContent; en: TierContent }
  dark:  { de: TierContent; en: TierContent }
}

interface ContactDef {
  icon: ElementType
  label: string
  value: string
  href: string
}

// ─── Light features (10) ──────────────────────────────────────────────────────

const LIGHT_FEATURES: FeatureDef[] = [
  {
    id: 'gdpr', icon: Lock,
    de: { title: 'DSGVO-konform', desc: 'AES-256, Pseudonymisierung, Art.15-Export, Consent Logs.', videoLabel: 'DSGVO-Infrastruktur' },
    en: { title: 'GDPR Compliant', desc: 'AES-256, pseudonymisation, Art.15 export, consent logs.', videoLabel: 'GDPR infrastructure' },
  },
  {
    id: 'a11y', icon: Accessibility,
    de: { title: 'Barrierefrei by Design', desc: 'WCAG-orientiert: Einfache Sprache, Hoher Kontrast, variable Schriftgrößen.', videoLabel: 'Barrierefreiheit' },
    en: { title: 'Accessible by Design', desc: 'WCAG-oriented: easy language, high contrast, font sizes.', videoLabel: 'Accessibility' },
  },
  {
    id: 'vuln', icon: ShieldCheck,
    de: { title: 'Schutz vulnerabler Nutzer', desc: 'vulnerable_flag + enhanced_protection — automatisch aus der Suche ausgeblendet.', videoLabel: 'Vulnerablen-Schutz' },
    en: { title: 'Vulnerable User Protection', desc: 'vulnerable_flag + enhanced_protection, auto-hidden from search.', videoLabel: 'Vulnerable protection' },
  },
  {
    id: 'chat', icon: MessageCircle,
    de: { title: 'Echtzeit-Chat', desc: 'WebSocket, Kontaktanfragen, vollständiger Nachrichtenverlauf.', videoLabel: 'Echtzeit-Chat' },
    en: { title: 'Real-time Chat', desc: 'WebSocket, contact requests, full message history.', videoLabel: 'Real-time chat' },
  },
  {
    id: 'pay', icon: CreditCard,
    de: { title: 'Stripe-Subscriptions', desc: 'Zahlungsabwicklung, Webhooks, Zahlungshistorie, Rechnungen.', videoLabel: 'Stripe-Integration' },
    en: { title: 'Stripe Subscriptions', desc: 'Payment processing, webhooks, invoices.', videoLabel: 'Stripe integration' },
  },
  {
    id: 'mod', icon: SlidersHorizontal,
    de: { title: 'Moderations-Tools', desc: 'Strikes, Bans, Appeals — Admin-Panel mit Ticket-Board.', videoLabel: 'Moderation' },
    en: { title: 'Moderation Tools', desc: 'Strikes, bans, appeals, admin panel with ticket board.', videoLabel: 'Moderation' },
  },
  {
    id: 'profile', icon: UserCheck,
    de: { title: 'Profil-System', desc: 'Foto-Upload, Interessen, Barrierefreiheits-Einstellungen, Sichtbarkeits-Kontrolle.', videoLabel: 'Profil-System' },
    en: { title: 'Profile System', desc: 'Photo upload, interests, accessibility settings, visibility control.', videoLabel: 'Profile system' },
  },
  {
    id: 'discover', icon: MapPin,
    de: { title: 'Discover & Filter', desc: 'PostGIS Radius-Suche, Geschlecht, Alter, Online-Status — auf DB-Ebene.', videoLabel: 'Discover & Filter' },
    en: { title: 'Discover & Filter', desc: 'PostGIS radius search, gender, age, online status, DB-level.', videoLabel: 'Discover & filter' },
  },
  {
    id: 'notif', icon: Bell,
    de: { title: 'Benachrichtigungen', desc: 'In-App für Nachrichten, Matches, Anfragen, Systemereignisse.', videoLabel: 'Benachrichtigungen' },
    en: { title: 'Notifications', desc: 'In-app for messages, matches, requests, system events.', videoLabel: 'Notifications' },
  },
  {
    id: 'kw', icon: Funnel,
    de: { title: 'Keyword-Moderation', desc: 'Profanitätsfilter, DE/AT + EN Wortlisten, Varianten-Normalisierung.', videoLabel: 'Keyword-Moderation' },
    en: { title: 'Keyword Moderation', desc: 'Profanity filter, DE/AT + EN wordlists, variant normalization.', videoLabel: 'Keyword moderation' },
  },
]

// ─── Dark features (8) ───────────────────────────────────────────────────────

const DARK_FEATURES: FeatureDef[] = [
  {
    id: 'beef', icon: Swords,
    de: { title: 'Beef Battles', desc: 'Live-öffentliche Fights, 15min–48h, Voting, Auto-Resolution.', videoLabel: 'Beef System' },
    en: { title: 'Beef Battles', desc: 'Live public fights, 15min–48h, voting, auto-resolution.', videoLabel: 'Beef system' },
  },
  {
    id: 'coin', icon: Coins,
    de: { title: 'Coin-Economy', desc: 'Coins durch Engagement verdienen, Stripe Coin-Pakete kaufen.', videoLabel: 'Coin-System' },
    en: { title: 'Coin Economy', desc: 'Earn via engagement, Stripe coin packages.', videoLabel: 'Coin system' },
  },
  {
    id: 'badge', icon: Trophy,
    de: { title: 'Rewards & Badges', desc: 'Sieger/Verlierer-Badges, Tooth Chains, Highscore-Leaderboard.', videoLabel: 'Rewards' },
    en: { title: 'Rewards & Badges', desc: 'Winner/loser badges, tooth chains, highscore leaderboard.', videoLabel: 'Rewards' },
  },
  {
    id: 'hidden', icon: Ghost,
    de: { title: 'Hidden Zone', desc: '13× Klick-Einstieg, 5 rotierende Kultfilm-Passwörter.', videoLabel: 'Hidden Zone' },
    en: { title: 'Hidden Zone', desc: '13x click entry, 5 rotating cult film passwords.', videoLabel: 'Hidden zone' },
  },
  {
    id: 'vote', icon: ChartBar,
    de: { title: 'Live-Voting', desc: 'Echtzeit WebSocket Vote-Updates, gewichtete Lotterie.', videoLabel: 'Voting-System' },
    en: { title: 'Live Voting', desc: 'Real-time WebSocket vote updates, weighted lottery.', videoLabel: 'Voting system' },
  },
  {
    id: 'exile', icon: Ban,
    de: { title: 'Exile-Mechanik', desc: '24h Cooldown, Auto-Chicken Cron, KO-Erkennung.', videoLabel: 'Exile-System' },
    en: { title: 'Exile Mechanic', desc: '24h cooldown, auto-chicken cron, KO detection.', videoLabel: 'Exile system' },
  },
  {
    id: 'dist', icon: Shuffle,
    de: { title: 'Coin-Verteilung', desc: 'Gewichtete Lotterie beim Beef-Close, Verlierer finanzieren Gewinner.', videoLabel: 'Coin-Verteilung' },
    en: { title: 'Coin Distribution', desc: 'Weighted lottery on beef close, losers fund winners.', videoLabel: 'Coin distribution' },
  },
  {
    id: 'mono', icon: Banknote,
    de: { title: 'Monetarisierungs-Loop', desc: 'Engagement → Coins → Pakete → Recurring Revenue.', videoLabel: 'Monetarisierung' },
    en: { title: 'Monetization Loop', desc: 'Engagement → coins → packages → recurring revenue.', videoLabel: 'Monetization' },
  },
]

// ─── Tiers ───────────────────────────────────────────────────────────────────

const TIERS: TierDef[] = [
  {
    key: 'core', icon: Layers,
    light: {
      de: { title: 'Core', desc: 'Alles für den Produktivstart', items: ['Auth & Session-Management', 'Profil + Foto-Upload', 'Echtzeit-Chat & Anfragen', 'Moderation & Reporting', 'Stripe-Subscriptions', 'Benachrichtigungs-System'] },
      en: { title: 'Core', desc: 'Everything to launch in production', items: ['Auth & sessions', 'Profile + photo upload', 'Real-time chat & requests', 'Moderation & reporting', 'Stripe subscriptions', 'Notification system'] },
    },
    dark: {
      de: { title: 'Core', desc: 'Das Beef-Fundament', items: ['Beef Battle System', 'Live-öffentliches Voting', 'Auto-Resolution & KO', 'Exile-Mechanik (24h)', 'Auto-Chicken Cron', 'WebSocket Beef Gateway'] },
      en: { title: 'Core', desc: 'The beef foundation', items: ['Beef battle system', 'Live public voting', 'Auto-resolution & KO', 'Exile mechanic (24h)', 'Auto-chicken cron', 'WebSocket beef gateway'] },
    },
  },
  {
    key: 'connect', icon: Zap,
    light: {
      de: { title: 'Connect', desc: 'Erweiterte Vernetzung', items: ['Alles aus Core', 'Push-Benachrichtigungen', 'Gruppen-Chat', 'Caretaker-System', 'Organisations-Verwaltung', 'Medien im Chat'] },
      en: { title: 'Connect', desc: 'Extended networking', items: ['Everything in Core', 'Push notifications', 'Group chat', 'Caretaker system', 'Organization management', 'Media in chat'] },
    },
    dark: {
      de: { title: 'Connect', desc: 'Coins & Belohnungen', items: ['Alles aus Core', 'Coin-Economy', 'Stripe Coin-Pakete', 'Gewichtetes Lotterie-System', 'Sieger/Verlierer-Badges', 'Tooth Chain Rewards'] },
      en: { title: 'Connect', desc: 'Coins & rewards', items: ['Everything in Core', 'Coin economy', 'Stripe coin packages', 'Weighted lottery system', 'Winner/loser badges', 'Tooth chain rewards'] },
    },
  },
  {
    key: 'premium', icon: Star,
    light: {
      de: { title: 'Premium', desc: 'Vollausstattung', items: ['Alles aus Connect', 'Video-Chat (WebRTC)', 'Matching-Algorithmus', 'Keyword-Moderation', 'Bewertungs-System', 'Rechnungsgenerierung'] },
      en: { title: 'Premium', desc: 'The full suite', items: ['Everything in Connect', 'Video chat (WebRTC)', 'Matching algorithm', 'Keyword moderation', 'Ratings & reviews', 'Invoice generation'] },
    },
    dark: {
      de: { title: 'Premium', desc: 'Der volle Monetarisierungs-Loop', items: ['Alles aus Connect', 'Coin-Verteilungs-Engine', 'Highscore-Leaderboard', 'Hidden Zone (Kultfilm-PW)', 'Leet-Sprache + Themes', 'Revenue Loop Analytics'] },
      en: { title: 'Premium', desc: 'The full monetization loop', items: ['Everything in Connect', 'Coin distribution engine', 'Highscore leaderboard', 'Hidden zone entry (film PW)', 'Leet speak + themes', 'Revenue loop analytics'] },
    },
  },
]

// ─── Contact ─────────────────────────────────────────────────────────────────

const CONTACT: ContactDef[] = [
  { icon: MessageSquare, label: 'WhatsApp',  value: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_LABEL ?? '',  href: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP ?? '' },
  { icon: AtSign,        label: 'Instagram', value: process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM_LABEL ?? '', href: process.env.NEXT_PUBLIC_CONTACT_INSTAGRAM ?? '' },
  { icon: Mail,          label: 'E-Mail',    value: process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? '',           href: `mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? ''}` },
  { icon: Phone,         label: 'Telefon',   value: process.env.NEXT_PUBLIC_CONTACT_PHONE_LABEL ?? '',    href: process.env.NEXT_PUBLIC_CONTACT_PHONE_TEL ?? '' },
]

// ─── Tech rows ───────────────────────────────────────────────────────────────

const TECH_ROWS = {
  de: [
    { label: 'Architektur',        value: 'NestJS Backend · Next.js 16.2.4 · PostgreSQL 16 + PostGIS 3.4 · TypeORM · Migration 027' },
    { label: 'Sicherheit',         value: 'AES-256-CBC · bcrypt · JWT + HttpOnly Refresh Token · SHA-256+Salt E-Mail-Hashing' },
    { label: 'Deployment',         value: 'Railway-ready · Docker · 1 Backend — separate DB pro Kunde möglich' },
    { label: 'APIs',               value: 'REST + WebSocket (Socket.io) · EventEmitter2 · Stripe Webhooks' },
    { label: 'DSGVO-Infrastruktur',value: 'pseudonymize_user() DB-Funktion · 30-Tage Cronjob · consent_logs · Art.15 Export Endpoint' },
    { label: 'Hidden Engine',      value: 'Beef / Coin / Teeth / Badge System · Migration 027 · WebSocket HiddenBeefGateway' },
    { label: 'Lizenzierung',       value: 'Core / Connect / Premium — Module per Lizenzschlüssel aktiviert' },
  ],
  en: [
    { label: 'Architecture',       value: 'NestJS Backend · Next.js 16.2.4 · PostgreSQL 16 + PostGIS 3.4 · TypeORM · Migration 027' },
    { label: 'Security',           value: 'AES-256-CBC field encryption · bcrypt · JWT + HttpOnly Refresh Token · SHA-256+Salt email hashing' },
    { label: 'Deployment',         value: 'Railway-ready · Docker · single backend — separate DB per client possible' },
    { label: 'APIs',               value: 'REST + WebSocket (Socket.io) · EventEmitter2 · Stripe Webhooks' },
    { label: 'GDPR infrastructure',value: 'pseudonymize_user() DB function · 30-day cronjob · consent_logs · Art.15 export endpoint' },
    { label: 'Hidden engine',      value: 'Beef / Coin / Teeth / Badge system · Migration 027 · WebSocket HiddenBeefGateway' },
    { label: 'Licensing',          value: 'Core / Connect / Premium — modules activated via license key' },
  ],
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────

const TIER_CARD_CLASS: Record<TierKey, string> = {
  core:    'border-outline-variant bg-surface-container-low',
  connect: 'border-primary-fixed-dim bg-surface-container',
  premium: 'border-tertiary-fixed-dim bg-surface-container-low',
}

const TIER_ICON_CLASS: Record<TierKey, string> = {
  core:    'text-on-surface-variant',
  connect: 'text-primary-fixed-dim',
  premium: 'text-tertiary-fixed-dim',
}

function isIncludeLine(item: string) {
  return item.startsWith('Alles aus') || item.startsWith('Everything in')
}

// ─── Background styles (CSS only, no JS animation) ───────────────────────────

const LIGHT_BG: React.CSSProperties = {
  backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.055) 1px, transparent 1px)',
  backgroundSize: '28px 28px',
}

const DARK_BG: React.CSSProperties = {
  backgroundImage: [
    'radial-gradient(rgba(255,255,255,0.028) 1px, transparent 1px)',
    'radial-gradient(rgba(255,255,255,0.018) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '3px 3px, 7px 7px',
  backgroundPosition: '0 0, 2px 2px',
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  feat, content, selected, onToggle,
}: {
  feat: FeatureDef
  content: FeatureDef['de']
  selected: boolean
  onToggle: () => void
}) {
  const Icon = feat.icon
  return (
    <button
      onClick={onToggle}
      className={`w-full text-left rounded-2xl border p-5 transition-all hover:bg-surface-container ${
        selected
          ? 'border-primary-fixed-dim bg-surface-container'
          : 'border-outline-variant bg-surface-container-low'
      }`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-surface-container">
          <Icon size={18} className="text-primary-fixed-dim" aria-hidden />
        </div>
        <h3 className="text-sm font-semibold text-on-surface">{content.title}</h3>
      </div>
      <p className="text-xs text-on-surface-variant leading-relaxed">{content.desc}</p>
    </button>
  )
}

// ─── Detail panel (inline below each feature row) ────────────────────────────

function DetailPanel({
  feat, content, onClose,
}: {
  feat: FeatureDef
  content: FeatureDef['de']
  onClose: () => void
}) {
  const Icon = feat.icon
  return (
    <div className="rounded-2xl border border-primary-fixed-dim bg-surface-container p-6">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface-container-high">
            <Icon size={20} className="text-primary-fixed-dim" aria-hidden />
          </div>
          <div>
            <h3 className="font-semibold text-on-surface">{content.title}</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">{content.desc}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail"
          className="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container-high transition-colors"
        >
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="rounded-xl bg-surface-container-low border border-outline-variant flex flex-col items-center justify-center gap-3 py-14">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container border border-outline-variant">
          <Play size={20} className="text-on-surface-variant" aria-hidden />
        </div>
        <p className="text-sm text-on-surface-variant">Demo video — {content.videoLabel}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function B2BPage() {
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null)
  const [techOpen, setTechOpen] = useState(false)

  const { theme, toggleTheme } = useThemeStore()
  const { uiLang, setUiLang } = useLanguageStore()
  const { t } = useTranslation()

  const isDark = theme === 'dark'
  const isEn   = uiLang === 'en'

  const techRows  = isEn ? TECH_ROWS.en : TECH_ROWS.de

  const features            = isDark ? DARK_FEATURES : LIGHT_FEATURES
  const selectedFeatDef     = selectedFeature !== null
    ? features.find(f => f.id === selectedFeature) ?? null
    : null
  const selectedFeatContent = selectedFeatDef
    ? (isEn ? selectedFeatDef.en : selectedFeatDef.de)
    : null

  function getTierContent(tier: TierDef): TierContent {
    const side = isDark ? tier.dark : tier.light
    return isEn ? side.en : side.de
  }

  function handleFeatureToggle(id: string) {
    setSelectedFeature(prev => (prev === id ? null : id))
  }

  return (
    <div className="min-h-screen bg-background text-on-surface" style={isDark ? DARK_BG : LIGHT_BG}>

      {/* ── Sticky nav ────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-surface-container-low/80 backdrop-blur-md border-b border-outline-variant">
        <div className="mx-auto flex h-16 max-w-screen-lg items-center justify-between px-6">

          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-primary-fixed-dim" aria-hidden />
            <span className="text-lg font-bold tracking-tight text-on-surface">YourDemo</span>
          </div>

          <nav className="hidden md:flex items-center gap-1" aria-label="B2B navigation">
            <a href="#features" className="px-3 py-1.5 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              {t.b2b.nav.features}
            </a>
            <a href="#tiers" className="px-3 py-1.5 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              {t.b2b.nav.licensing}
            </a>
            <a href="#contact" className="px-3 py-1.5 rounded-lg text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors">
              {t.b2b.nav.contact}
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="#contact"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary-fixed-dim text-on-primary-container text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t.b2b.nav.cta}
            </a>
            <button
              onClick={() => setUiLang(isEn ? 'de' : 'en')}
              aria-label="Toggle language"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container text-sm font-medium transition-colors"
            >
              <Globe size={14} aria-hidden />
              {isEn ? 'DE' : 'EN'}
            </button>
            <button
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={toggleTheme}
              className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors"
            >
              {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-screen-lg px-6 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-1.5 text-xs font-medium text-on-surface-variant mb-8">
          <Building2 size={12} aria-hidden />
          {t.b2b.hero.badge}
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight">
          {t.b2b.hero.line1}
          <br />
          <span className="text-primary-fixed-dim">
            {isDark ? t.b2b.hero.line2_dark : t.b2b.hero.line2_light}
          </span>
        </h1>

        <p className="mt-6 mx-auto max-w-2xl text-base sm:text-lg text-on-surface-variant leading-relaxed">
          {isDark ? t.b2b.hero.sub_dark : t.b2b.hero.sub_light}
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="#contact"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm hover:opacity-90 active:scale-95 transition-all"
          >
            {t.b2b.hero.cta}
            <ArrowRight size={16} aria-hidden />
          </a>
          <button
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full border border-outline-variant text-on-surface-variant font-semibold text-sm hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all"
          >
            <Play size={16} aria-hidden />
            {t.b2b.hero.video}
          </button>
        </div>
      </section>

      {/* ── Features grid ─────────────────────────────────────────────── */}
      <section id="features" className="mx-auto max-w-screen-lg px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-on-surface">{t.b2b.features.label}</h2>
        </div>

        <div className={`grid gap-4 ${isDark ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
          {features.flatMap((feat) => {
            const card = (
              <div key={feat.id}>
                <FeatureCard
                  feat={feat}
                  content={isEn ? feat.en : feat.de}
                  selected={selectedFeature === feat.id}
                  onToggle={() => handleFeatureToggle(feat.id)}
                />
              </div>
            )
            if (feat.id === selectedFeature && selectedFeatDef && selectedFeatContent) {
              return [
                card,
                <div key={`panel-${feat.id}`} className="col-span-full">
                  <DetailPanel
                    feat={selectedFeatDef}
                    content={selectedFeatContent}
                    onClose={() => setSelectedFeature(null)}
                  />
                </div>,
              ]
            }
            return [card]
          })}
        </div>
      </section>

      {/* ── License tiers ─────────────────────────────────────────────── */}
      <section id="tiers" className="bg-surface-container-lowest py-20">
        <div className="mx-auto max-w-screen-lg px-6">
          <div className="text-center mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-on-surface">{t.b2b.tiers.label}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
            {TIERS.map((tier) => {
              const c    = getTierContent(tier)
              const Icon = tier.icon
              return (
                <div
                  key={tier.key}
                  className={`relative rounded-2xl border-2 p-6 flex flex-col ${TIER_CARD_CLASS[tier.key]}`}
                >
                  {tier.key === 'connect' && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary-fixed-dim text-on-primary-container text-xs font-bold px-3 py-1 whitespace-nowrap">
                      {t.b2b.tiers.popular}
                    </span>
                  )}

                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container mb-4">
                    <Icon size={20} className={TIER_ICON_CLASS[tier.key]} aria-hidden />
                  </div>

                  <h3 className="text-lg font-bold text-on-surface">{c.title}</h3>
                  <p className="text-sm text-on-surface-variant mt-1 mb-6">{c.desc}</p>

                  <ul className="space-y-3 flex-1">
                    {c.items.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm">
                        <Check size={14} className="text-primary-fixed-dim flex-shrink-0 mt-0.5" aria-hidden />
                        <span className={isIncludeLine(item) ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>
                          {item}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <a
                    href="#contact"
                    className={`mt-7 block w-full text-center py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90 active:scale-95 ${
                      tier.key === 'connect'
                        ? 'bg-primary-fixed-dim text-on-primary-container'
                        : 'border border-outline-variant text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {t.b2b.tiers.cta}
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Contact ───────────────────────────────────────────────────── */}
      <section id="contact" className="mx-auto max-w-screen-lg px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-on-surface">{t.b2b.contact.heading}</h2>
          <p className="mt-3 text-on-surface-variant max-w-xl mx-auto">{t.b2b.contact.sub}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CONTACT.map(({ icon: Icon, label, value, href }) => (
            <a
              key={label}
              href={href}
              target={href.startsWith('http') ? '_blank' : undefined}
              rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
              className="group flex flex-col items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-low p-6 text-center hover:border-primary-fixed-dim hover:bg-surface-container transition-all"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container group-hover:bg-surface-container-high transition-colors">
                <Icon size={20} className="text-primary-fixed-dim" aria-hidden />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">{label}</p>
                <p className="mt-1 text-sm font-medium text-on-surface">{value}</p>
              </div>
            </a>
          ))}
        </div>
      </section>

      {/* ── Technical details (accordion) ─────────────────────────────── */}
      <section className="mx-auto max-w-screen-lg px-6 pb-16">
        <div className="rounded-2xl border border-outline-variant bg-surface-container-low overflow-hidden">
          <button
            onClick={() => setTechOpen(v => !v)}
            aria-expanded={techOpen}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-surface-container transition-colors"
          >
            <span className="text-sm font-semibold text-on-surface">{t.b2b.tech.toggle}</span>
            <ChevronDown
              size={18}
              aria-hidden
              className={`text-on-surface-variant flex-shrink-0 transition-transform duration-200 ${techOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {techOpen && (
            <div className="border-t border-outline-variant px-6 py-6">
              <h3 className="text-sm font-semibold text-on-surface mb-5">{t.b2b.tech.heading}</h3>
              <dl className="space-y-4">
                {techRows.map(({ label, value }) => (
                  <div
                    key={label}
                    className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-1 sm:gap-6 sm:items-baseline"
                  >
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                      {label}
                    </dt>
                    <dd className="font-mono text-xs text-on-surface leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </section>

    </div>
  )
}
