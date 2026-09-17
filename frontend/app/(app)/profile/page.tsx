'use client'

import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2, AlertCircle, Camera, ChevronDown, Mic, Square, Upload, Clock, CheckCircle2, XCircle, Trash2, LogOut } from 'lucide-react'
import { fetchApi, normalise } from '@/lib/api'
import { useAuthStore } from '@/lib/store/authStore'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import AudioPlayer from '@/components/ui/AudioPlayer'
import { useTranslation } from '@/lib/i18n'
import { CityAutocomplete } from '@/components/ui/CityAutocomplete'
import { useHiddenStore } from '@/lib/store/hiddenStore'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  userId: string
  nickname: string
  birthdate: string | null
  city: string | null
  bio: string | null
  photoUrl: string | null
  photoNeedsReview: boolean
  audioUrl: string | null
  audioModerationStatus: string | null
  gender: string | null
  lookingFor: string | null
  onboardingCompleted: boolean
  isPublished: boolean
  statusVisible: boolean
  statusMessage: string | null
  nicknameChangedAt?: string | null
  genderChangedAt?: string | null
}

type AudioStatus = 'none' | 'recording' | 'preview' | 'uploading' | 'pending' | 'approved' | 'rejected'

function formatTimer(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface Interest {
  id: string
  name_de: string
  name_en: string | null
  category: string | null
}

interface UserInterest {
  id: string
  user_id: string
  interest_id: string
  is_green: boolean
  interest: Interest
}

function calcAge(birthdate: string): number {
  return Math.floor((Date.now() - new Date(birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
}

function formatGermanDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { t } = useTranslation()

  const accessToken = useAuthStore((s) => s.accessToken)
  const hasFetched  = useRef(false)
  const isHidden = useHiddenStore((s) => s.isHidden)
  const [exileUntil, setExileUntil] = useState<string | null>(null)
  const [leavingExile, setLeavingExile] = useState(false)
  const [hiddenStats, setHiddenStats] = useState<{
    balance: number
    teeth: number
    chains: number
    chicken_count: number
    badges: { id: string; type: string; expires_at: string }[]
  } | null>(null)

  const [profile, setProfile]             = useState<Profile | null>(null)
  const [userInterests, setUserInterests] = useState<UserInterest[]>([])
  const [allInterests, setAllInterests]   = useState<Interest[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)

  const [editMode, setEditMode]   = useState(false)
  const [draft, setDraft]         = useState({
    nickname: '', bio: '', city: '', gender: '', looking_for: '', is_published: false,
  })
  const [cityCoords, setCityCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [showNicknameConfirm, setShowNicknameConfirm] = useState(false)
  const [showGenderConfirm, setShowGenderConfirm]     = useState(false)

  const [interestLoading, setInterestLoading] = useState<string | null>(null)

  const originalNickname = useRef<string>('')
  const originalGender   = useRef<string>('')

  const fileInputRef                                  = useRef<HTMLInputElement>(null)
  const [photoUploading, setPhotoUploading]           = useState(false)
  const [photoPickError, setPhotoPickError]           = useState<string | null>(null)
  const [photoUrl, setPhotoUrl]                       = useState<string | null>(null)
  const [pendingPhotoFile, setPendingPhotoFile]       = useState<File | null>(null)
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null)

  const [audioStatus, setAudioStatus] = useState<AudioStatus>('none')
  const [audioUrl, setAudioUrl]       = useState<string | null>(null)
  const [audioBlob, setAudioBlob]     = useState<Blob | null>(null)
  const [audioTimer, setAudioTimer]   = useState(0)
  const [audioError, setAudioError]   = useState<string | null>(null)
  const mediaRecorderRef   = useRef<MediaRecorder | null>(null)
  const audioChunksRef     = useRef<Blob[]>([])
  const timerIntervalRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef          = useRef<MediaStream | null>(null)
  const audioFileRef       = useRef<HTMLInputElement>(null)

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!accessToken || hasFetched.current) return
    hasFetched.current = true

    async function load() {
      try {
        const [prof, ui, ai] = await Promise.all([
          fetchApi<Profile>('/profile/me'),
          fetchApi<UserInterest[] | { data: UserInterest[] }>('/profile/me/interests'),
          fetchApi<Interest[] | { data: Interest[] }>('/profile/interests'),
        ])
        setProfile(prof)
        if (prof.photoUrl) {
          try { setPhotoUrl(new URL(prof.photoUrl).pathname) } catch { setPhotoUrl(prof.photoUrl) }
        }
        if (prof.audioUrl) {
          if (prof.audioModerationStatus === 'approved') {
            setAudioStatus('approved')
            try { setAudioUrl(new URL(prof.audioUrl).pathname) } catch { setAudioUrl(prof.audioUrl) }
          } else if (prof.audioModerationStatus === 'pending') {
            setAudioStatus('pending')
          } else if (prof.audioModerationStatus === 'rejected') {
            setAudioStatus('rejected')
          }
        }
        setUserInterests(normalise(ui))
        setAllInterests(normalise(ai))
      } catch (err) {
        if (err instanceof Error && err.message === 'Session expired') return
        setError(err instanceof Error ? err.message : t.common.error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [accessToken])

  useEffect(() => {
    if (!isHidden) return
    fetchApi<{ in_exile: boolean; exile_until: string | null }>(
      '/hidden/beef/exile/status'
    ).then(r => setExileUntil(r.in_exile ? r.exile_until : null))
    .catch(() => {})
  }, [isHidden])

  useEffect(() => {
    if (!isHidden) return
    Promise.all([
      fetchApi<number>('/hidden/coin/balance'),
      fetchApi<any[]>('/hidden/teeth'),
      fetchApi<any[]>('/hidden/teeth/chains'),
      fetchApi<any[]>('/hidden/badge/mine'),
    ]).then(([balance, teeth, chains, badges]) => {
      setHiddenStats({
        balance: typeof balance === 'number' ? balance : 0,
        teeth: Array.isArray(teeth) ? teeth.length : 0,
        chains: Array.isArray(chains) ? chains.length : 0,
        chicken_count: 0,
        badges: Array.isArray(badges) ? badges : [],
      })
    }).catch(() => {})
  }, [isHidden])

  async function handleLeaveExile() {
    setLeavingExile(true)
    try {
      await fetchApi('/hidden/beef/exile/leave', { method: 'POST' })
      setExileUntil(null)
    } catch {}
    finally { setLeavingExile(false) }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  function startEdit() {
    if (!profile) return
    originalNickname.current = profile.nickname    ?? ''
    originalGender.current   = profile.gender      ?? ''
    setDraft({
      nickname:     profile.nickname    ?? '',
      bio:          profile.bio         ?? '',
      city:         profile.city        ?? '',
      gender:       profile.gender      ?? '',
      looking_for:  profile.lookingFor ?? '',
      is_published: profile.isPublished,
    })
    setSaveError(null)
    setPhotoPickError(null)
    setEditMode(true)
  }

  function cancelEdit() {
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
    setPendingPhotoFile(null)
    setPendingPhotoPreview(null)
    setPhotoPickError(null)
    setSaveError(null)
    setEditMode(false)
  }

  async function handleLogout() {
    try {
      await fetchApi('/auth/logout', { method: 'POST' })
    } catch {
      // backend unreachable — still clear local state
    }
    useAuthStore.getState().logout()
  }

  async function handleSave() {
    if (!profile || !draft.nickname.trim()) return
    if (draft.nickname !== originalNickname.current) {
      setShowNicknameConfirm(true)
      return
    }
    if (draft.gender !== originalGender.current) {
      setShowGenderConfirm(true)
      return
    }
    await performSave()
  }

  async function performSave() {
    if (!profile || !draft.nickname.trim()) return
    setShowNicknameConfirm(false)
    setShowGenderConfirm(false)
    setSaving(true)
    setSaveError(null)
    try {
      if (pendingPhotoFile) {
        setPhotoUploading(true)
        try {
          const formData = new FormData()
          formData.append('file', pendingPhotoFile)
          const data = await fetchApi<{ file_url: string; id: string }>('/media/upload/profile-photo', {
            method: 'POST',
            body: formData,
          })
          URL.revokeObjectURL(pendingPhotoPreview!)
          setPendingPhotoFile(null)
          setPendingPhotoPreview(null)
          setPhotoUrl(new URL(data.file_url).pathname)
          setProfile((prev) => prev ? { ...prev, photo_id: data.id } : prev)
        } finally {
          setPhotoUploading(false)
        }
      }

      const payload: Record<string, unknown> = {
        nickname:     draft.nickname,
        bio:          draft.bio,
        city:         draft.city,
        is_published: draft.is_published,
      }
      if (draft.gender)      payload.gender      = draft.gender
      if (draft.looking_for) payload.looking_for = draft.looking_for
      if (cityCoords) { payload.lat = cityCoords.lat; payload.lng = cityCoords.lng }

      await fetchApi<Profile>('/profile/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
      const refreshed = await fetchApi<Profile>('/profile/me')
      setProfile(refreshed)
      if (refreshed.photoUrl) {
        try { setPhotoUrl(new URL(refreshed.photoUrl).pathname) } catch { setPhotoUrl(refreshed.photoUrl) }
      }
      setEditMode(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : t.common.error
      setSaveError(
        msg.toLowerCase().includes('einmal pro jahr')
          ? 'Änderung nicht möglich — du hast dieses Feld bereits dieses Jahr geändert.'
          : msg
      )
    } finally {
      setSaving(false)
    }
  }

  // ── Interests ────────────────────────────────────────────────────────────

  async function handleToggleInterest(interestId: string) {
    if (interestLoading) return
    setInterestLoading(interestId)
    const existing = userInterests.find((ui) => ui.interest_id === interestId)
    try {
      if (!existing) {
        // unselected → add as green
        const updated = await fetchApi<UserInterest[] | { data: UserInterest[] }>(`/profile/me/interests/${interestId}`, { method: 'POST' })
        setUserInterests(normalise(updated))
        const refreshed = await fetchApi<Profile>('/profile/me')
        setProfile(refreshed)
      } else if (existing.is_green) {
        // green → red
        const updated = await fetchApi<UserInterest[] | { data: UserInterest[] }>(`/profile/me/interests/${interestId}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_green: false }),
        })
        setUserInterests(normalise(updated))
      } else {
        // red → remove
        const updated = await fetchApi<UserInterest[] | { data: UserInterest[] }>(`/profile/me/interests/${interestId}`, { method: 'DELETE' })
        setUserInterests(normalise(updated))
      }
    } catch {
      // silent — user can retry
    } finally {
      setInterestLoading(null)
    }
  }

  // ── Photo select ─────────────────────────────────────────────────────────

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoPickError(t.onboarding.photoTypeError)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoPickError(t.onboarding.photoSizeError)
      return
    }
    setPhotoPickError(null)
    if (pendingPhotoPreview) URL.revokeObjectURL(pendingPhotoPreview)
    setPendingPhotoFile(file)
    setPendingPhotoPreview(URL.createObjectURL(file))
  }

  // ── Audio ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current !== null) clearInterval(timerIntervalRef.current)
      streamRef.current?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  function clearTimer() {
    if (timerIntervalRef.current !== null) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  async function startRecording() {
    setAudioError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        setAudioStatus('preview')
        stream.getTracks().forEach((tr) => tr.stop())
        streamRef.current = null
      }

      recorder.start()
      setAudioStatus('recording')
      setAudioTimer(0)
      let tick = 0
      timerIntervalRef.current = setInterval(() => {
        tick++
        setAudioTimer(tick)
        if (tick >= 45) {
          clearTimer()
          if (recorder.state !== 'inactive') recorder.stop()
        }
      }, 1000)
    } catch {
      setAudioError(t.profile.micUnavailable)
    }
  }

  function stopRecording() {
    clearTimer()
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
  }

  function discardAudio() {
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setAudioTimer(0)
    setAudioError(null)
    setAudioStatus('none')
  }

  async function uploadAudio() {
    if (!audioBlob) return
    setAudioStatus('uploading')
    setAudioError(null)
    const base = (audioBlob as File).type || 'audio/webm'
    const ext = base.startsWith('audio/ogg') ? '.ogg'
              : base.startsWith('audio/mp4') ? '.m4a'
              : base.startsWith('audio/wav') ? '.wav'
              : base.startsWith('audio/mpeg') ? '.mp3'
              : '.webm'
    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, `recording${ext}`)
      await fetchApi<void>('/profile/audio', { method: 'POST', body: formData })
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
      setAudioBlob(null)
      setAudioUrl(null)
      setAudioStatus('pending')
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : t.common.error)
      setAudioStatus('preview')
    }
  }

  async function deleteAudio() {
    try {
      await fetchApi<void>('/profile/audio', { method: 'DELETE' })
      if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
      setAudioUrl(null)
      setAudioBlob(null)
      setAudioStatus('none')
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : t.common.error)
    }
  }

  function handleAudioFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setAudioError(t.onboarding.photoSizeError)
      return
    }
    setAudioError(null)
    if (audioUrl?.startsWith('blob:')) URL.revokeObjectURL(audioUrl)
    setAudioBlob(file)
    setAudioUrl(URL.createObjectURL(file))
    setAudioStatus('preview')
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedInterestMap = new Map(userInterests.map((ui) => [ui.interest_id, ui.is_green]))

  const nicknameChangedAt = profile?.nicknameChangedAt ?? null
  const nicknameChangedWithinYear = nicknameChangedAt
    ? Date.now() - new Date(nicknameChangedAt).getTime() < 365 * 24 * 60 * 60 * 1000
    : false
  const nicknameChangesRemaining = nicknameChangedWithinYear ? 0 : 1

  const genderChangedAt = profile?.genderChangedAt ?? null
  const genderChangedWithinYear = genderChangedAt
    ? Date.now() - new Date(genderChangedAt).getTime() < 365 * 24 * 60 * 60 * 1000
    : false
  const genderChangesRemaining = genderChangedWithinYear ? 0 : 1

  // ── Loading / error ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 text-on-surface-variant animate-spin" aria-label={t.common.loading} />
      </main>
    )
  }

  if (error || !profile) {
    return (
      <main className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <AlertCircle className="h-10 w-10 text-error" aria-hidden="true" />
        <p className="text-on-surface font-semibold">{t.profile.loadError}</p>
        <p className="text-on-surface-variant text-sm">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold text-sm min-h-[44px] hover:opacity-90 transition-opacity"
        >
          {t.common.retry}
        </button>
      </main>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const displayPhoto = pendingPhotoPreview ?? photoUrl

  return (
    <main className="min-h-screen bg-background pb-28 md:pb-8">
      <div className="max-w-md mx-auto px-6 py-8">
        <div className="flex flex-col items-center">

          {/* ── Photo ──────────────────────────────────────────────────────── */}
          <div className="relative w-full aspect-square mb-5">
            {displayPhoto ? (
              <img
                src={displayPhoto}
                alt={t.profile.profilePhoto}
                loading="lazy"
                className={`w-full h-full object-cover rounded-3xl${profile.photoNeedsReview && !pendingPhotoPreview ? ' ring-2 ring-error' : ''}`}
              />
            ) : (
              <div className="w-full h-full rounded-3xl bg-surface-container-high flex items-center justify-center">
                <span className="text-8xl font-bold text-on-surface-variant select-none">
                  {profile.nickname.charAt(0).toUpperCase()}
                </span>
              </div>
            )}

            {profile.photoNeedsReview && !pendingPhotoPreview && photoUrl && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-error/80 text-white text-xs font-semibold px-3 py-1.5 rounded-full backdrop-blur-sm whitespace-nowrap pointer-events-none">
                {t.profile.underReview}
              </div>
            )}

            {editMode && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="absolute inset-0 rounded-3xl bg-black/40 flex items-center justify-center focus:outline-none disabled:cursor-not-allowed"
                aria-label={t.profile.profilePhoto}
              >
                {photoUploading ? (
                  <Loader2 className="h-10 w-10 text-white animate-spin" aria-hidden="true" />
                ) : (
                  <Camera className="h-10 w-10 text-white/80" aria-hidden="true" />
                )}
              </button>
            )}

            {/* Nickname + age — bottom left */}
            <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl">
              {editMode ? (
                <input
                  type="text"
                  value={draft.nickname}
                  onChange={(e) => setDraft((d) => ({ ...d, nickname: e.target.value }))}
                  maxLength={50}
                  className="bg-transparent text-white text-xl font-bold w-32 focus:outline-none placeholder-white/50 border-b border-white/30"
                  placeholder="Nickname"
                  aria-label="Nickname"
                />
              ) : (
                <h1 className="text-2xl font-bold text-white leading-tight">{profile.nickname}</h1>
              )}
              {profile.birthdate && (
                <p className="text-sm text-white/70 mt-0.5">{calcAge(profile.birthdate)} {t.common.years}</p>
              )}
            </div>

            {/* Location + online — bottom right */}
            <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-sm px-3 py-2 rounded-xl">
              <div className="flex items-center gap-1.5 text-white text-sm mb-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                {editMode ? (
                  <CityAutocomplete
                    value={draft.city}
                    onSelect={(city) => {
                      setDraft((d) => ({ ...d, city: city.name }))
                      setCityCoords({ lat: city.lat, lng: city.lng })
                    }}
                    placeholder={t.onboarding.city}
                    ariaLabel={t.onboarding.city}
                    inputClassName="bg-transparent text-white text-sm w-32 focus:outline-none placeholder-white/50 border-b border-white/30"
                  />
                ) : (
                  <span>{profile.city ?? '—'}</span>
                )}
              </div>
              <OnlineIndicator
                is_online={profile.statusVisible}
                status_message={profile.statusMessage}
                size="sm"
              />
            </div>
          </div>

          {isHidden && exileUntil && (
            <div className="flex items-center justify-between bg-surface-container border border-error/30 rounded-2xl px-4 py-3 mb-4">
              <div>
                <p className="text-sm font-semibold text-error">⛓️ Im Exil</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  bis {new Date(exileUntil).toLocaleString('de-AT',
                    { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                </p>
              </div>
              <button
                onClick={handleLeaveExile}
                disabled={leavingExile}
                className="px-4 py-2 rounded-lg bg-error/20 border border-error/30 text-error text-sm font-semibold disabled:opacity-40 transition-opacity hover:bg-error/30"
              >
                {leavingExile ? '...' : 'Verlassen'}
              </button>
            </div>
          )}

          {editMode && draft.nickname !== originalNickname.current && (
            <p className="w-full text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2 mb-1" role="alert">
              ⚠ Achtung: Du kannst deinen Nickname nur einmal pro Jahr ändern.
            </p>
          )}

          {photoPickError && (
            <p className="text-xs text-error mb-3 self-start" role="alert">{photoPickError}</p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handlePhotoSelect}
            aria-hidden="true"
          />

          {editMode && (
            <p className="text-xs text-on-surface-variant text-center -mt-2 mb-2">
              Dein Foto wird mit deiner Profil-ID markiert zum Schutz vor Missbrauch.
            </p>
          )}

          {/* ── Gender + looking_for (edit mode) ──────────────────────────── */}
          {editMode && (
            <div className="w-full space-y-3 mb-5">
              <div className="space-y-1.5">
                <div className="relative">
                  <select
                    value={draft.gender}
                    onChange={(e) => setDraft((d) => ({ ...d, gender: e.target.value }))}
                    className="w-full appearance-none pl-4 pr-8 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim transition-colors cursor-pointer"
                    aria-label={t.onboarding.gender}
                  >
                    <option value="">{t.onboarding.gender} — {t.onboarding.noChoice}</option>
                    <option value="male">{t.onboarding.genderMale}</option>
                    <option value="female">{t.onboarding.genderFemale}</option>
                    <option value="non_binary">{t.onboarding.genderNonBinary}</option>
                    <option value="diverse">{t.onboarding.genderDiverse}</option>
                  </select>
                  <ChevronDown
                    className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none"
                    aria-hidden="true"
                  />
                </div>
                {draft.gender !== originalGender.current && (
                  <p className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/30 rounded-xl px-3 py-2" role="alert">
                    ⚠ Achtung: Du kannst dein Geschlecht nur einmal pro Jahr ändern.
                  </p>
                )}
              </div>
              <div className="relative">
                <select
                  value={draft.looking_for}
                  onChange={(e) => setDraft((d) => ({ ...d, looking_for: e.target.value }))}
                  className="w-full appearance-none pl-4 pr-8 py-3 rounded-2xl bg-surface-container border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim transition-colors cursor-pointer"
                  aria-label={t.onboarding.lookingFor}
                >
                  <option value="">{t.onboarding.lookingFor} — {t.onboarding.noChoice}</option>
                  <option value="friendship">{t.onboarding.lookingForFriendship}</option>
                  <option value="relationship">{t.onboarding.lookingForRelationship}</option>
                  <option value="exchange">{t.onboarding.lookingForExchange}</option>
                  <option value="all">{t.onboarding.lookingForAll}</option>
                </select>
                <ChevronDown
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-on-surface-variant pointer-events-none"
                  aria-hidden="true"
                />
              </div>
            </div>
          )}

          {/* ── Audio ────────────────────────────────────────────────────── */}
          <div className="w-full mb-5">
            <p className="text-xs font-medium text-on-surface-variant uppercase tracking-wide text-center mb-3">
              {t.profile.audioSection}
            </p>

            {audioStatus === 'none' && editMode && (
              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  type="button"
                  onClick={startRecording}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors min-h-[44px]"
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  {t.profile.record}
                </button>
                <button
                  type="button"
                  onClick={() => audioFileRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors min-h-[44px]"
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  {t.profile.chooseFile}
                </button>
              </div>
            )}

            {audioStatus === 'recording' && (
              <div className="flex items-center justify-center gap-4">
                <span className="flex items-center gap-2 text-error font-medium text-sm">
                  <span className="h-2 w-2 rounded-full bg-error animate-pulse" aria-hidden="true" />
                  {formatTimer(audioTimer)}
                  <span className="text-on-surface-variant text-xs font-normal">/ 00:45</span>
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-error-container text-error text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  {t.profile.stop}
                </button>
              </div>
            )}

            {audioStatus === 'preview' && audioUrl && (
              <div className="space-y-3">
                <AudioPlayer src={audioUrl} />
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={discardAudio}
                    className="px-4 py-2.5 rounded-full border border-outline-variant text-on-surface text-sm font-medium hover:bg-surface-container-high transition-colors min-h-[44px]"
                  >
                    {t.profile.recordAgain}
                  </button>
                  <button
                    type="button"
                    onClick={uploadAudio}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary-fixed-dim text-on-primary-container text-sm font-medium hover:opacity-90 transition-opacity min-h-[44px]"
                  >
                    {t.profile.upload}
                  </button>
                </div>
              </div>
            )}

            {audioStatus === 'uploading' && (
              <div className="flex items-center justify-center gap-2 text-on-surface-variant text-sm py-3">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t.profile.uploading}
              </div>
            )}

            {audioStatus === 'pending' && (
              <div className="flex flex-col items-center gap-3">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant text-xs font-medium">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.profile.waitingApproval}
                </span>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => setAudioStatus('none')}
                    className="text-xs text-on-surface-variant underline hover:text-on-surface transition-colors"
                  >
                    {t.profile.replace}
                  </button>
                )}
              </div>
            )}

            {audioStatus === 'approved' && audioUrl && (
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary-fixed-dim" aria-hidden="true" />
                    {t.profile.approved}
                  </span>
                  {editMode && (
                    <button
                      type="button"
                      onClick={deleteAudio}
                      className="flex items-center gap-1 text-xs text-error hover:underline transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t.profile.deleteAudio}
                    </button>
                  )}
                </div>
                <AudioPlayer src={audioUrl} />
              </div>
            )}

            {audioStatus === 'rejected' && (
              <div className="flex flex-col items-center gap-3">
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-error-container text-error text-xs font-medium">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {t.profile.rejected}
                </span>
                {editMode && (
                  <button
                    type="button"
                    onClick={() => setAudioStatus('none')}
                    className="text-xs text-on-surface-variant underline hover:text-on-surface transition-colors"
                  >
                    {t.profile.newRecording}
                  </button>
                )}
              </div>
            )}

            {audioError && (
              <p className="text-xs text-error mt-2 text-center" role="alert">{audioError}</p>
            )}

            <input
              ref={audioFileRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={handleAudioFileSelect}
              aria-hidden="true"
            />
          </div>

          {/* ── Bio ───────────────────────────────────────────────────────── */}
          <div className="w-full bg-surface-container rounded-2xl p-6 mb-5">
            {editMode ? (
              <>
                <textarea
                  value={draft.bio}
                  onChange={(e) => setDraft((d) => ({ ...d, bio: e.target.value }))}
                  rows={4}
                  maxLength={1000}
                  className="w-full bg-transparent text-on-surface text-sm leading-relaxed text-center focus:outline-none resize-none placeholder:text-on-surface-variant"
                  placeholder={t.profile.bioPlaceholder}
                  aria-label="Bio"
                />
                <p className="text-xs text-on-surface-variant text-right mt-1" aria-live="polite">
                  {draft.bio.length}/1000
                </p>
              </>
            ) : (
              <p className={`leading-relaxed text-center ${profile.bio ? 'text-on-surface' : 'text-on-surface-variant italic text-sm'}`}>
                {profile.bio ?? t.profile.noBio}
              </p>
            )}
          </div>

          {/* ── Underground Stats ────────────────────────────────────────── */}
          {isHidden && hiddenStats && (
            <div className="bg-surface-container border border-outline-variant rounded-2xl overflow-hidden mb-4">

              <div className="px-5 py-3 border-b border-outline-variant flex items-center gap-2">
                <span className="text-sm font-bold text-on-surface">🥊 Underground Stats</span>
              </div>

              <div className="grid grid-cols-3 divide-x divide-outline-variant border-b border-outline-variant">
                <div className="px-4 py-3 text-center">
                  <p className="text-lg font-bold text-primary-fixed-dim tabular-nums">
                    {hiddenStats.balance}
                  </p>
                  <p className="text-xs text-on-surface-variant">🪙 Coins</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-lg font-bold text-on-surface tabular-nums">
                    {hiddenStats.teeth}
                  </p>
                  <p className="text-xs text-on-surface-variant">🦷 Zähne</p>
                </div>
                <div className="px-4 py-3 text-center">
                  <p className="text-lg font-bold text-on-surface tabular-nums">
                    {hiddenStats.chains}
                  </p>
                  <p className="text-xs text-on-surface-variant">⛓️ Ketten</p>
                </div>
              </div>

              {hiddenStats.badges.length > 0 && (
                <div className="px-5 py-3 flex flex-wrap gap-2">
                  {hiddenStats.badges.map(b => {
                    const remaining = Math.max(0, new Date(b.expires_at).getTime() - Date.now())
                    const hours = Math.floor(remaining / 3600000)
                    const mins  = Math.floor((remaining % 3600000) / 60000)
                    const timeStr = hours > 0 ? `${hours}h` : `${mins}m`
                    const icon = b.type === 'winner' ? '🏆' : b.type === 'loser' ? '💀' : '🐔'
                    return (
                      <span key={b.id}
                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-high border border-outline-variant text-xs text-on-surface-variant">
                        {icon} {b.type} <span className="text-primary-fixed-dim">{timeStr}</span>
                      </span>
                    )
                  })}
                </div>
              )}

              {hiddenStats.badges.length === 0 && (
                <div className="px-5 py-3">
                  <p className="text-xs text-on-surface-variant">Keine aktiven Badges</p>
                </div>
              )}
            </div>
          )}

          {/* ── Interests ─────────────────────────────────────────────────── */}
          <div className="w-full mb-6">
            <h3 className="text-xs font-medium text-on-surface-variant mb-3 text-center uppercase tracking-wide">
              {t.profile.interests}
            </h3>
            {editMode && (
              <p className="text-xs text-on-surface-variant text-center mb-3">
                {t.profile.interestFlagHint}
              </p>
            )}
            <div className="flex flex-wrap gap-2 justify-center">
              {editMode ? (
                allInterests.length > 0 ? (
                  allInterests.map((i) => {
                    const flagValue = selectedInterestMap.get(i.id)
                    const selected  = flagValue !== undefined
                    const isGreen   = flagValue === true
                    const pending   = interestLoading === i.id
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => handleToggleInterest(i.id)}
                        disabled={interestLoading !== null}
                        aria-pressed={selected}
                        title={selected ? (isGreen ? t.profile.interestFlagGreen : t.profile.interestFlagRed) : undefined}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all disabled:cursor-not-allowed flex items-center gap-1.5 ${
                          !selected
                            ? 'bg-surface-container-high text-on-surface hover:opacity-80 disabled:opacity-50'
                            : isGreen
                            ? 'bg-green-500/20 text-green-400 ring-1 ring-green-500/50'
                            : 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50'
                        }`}
                      >
                        {pending ? (
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        ) : (
                          <>
                            {selected && (
                              <span aria-hidden="true">{isGreen ? '💚' : '🚩'}</span>
                            )}
                            {i.name_de}
                          </>
                        )}
                      </button>
                    )
                  })
                ) : (
                  <p className="text-sm text-on-surface-variant italic">{t.profile.noInterestsAvailable}</p>
                )
              ) : (
                userInterests.length > 0 ? (
                  userInterests.map((ui) => (
                    <span
                      key={ui.interest_id}
                      className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-1.5 ${
                        ui.is_green
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      <span aria-hidden="true">{ui.is_green ? '💚' : '🚩'}</span>
                      {ui.interest.name_de}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-on-surface-variant italic">{t.profile.noInterestsAdded}</p>
                )
              )}
            </div>
          </div>

          {/* ── is_published toggle (edit mode only) ──────────────────────── */}
          {editMode && (
            <div className="w-full flex items-center justify-between px-1 mb-5">
              <div>
                <p className="text-sm font-medium text-on-surface">Profil sichtbar</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  {draft.is_published
                    ? `${t.profile.visibilityPublic} — andere können dich finden`
                    : `${t.profile.visibilityPrivate} — nur du siehst dein Profil`}
                </p>
              </div>
              <button
                role="switch"
                aria-checked={draft.is_published}
                onClick={() => setDraft((d) => ({ ...d, is_published: !d.is_published }))}
                disabled={!profile.onboardingCompleted && !draft.is_published}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                  draft.is_published ? 'bg-primary-fixed-dim' : 'bg-surface-container-high'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-sm transition duration-200 ${
                    draft.is_published ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          )}

          {saveError && (
            <div className="w-full flex items-center gap-2 rounded-xl bg-error-container text-error px-4 py-3 text-sm mb-4" role="alert">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              {saveError}
            </div>
          )}

          {/* ── Action buttons ────────────────────────────────────────────── */}
          {editMode ? (
            <div className="w-full flex gap-3">
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="flex-1 py-4 rounded-full border border-outline-variant text-on-surface font-semibold hover:bg-surface-container transition-colors disabled:opacity-50"
              >
                {t.profile.cancel}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !draft.nickname.trim()}
                className="flex-1 py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {t.profile.save}
              </button>
            </div>
          ) : (
            <button
              onClick={startEdit}
              className="w-full py-4 rounded-full bg-primary-fixed-dim text-on-primary-container font-semibold hover:opacity-90 active:scale-95 transition-all"
            >
              {t.profile.edit}
            </button>
          )}

        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-white text-sm font-semibold transition-colors min-h-[52px] mt-12"
          style={{ background: 'var(--color-logout)' }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {t.profile.logout}
        </button>

      </div>

      {/* ── Nickname change confirmation modal ────────────────────────── */}
      {showNicknameConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="nickname-confirm-title"
        >
          <div className="w-full max-w-sm bg-surface-container rounded-3xl p-6 shadow-xl">
            <h2 id="nickname-confirm-title" className="text-lg font-bold text-on-surface mb-4">
              {t.profile.nicknameChangeTitle}
            </h2>

            <p className="text-sm text-on-surface mb-2">
              Du hast noch {nicknameChangesRemaining} von 1 Änderung übrig.
            </p>

            {nicknameChangedAt && (
              <p className="text-sm text-on-surface-variant mb-2">
                Zuletzt geändert: {formatGermanDate(nicknameChangedAt)}
              </p>
            )}

            <p className="text-sm text-on-surface-variant mb-6">
              {t.profile.nicknameChangeBody}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowNicknameConfirm(false)}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold hover:bg-surface-container-high transition-colors min-h-[44px]"
              >
                {t.profile.cancel}
              </button>
              <button
                type="button"
                onClick={performSave}
                className="flex-1 py-3 rounded-full bg-error text-white font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
              >
                {t.profile.nicknameChangeConfirm}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Gender change confirmation modal ──────────────────────────── */}
      {showGenderConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gender-confirm-title"
        >
          <div className="w-full max-w-sm bg-surface-container rounded-3xl p-6 shadow-xl">
            <h2 id="gender-confirm-title" className="text-lg font-bold text-on-surface mb-4">
              {t.profile.genderChangeTitle}
            </h2>

            <p className="text-sm text-on-surface mb-2">
              Auf den meisten Plattformen ist diese Angabe nicht änderbar. Du hast noch {genderChangesRemaining} von 1 Änderung übrig.
            </p>

            {genderChangedAt && (
              <p className="text-sm text-on-surface-variant mb-2">
                Zuletzt geändert: {formatGermanDate(genderChangedAt)}
              </p>
            )}

            <p className="text-sm text-on-surface-variant mb-6">
              {t.profile.genderChangeBody}
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowGenderConfirm(false)}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface font-semibold hover:bg-surface-container-high transition-colors min-h-[44px]"
              >
                {t.profile.cancel}
              </button>
              <button
                type="button"
                onClick={performSave}
                className="flex-1 py-3 rounded-full bg-error text-white font-semibold hover:opacity-90 transition-opacity min-h-[44px]"
              >
                {t.profile.genderChangeConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
