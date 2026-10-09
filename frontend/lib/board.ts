// Schwarzes Brett (Modul "board") — Spiegel von backend/src/modules/core/board
export const BOARD_KINDS = ['search', 'offer', 'gift', 'meet'] as const
export type BoardKind = (typeof BOARD_KINDS)[number]
export const BOARD_VISIBILITIES = ['street', 'r500', 'r1000', 'kiez', 'public'] as const
export type BoardVisibility = (typeof BOARD_VISIBILITIES)[number]
export const BOARD_RANGES = ['street', 'r500', 'r1000', 'kiez', 'all'] as const
export type BoardRange = (typeof BOARD_RANGES)[number]

export interface BoardPost {
  id: string
  kind: BoardKind
  title: string
  body: string
  street: string | null
  visibility: BoardVisibility
  expires_at: string
  created_at: string
  author: { id: string; nickname: string; photo_url: string | null }
  distance_m?: number | null
  tears: number
  torn_by_me?: boolean
  mine?: boolean
}

export function daysLeft(expiresAt: string): number {
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 86_400_000))
}
