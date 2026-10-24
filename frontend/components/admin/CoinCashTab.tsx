'use client'

import { useEffect, useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useSearch } from '@/hooks/useSearch'
import { Divider } from './shared/Divider'
import { Spinner } from './shared/Spinner'
import { fmtDate } from './shared/utils'
import type { AdminCoinTransaction, AdminCashTransaction } from './shared/types'

const SYSTEM_USER = '00000000-0000-0000-0000-000000000000'

interface Props {
  showToast: (msg: string, ok?: boolean) => void
}

type SubTab = 'coin' | 'cash'

function TableWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-5">
      <table className="w-full text-sm">{children}</table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left text-xs font-semibold text-on-surface-variant whitespace-nowrap">
      {children}
    </th>
  )
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td className={`px-4 py-3 text-xs text-on-surface-variant ${mono ? 'font-mono' : ''}`}>
      {children}
    </td>
  )
}

// Owner-Listen kommen seitenweise (200 je Seite, neueste zuerst). Die Suche filtert nur die schon geladenen Zeilen.
type OwnerPage<T> = { data: T[]; nextCursor: string | null }

function withCursor(path: string, cursor: string | null): string {
  return cursor ? `${path}?cursor=${encodeURIComponent(cursor)}` : path
}

function LoadMore({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <div className="flex justify-center">
      <button onClick={onClick} disabled={busy} aria-busy={busy}
        className="px-4 py-2 rounded-full bg-surface-container-high text-on-surface text-sm font-semibold min-h-[40px] hover:opacity-90 transition-opacity disabled:opacity-50">
        Weitere laden
      </button>
    </div>
  )
}

// ─── Coin sub-tab ─────────────────────────────────────────────────────────────

function CoinSection({ showToast }: Props) {
  const [rows, setRows] = useState<AdminCoinTransaction[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const { query: coinSearch, handleChange: handleCoinSearch, filtered: filteredCoin } =
    useSearch(rows ?? [], (r, q) =>
      (r.nickname ?? '').toLowerCase().includes(q) ||
      r.reason.toLowerCase().includes(q),
    )

  useEffect(() => {
    setLoading(true)
    fetchApi<OwnerPage<AdminCoinTransaction>>('/admin/owner/coin-transactions')
      .then((res) => { setRows(res.data); setCursor(res.nextCursor) })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Fehler', false))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function loadMore() {
    setLoadingMore(true)
    fetchApi<OwnerPage<AdminCoinTransaction>>(withCursor('/admin/owner/coin-transactions', cursor))
      .then((res) => { setRows((prev) => [...(prev ?? []), ...res.data]); setCursor(res.nextCursor) })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Fehler', false))
      .finally(() => setLoadingMore(false))
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner size={6} /></div>
  if (!rows) return null

  const economy = filteredCoin.filter((r) => r.user_id !== SYSTEM_USER)
  const houseCut = filteredCoin.filter((r) => r.user_id === SYSTEM_USER)

  function CoinTable({ data }: { data: AdminCoinTransaction[] }) {
    if (data.length === 0) return <p className="text-sm text-on-surface-variant py-4 text-center">Keine Einträge</p>
    return (
      <TableWrapper>
        <thead>
          <tr className="border-b border-outline-variant">
            <Th>User</Th>
            <Th>Amount</Th>
            <Th>Reason</Th>
            <Th>Datum</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {data.map((r) => (
            <tr key={r.id} className="hover:bg-surface-container-high/50">
              <td className="px-4 py-3 text-sm text-on-surface font-medium">
                {r.nickname ?? r.user_id.slice(0, 8)}
              </td>
              <Td mono>
                <span className={r.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-error'}>
                  {r.amount >= 0 ? `+${r.amount}` : r.amount}
                </span>
              </Td>
              <Td>{r.reason}</Td>
              <Td>{fmtDate(r.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    )
  }

  return (
    <div className="space-y-6">
      <input
        type="search"
        placeholder="Suche nach Nickname oder Grund…"
        value={coinSearch}
        onChange={handleCoinSearch}
        className="w-full px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim min-h-[40px]"
      />

      <div>
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
          Coin Transactions ({economy.length})
        </p>
        <CoinTable data={economy} />
      </div>

      <Divider />

      <div>
        <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
          House Cut
        </p>
        <p className="text-xs text-on-surface-variant mb-3">
          Coins aus dem System entfernt (user_id = 000…000)
        </p>
        <CoinTable data={houseCut} />
      </div>

      {cursor && <LoadMore onClick={loadMore} busy={loadingMore} />}
    </div>
  )
}

// ─── Cash sub-tab ─────────────────────────────────────────────────────────────

function CashSection({ showToast }: Props) {
  const [rows, setRows] = useState<AdminCashTransaction[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  const { query: cashSearch, handleChange: handleCashSearch, filtered: filteredCash } =
    useSearch(rows ?? [], (r, q) =>
      (r.nickname ?? '').toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q),
    )

  useEffect(() => {
    setLoading(true)
    fetchApi<OwnerPage<AdminCashTransaction>>('/admin/owner/cash-transactions')
      .then((res) => { setRows(res.data); setCursor(res.nextCursor) })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Fehler', false))
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function loadMore() {
    setLoadingMore(true)
    fetchApi<OwnerPage<AdminCashTransaction>>(withCursor('/admin/owner/cash-transactions', cursor))
      .then((res) => { setRows((prev) => [...(prev ?? []), ...res.data]); setCursor(res.nextCursor) })
      .catch((err) => showToast(err instanceof Error ? err.message : 'Fehler', false))
      .finally(() => setLoadingMore(false))
  }

  if (loading) return <div className="flex justify-center py-8"><Spinner size={6} /></div>
  if (!rows) return null

  return (
    <div className="space-y-4">
      <input
        type="search"
        placeholder="Suche nach Nickname oder Status…"
        value={cashSearch}
        onChange={handleCashSearch}
        className="w-full px-3 py-2 rounded-xl bg-surface-container-high border border-outline-variant text-on-surface text-sm focus:outline-none focus:border-primary-fixed-dim min-h-[40px]"
      />

      {filteredCash.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-8 text-center">Keine Zahlungen</p>
      ) : (
      <div>
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">
        Cash Transactions ({filteredCash.length})
      </p>
      <TableWrapper>
        <thead>
          <tr className="border-b border-outline-variant">
            <Th>User</Th>
            <Th>Amount (EUR)</Th>
            <Th>Status</Th>
            <Th>Datum</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {filteredCash.map((r) => (
            <tr key={r.id} className="hover:bg-surface-container-high/50">
              <td className="px-4 py-3 text-sm text-on-surface font-medium">
                {r.nickname ?? r.user_id.slice(0, 8)}
              </td>
              <Td mono>{parseFloat(r.amount).toFixed(2)} {r.currency.toUpperCase()}</Td>
              <Td>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  r.status === 'completed' || r.status === 'succeeded'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : r.status === 'failed'
                    ? 'bg-error-container text-error'
                    : 'bg-surface-container-high text-on-surface-variant'
                }`}>
                  {r.status}
                </span>
              </Td>
              <Td>{fmtDate(r.created_at)}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrapper>
      </div>
      )}

      {cursor && <LoadMore onClick={loadMore} busy={loadingMore} />}
    </div>
  )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function CoinCashTab({ showToast }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('coin')

  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 space-y-4">

      {/* Sub-tab bar */}
      <div className="flex gap-2 rounded-xl bg-surface-container-high p-1">
        {(['coin', 'cash'] as SubTab[]).map((key) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              subTab === key
                ? 'bg-primary-fixed-dim text-on-primary-container'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {key === 'coin' ? 'Coin Transactions' : 'Cash Transactions'}
          </button>
        ))}
      </div>

      <Divider />

      {subTab === 'coin' && <CoinSection showToast={showToast} />}
      {subTab === 'cash' && <CashSection showToast={showToast} />}

    </div>
  )
}
