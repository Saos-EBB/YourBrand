'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  MapPin, Users, UserRoundX, ChevronDown,
} from 'lucide-react'
import { fetchApi } from '@/lib/api'
import { OnlineIndicator, getStatusColor } from '@/components/ui/OnlineIndicator'
import { useConnectionAction, type ConnectionStatus } from '@/hooks/useConnectionAction'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { useTranslation } from '@/lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProfileInterest {
  id: string
  name_de: string
  category: string | null
}

interface SearchProfile {
  id: string
  user_id: string
  nickname: string
  birthdate: string | null
  city: string | null
  bio: string | null
  photo_url: string | null
  photo_needs_review?: boolean
  is_online: boolean
  status_message: string | null
  gender: string | null
  looking_for: string | null
  interests: ProfileInterest[]
  onboarding_completed: boolean
  is_published: boolean
  connection_status: ConnectionStatus
  conversation_id: string | null
  request_id: string | null
}

// ─── Search Tab ───────────────────────────────────────────────────────────────

const DEFAULT_FILTERS = {
  city: '',
  lat: null as number | null,
  lng: null as number | null,
  radius: 50,
  gender: '',
  looking_for: '',
  min_age: '',
  max_age: '',
  online_only: false,
  connection_status: '',
}

function calcAge(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null
  return Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function buildQuery(f: typeof DEFAULT_FILTERS): string {
  const params = new URLSearchParams()
  if (f.lat != null) {
    params.set('lat', String(f.lat))
    params.set('lng', String(f.lng))
    params.set('radius', String(f.radius))
  } else if (f.city.trim()) {
    params.set('city', f.city.trim())
  }
  if (f.gender)             params.set('gender', f.gender)
  if (f.looking_for)        params.set('looking_for', f.looking_for)
  if (f.min_age)            params.set('min_age', f.min_age)
  if (f.max_age)            params.set('max_age', f.max_age)
  if (f.online_only)        params.set('online_only', 'true')
  if (f.connection_status)  params.set('connection_status', f.connection_status)
  const qs = params.toString()
  return qs ? `/profile/search?${qs}` : '/profile/search'
}

function Spinner() {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-on-primary-container/30 border-t-on-primary-container animate-spin" aria-hidden />
      Sende…
    </span>
  )
}

function SearchProfileCard({
  profile,
  onUpdate,
}: {
  profile: SearchProfile
  onUpdate: (userId: string, changes: Partial<SearchProfile>) => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false)
  const conn = useConnectionAction(
    profile.user_id,
    profile.connection_status ?? 'NONE',
    profile.request_id,
    profile.conversation_id,
  )

  async function handleConnect() {
    if (await conn.sendRequest()) {
      onUpdate(profile.user_id, { connection_status: 'SENT' })
    }
  }

  async function handleAccept() {
    const convId = await conn.acceptRequest()
    if (convId !== null) {
      onUpdate(profile.user_id, { connection_status: 'CONNECTED', conversation_id: convId, request_id: null })
    }
  }

  async function handleDisconnect() {
    if (await conn.disconnect()) {
      onUpdate(profile.user_id, { connection_status: 'NONE', conversation_id: null })
      setDisconnectConfirmOpen(false)
    }
  }

  const age = calcAge(profile.birthdate)

  function renderAction() {
    const cs = conn.connectionStatus
    if (cs === 'CONNECTED') {
      return (
        <div className="space-y-2">
          <button
            onClick={() => conn.conversationId && router.push(`/chat/${conn.conversationId}`)}
            disabled={!conn.conversationId}
            className="w-full py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container text-xs sm:text-sm font-semibold min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {t.publicProfile.chat}
          </button>
          <button
            onClick={() => setDisconnectConfirmOpen(true)}
            className="w-full py-2.5 rounded-full border border-outline-variant text-on-surface-variant text-xs sm:text-sm font-medium min-h-[44px] hover:bg-surface-container-high active:scale-95 transition-all"
          >
            {t.discover.disconnectLabel}
          </button>
        </div>
      )
    }
    if (cs === 'SENT') {
      return (
        <div className="w-full py-2.5 rounded-full bg-surface-container-high text-primary-fixed-dim text-xs sm:text-sm font-semibold text-center" role="status">
          {t.discover.requestSent}
        </div>
      )
    }
    if (cs === 'RECEIVED') {
      return (
        <button
          onClick={handleAccept}
          disabled={conn.isLoading}
          className="w-full py-2.5 rounded-full bg-tertiary-fixed-dim text-on-primary-container text-xs sm:text-sm font-semibold min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {conn.isLoading ? <Spinner /> : t.discover.acceptRequest}
        </button>
      )
    }
    return (
      <button
        onClick={handleConnect}
        disabled={conn.isLoading}
        className="w-full py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container text-xs sm:text-sm font-semibold min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {conn.isLoading ? <Spinner /> : t.publicProfile.connect}
      </button>
    )
  }

  return (
    <article className="rounded-2xl bg-surface-container border border-outline-variant overflow-hidden flex flex-col">
      <div className="aspect-[3/4] bg-surface-container-high flex items-center justify-center overflow-hidden relative" aria-hidden>
        {profile.photo_url ? (
          <img
            src={profile.photo_url.replace('http://localhost:3000', '')}
            alt=""
            loading="lazy"
            className={`h-full w-full object-cover${profile.photo_needs_review ? ' blur-sm' : ''}`}
          />
        ) : (
          <Users className="h-10 w-10 text-outline" />
        )}
        {profile.photo_needs_review && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-error/80 text-white text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm whitespace-nowrap pointer-events-none">
            {t.publicProfile.underReview}
          </div>
        )}
        {profile.is_online && (
          <span
            className="absolute bottom-2 right-2 h-3.5 w-3.5 rounded-full ring-2 ring-surface-container"
            style={{ backgroundColor: getStatusColor(profile.is_online, profile.status_message) }}
            aria-hidden
          />
        )}
      </div>

      <div className="p-3 sm:p-4 flex flex-col gap-3 flex-1">
        <div>
          <p className="font-semibold text-on-surface text-sm sm:text-base leading-tight">
            <Link href={`/profile/${profile.nickname}`} className="hover:underline cursor-pointer">
              {profile.nickname}
            </Link>
            {age !== null && `, ${age}`}
          </p>
          {profile.city && (
            <div className="flex items-center gap-1 mt-1">
              <MapPin className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-on-surface-variant flex-shrink-0" aria-hidden />
              <p className="text-xs text-on-surface-variant truncate">{profile.city}</p>
            </div>
          )}
          {profile.status_message && (
            <div className="mt-1">
              <OnlineIndicator is_online={profile.is_online} status_message={profile.status_message} size="sm" />
            </div>
          )}
        </div>

        {profile.interests.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profile.interests.slice(0, 3).map((i) => (
              <span key={i.id} className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-medium">
                {i.name_de}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto space-y-2">
          {renderAction()}
          {conn.error && <p className="text-xs text-error text-center leading-tight" role="alert">{conn.error}</p>}
        </div>
      </div>

      {disconnectConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
          <div className="bg-surface-container-high rounded-2xl p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="font-semibold text-on-surface">{t.publicProfile.disconnectTitle}</p>
              <p className="text-sm text-on-surface-variant">{t.discover.disconnectDesc}</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <button
                onClick={handleDisconnect}
                disabled={conn.isLoading}
                className="flex-1 py-3 rounded-full bg-error-container text-error font-semibold text-sm min-h-[44px] hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {conn.isLoading && <span className="h-3.5 w-3.5 rounded-full border-2 border-error/30 border-t-error animate-spin" aria-hidden />}
                {t.publicProfile.disconnect}
              </button>
              <button
                onClick={() => setDisconnectConfirmOpen(false)}
                disabled={conn.isLoading}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold text-sm min-h-[44px] hover:bg-surface-container active:scale-95 disabled:opacity-50 transition-all"
              >
                {t.common.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant overflow-hidden animate-pulse">
      <div className="aspect-[3/4] bg-surface-container-high" />
      <div className="p-3 sm:p-4 space-y-3">
        <div className="space-y-1.5">
          <div className="h-4 w-24 rounded-lg bg-surface-container-high" />
          <div className="h-3 w-16 rounded-lg bg-surface-container-high" />
        </div>
        <div className="h-11 w-full rounded-full bg-surface-container-high" />
      </div>
    </div>
  )
}

function SearchTab() {
  const { t } = useTranslation()
  const [profiles, setProfiles] = useState<SearchProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)

  const receivedCount = profiles.filter(p => p.connection_status === 'RECEIVED').length

  async function loadProfiles(f: typeof DEFAULT_FILTERS) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchApi<SearchProfile[] | { data: SearchProfile[] }>(buildQuery(f))
      setProfiles(Array.isArray(res) ? res : (res?.data ?? []))
    } catch (err) {
      if (err instanceof Error && err.message === 'Session expired') return
      setError(err instanceof Error ? err.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadProfiles(DEFAULT_FILTERS) }, [])

  function handleProfileUpdate(userId: string, changes: Partial<SearchProfile>) {
    setProfiles(ps => ps.map(p => p.user_id === userId ? { ...p, ...changes } : p))
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="col-span-2 relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none z-10" aria-hidden />
            <CityAutocomplete
              value={filters.city}
              onSelect={(city) => setFilters(f => ({ ...f, city: city.name, lat: Number(city.lat), lng: Number(city.lng) }))}
              onClear={() => setFilters(f => ({ ...f, city: '', lat: null, lng: null }))}
              placeholder={t.discover.cityPlaceholder}
              ariaLabel={t.discover.cityAriaLabel}
              inputClassName="w-full pl-9 pr-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors"
            />
          </div>
          <div className="relative">
            <select
              value={filters.gender}
              onChange={(e) => setFilters(f => ({ ...f, gender: e.target.value }))}
              className="w-full appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors cursor-pointer"
              aria-label="Nach Geschlecht filtern"
            >
              <option value="">{t.discover.filterAll}</option>
              <option value="male">{t.onboarding.genderMale}</option>
              <option value="female">{t.onboarding.genderFemale}</option>
              <option value="non_binary">{t.onboarding.genderNonBinary}</option>
              <option value="diverse">{t.onboarding.genderDiverse}</option>
              <option value="not_specified">{t.onboarding.noChoice}</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              value={filters.looking_for}
              onChange={(e) => setFilters(f => ({ ...f, looking_for: e.target.value }))}
              className="w-full appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors cursor-pointer"
              aria-label="Nach Suchanliegen filtern"
            >
              <option value="">{t.discover.filterAll}</option>
              <option value="friendship">{t.publicProfile.lookingForFriendship}</option>
              <option value="relationship">{t.publicProfile.lookingForRelationship}</option>
              <option value="exchange">{t.publicProfile.lookingForExchange}</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" aria-hidden />
          </div>
        </div>

        <div className={`flex items-center gap-3${filters.lat == null ? ' opacity-40' : ''}`}>
          <MapPin className="h-4 w-4 text-on-surface-variant flex-shrink-0" aria-hidden />
          <input
            type="range" min={10} max={5000} step={10} value={filters.radius}
            disabled={filters.lat == null}
            onChange={(e) => setFilters(f => ({ ...f, radius: Number(e.target.value) }))}
            className="flex-1 accent-primary-fixed-dim disabled:cursor-not-allowed"
            aria-label="Umkreis in km"
          />
          <span className="text-sm text-on-surface-variant w-40 text-right">
            {filters.lat != null
              ? t.discover.radiusWithCity.replace('{radius}', String(filters.radius))
              : t.discover.radiusNoCity}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number" value={filters.min_age}
            onChange={(e) => setFilters(f => ({ ...f, min_age: e.target.value }))}
            placeholder={t.discover.ageFrom} min={18} max={99}
            className="w-[7.5rem] px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors"
            aria-label="Mindestalter"
          />
          <span className="text-on-surface-variant text-sm" aria-hidden>–</span>
          <input
            type="number" value={filters.max_age}
            onChange={(e) => setFilters(f => ({ ...f, max_age: e.target.value }))}
            placeholder={t.discover.ageTo} min={18} max={99}
            className="w-[7.5rem] px-3 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors"
            aria-label="Höchstalter"
          />
          <div className="relative">
            <select
              value={filters.connection_status}
              onChange={(e) => setFilters(f => ({ ...f, connection_status: e.target.value }))}
              className="appearance-none pl-3 pr-8 py-2.5 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim min-h-[44px] transition-colors cursor-pointer"
              aria-label="Nach Verbindungsstatus filtern"
            >
              <option value="">{t.discover.connectionAll}</option>
              <option value="CONNECTED">{t.discover.connectedFilter}</option>
              <option value="SENT">{t.discover.requestSent}</option>
              <option value="RECEIVED">
                {receivedCount > 0 ? `${t.discover.requestReceived} (${receivedCount})` : t.discover.requestReceived}
              </option>
              <option value="NONE">{t.discover.noConnection}</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none" aria-hidden />
          </div>
          <label className="flex items-center gap-2 cursor-pointer select-none ml-1">
            <input type="checkbox" checked={filters.online_only}
              onChange={(e) => setFilters(f => ({ ...f, online_only: e.target.checked }))}
              className="sr-only"
            />
            <span className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ${filters.online_only ? 'bg-primary-fixed-dim' : 'bg-surface-container-highest'}`}>
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-sm ring-0 transition duration-200 ease-in-out ${filters.online_only ? 'translate-x-4' : 'translate-x-0'}`} />
            </span>
            <span className="text-sm text-on-surface whitespace-nowrap">{t.discover.onlineNow}</span>
          </label>
          <div className="flex-1" />
          <button onClick={() => { setFilters(DEFAULT_FILTERS); loadProfiles(DEFAULT_FILTERS) }}
            className="px-4 py-2.5 rounded-full border border-outline-variant text-on-surface-variant text-sm font-medium min-h-[44px] hover:bg-surface-container-high transition-colors">
            {t.discover.reset}
          </button>
          <button onClick={() => loadProfiles(filters)} disabled={loading}
            className="px-4 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container text-sm font-semibold min-h-[44px] hover:opacity-90 disabled:opacity-50 transition-opacity">
            {t.discover.applyFilter}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" aria-busy="true">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3" role="alert">
          <UserRoundX className="h-12 w-12 text-error" aria-hidden />
          <p className="text-on-surface font-semibold">Fehler beim Laden</p>
          <p className="text-on-surface-variant text-sm">{error}</p>
          <button onClick={() => loadProfiles(filters)}
            className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity">
            Erneut versuchen
          </button>
        </div>
      ) : profiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
          <Users className="h-12 w-12 text-on-surface-variant" aria-hidden />
          <p className="text-on-surface font-semibold">Keine Profile gefunden</p>
          <p className="text-on-surface-variant text-sm">Versuche andere Filtereinstellungen</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4" role="list">
          {profiles.map((profile) => (
            <SearchProfileCard key={profile.id} profile={profile} onUpdate={handleProfileUpdate} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiscoverPage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 pb-24 sm:pb-8 space-y-5">
      <h1 className="text-2xl font-bold text-on-surface">{t.discover.title}</h1>
      <SearchTab />
    </main>
  )
}
