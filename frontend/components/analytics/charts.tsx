'use client'

// Diagramm-Bausteine fuer das Owner-Analytics (reines SVG, keine Lib).
// Regeln: duenne Marks, 2px Linien, 4px runde Datenenden, 2px Abstand in
// Flaechenfarbe zwischen Segmenten, Hairline-Raster, Text nie in Datenfarbe.
// Jede Karte hat eine Tabellenansicht — der Tooltip ist nie der einzige Weg
// an einen Wert.

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'

export const ACCENT = 'var(--color-primary-fixed-dim)'
const SURFACE = 'var(--color-surface-container)'
const GRID = 'var(--color-outline-variant)'
const MUTED = 'var(--color-on-surface-variant)'

// ─── Formatierung ────────────────────────────────────────────────────────────

export function fmtNum(n: number, locale = 'de-DE'): string {
  return n >= 10000
    ? new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : n.toLocaleString(locale, { maximumFractionDigits: 0 })
}

export function fmtEur(n: number, locale = 'de-DE', compact = false): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency', currency: 'EUR',
    ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { maximumFractionDigits: n >= 1000 ? 0 : 2 }),
  }).format(n)
}

// Saubere Achsenwerte: 0 und 2–3 runde Schritte bis >= max
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1]
  const raw = max / 3
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const ticks = [0]
  while (ticks[ticks.length - 1] < max) ticks.push(+(ticks[ticks.length - 1] + step).toFixed(6))
  return ticks
}

// ─── Breite messen ───────────────────────────────────────────────────────────

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

export interface TipRow { label: string; value: string; color?: string; line?: boolean }
interface Tip { x: number; y: number; title: string; rows: TipRow[] }

function Tooltip({ tip, width }: { tip: Tip | null; width: number }) {
  if (!tip) return null
  const left = Math.min(Math.max(tip.x + 12, 0), Math.max(width - 180, 0))
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[140px] rounded-lg border border-outline-variant bg-surface-container-highest px-3 py-2 shadow-lg"
      style={{ left, top: Math.max(tip.y - 12, 0) }}
      role="status"
    >
      <p className="text-[11px] text-on-surface-variant mb-1">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          {r.color && (
            <span
              aria-hidden="true"
              className={r.line ? 'h-0.5 w-3 rounded-full' : 'h-2 w-2 rounded-sm'}
              style={{ background: r.color }}
            />
          )}
          <span className="font-semibold text-on-surface tabular-nums">{r.value}</span>
          <span className="text-on-surface-variant">{r.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Karte mit Tabellen-Umschalter ───────────────────────────────────────────

export interface TableData { head: string[]; rows: (string | number)[][] }

export function ChartCard({
  title, subtitle, table, labels, className = '', children, aside,
}: {
  title: string
  subtitle?: string
  table?: TableData
  labels: { showTable: string; showChart: string }
  className?: string
  children: ReactNode
  aside?: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  return (
    <section className={`rounded-2xl bg-surface-container border border-outline-variant p-4 sm:p-5 flex flex-col gap-3 min-w-0 ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {aside}
          {table && (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              className="text-xs text-on-surface-variant hover:text-on-surface underline underline-offset-2"
              aria-pressed={asTable}
            >
              {asTable ? labels.showChart : labels.showTable}
            </button>
          )}
        </div>
      </header>
      {asTable && table ? <DataTable table={table} /> : children}
    </section>
  )
}

function DataTable({ table }: { table: TableData }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-outline-variant">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-surface-container-high">
          <tr>
            {table.head.map((h, i) => (
              <th key={h} className={`px-3 py-2 font-medium text-on-surface-variant ${i ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r} className="border-t border-outline-variant/60">
              {row.map((cell, i) => (
                <td key={i} className={`px-3 py-1.5 text-on-surface tabular-nums ${i ? 'text-right' : 'text-left'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Legende ─────────────────────────────────────────────────────────────────

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs text-on-surface-variant">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
          {it.value && <span className="font-semibold text-on-surface tabular-nums">{it.value}</span>}
        </li>
      ))}
    </ul>
  )
}

// ─── KPI-Kachel mit Sparkline ────────────────────────────────────────────────

export function StatTile({
  label, value, current, previous, spark, deltaLabel, newLabel,
}: {
  label: string
  value: string
  current: number
  previous: number
  spark?: number[]
  deltaLabel: string
  newLabel: string
}) {
  const delta = previous > 0 ? (current - previous) / previous : null
  const up = delta === null ? current > 0 : delta >= 0
  return (
    <div className="rounded-2xl bg-surface-container border border-outline-variant p-4 flex flex-col gap-2 min-w-0">
      <p className="text-xs text-on-surface-variant truncate">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl sm:text-3xl font-semibold text-on-surface leading-none">{value}</p>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      <p className="flex items-center gap-1 text-xs text-on-surface-variant">
        {delta === null ? (
          current > 0 && (
            <span className="rounded-full bg-primary-fixed-dim/15 px-1.5 py-0.5 text-[10px] font-semibold text-on-surface">{newLabel}</span>
          )
        ) : (
          <>
            {up
              ? <TrendingUp className="h-3.5 w-3.5 text-primary-fixed-dim" aria-hidden="true" />
              : <TrendingDown className="h-3.5 w-3.5 text-error" aria-hidden="true" />}
            <span className="font-semibold text-on-surface tabular-nums">
              {delta >= 0 ? '+' : '−'}{Math.abs(Math.round(delta * 100))} %
            </span>
          </>
        )}
        <span className="truncate">{deltaLabel}</span>
      </p>
    </div>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const W = 72, H = 28, P = 3
  const max = Math.max(...values, 1)
  const pts = values.map((v, i) => [P + (i / (values.length - 1)) * (W - 2 * P), H - P - (v / max) * (H - 2 * P)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={W} height={H} aria-hidden="true" className="shrink-0">
      <path d={`${d}L${lx},${H - P}L${P},${H - P}Z`} fill={ACCENT} opacity={0.1} />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
    </svg>
  )
}

// ─── Achsen-Gerüst fuer Zeitreihen ───────────────────────────────────────────

const M = { top: 12, right: 12, bottom: 24, left: 40 }

function xTickIndexes(n: number, width: number): number[] {
  const count = Math.max(2, Math.min(n, Math.floor(width / 80)))
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  return Array.from({ length: count }, (_, i) => Math.round((i * (n - 1)) / (count - 1)))
}

function Axes({ width, height, ticks, yScale, xLabels, xPos, fmtY }: {
  width: number; height: number; ticks: number[]
  yScale: (v: number) => number; xLabels: string[]; xPos: (i: number) => number; fmtY: (v: number) => string
}) {
  return (
    <g fontSize={10} fill={MUTED}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.left} x2={width - M.right} y1={yScale(t)} y2={yScale(t)} stroke={GRID} strokeWidth={1} opacity={0.6} />
          <text x={M.left - 6} y={yScale(t)} dy="0.32em" textAnchor="end" className="tabular-nums">{fmtY(t)}</text>
        </g>
      ))}
      {xTickIndexes(xLabels.length, width - M.left - M.right).map((i, k, all) => (
        // Rand-Labels buendig, sonst ragen sie aus der Karte
        <text key={i} x={xPos(i)} y={height - 6} textAnchor={k === 0 ? 'start' : k === all.length - 1 ? 'end' : 'middle'}>
          {xLabels[i]}
        </text>
      ))}
    </g>
  )
}

// ─── Flaechen-/Liniendiagramm (eine Reihe) ───────────────────────────────────

export function AreaChart({
  values, xLabels, tipTitles, seriesLabel, fmt, height = 220,
}: {
  values: number[]; xLabels: string[]; tipTitles: string[]; seriesLabel: string
  fmt: (v: number) => string; height?: number
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = values.length
  const max = Math.max(...values, 0)
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(width - M.left - M.right, 1)
  const plotH = height - M.top - M.bottom
  const x = (i: number) => M.left + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2)
  const y = (v: number) => M.top + plotH - (v / top) * plotH
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))
    setHover(Math.min(Math.max(i, 0), n - 1))
  }

  const tip: Tip | null = hover === null ? null : {
    x: x(hover), y: y(values[hover]), title: tipTitles[hover],
    rows: [{ label: seriesLabel, value: fmt(values[hover]), color: ACCENT, line: true }],
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={seriesLabel}>
          <Axes width={width} height={height} ticks={ticks} yScale={y} xLabels={xLabels} xPos={x} fmtY={fmt} />
          <path d={area} fill={ACCENT} opacity={0.1} />
          <path d={line} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} stroke={MUTED} strokeWidth={1} opacity={0.5} />
          )}
          <circle cx={x(hover ?? n - 1)} cy={y(values[hover ?? n - 1])} r={4.5} fill={ACCENT} stroke={SURFACE} strokeWidth={2} />
          {hover === null && (
            <text x={x(n - 1) - 8} y={y(values[n - 1]) - 10} textAnchor="end" fontSize={12} fontWeight={600} fill="var(--color-on-surface)">
              {fmt(values[n - 1])}
            </text>
          )}
          <rect
            x={M.left} y={M.top} width={plotW} height={plotH} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ─── Saeulen (einzeln oder gestapelt) ────────────────────────────────────────

export interface Series { key: string; label: string; color: string; values: number[] }

export function ColumnChart({
  series, xLabels, tipTitles, fmt, height = 220, totalLabel,
}: {
  series: Series[]; xLabels: string[]; tipTitles: string[]
  fmt: (v: number) => string; height?: number; totalLabel?: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const n = xLabels.length
  const totals = xLabels.map((_, i) => series.reduce((s, ser) => s + ser.values[i], 0))
  const ticks = niceTicks(Math.max(...totals, 0))
  const top = ticks[ticks.length - 1]
  const plotW = Math.max(width - M.left - M.right, 1)
  const plotH = height - M.top - M.bottom
  const slot = plotW / Math.max(n, 1)
  const barW = Math.max(Math.min(slot - 2, 24), 1)
  const x = (i: number) => M.left + slot * i + slot / 2
  const y = (v: number) => M.top + plotH - (v / top) * plotH
  const GAP = barW >= 6 ? 2 : 0

  const tip: Tip | null = hover === null ? null : {
    x: x(hover), y: y(totals[hover]), title: tipTitles[hover],
    rows: [
      ...series.map((s) => ({ label: s.label, value: fmt(s.values[hover]), color: s.color })),
      ...(series.length > 1 && totalLabel ? [{ label: totalLabel, value: fmt(totals[hover]) }] : []),
    ],
  }

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(', ')}>
          <Axes width={width} height={height} ticks={ticks} yScale={y} xLabels={xLabels} xPos={x} fmtY={fmt} />
          {xLabels.map((_, i) => {
            let base = 0
            const visible = series.filter((s) => s.values[i] > 0)
            return (
              <g key={i} opacity={hover === null || hover === i ? 1 : 0.55}>
                {visible.map((s, k) => {
                  const v = s.values[i]
                  const y0 = y(base), y1 = y(base + v)
                  base += v
                  const isTop = k === visible.length - 1
                  const h = Math.max(y0 - y1 - (k > 0 ? GAP : 0), 0.5)
                  const r = isTop ? Math.min(4, barW / 2, h) : 0
                  const bx = x(i) - barW / 2
                  const by = y0 - (k > 0 ? GAP : 0) - h
                  // oben rund, unten eckig
                  const d = `M${bx},${by + h}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + barW - r}Q${bx + barW},${by} ${bx + barW},${by + r}V${by + h}Z`
                  return <path key={s.key} d={d} fill={s.color} />
                })}
              </g>
            )
          })}
          {xLabels.map((_, i) => (
            <rect
              key={i} x={M.left + slot * i} y={M.top} width={slot} height={plotH} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
      )}
      <Tooltip tip={tip} width={width} />
    </div>
  )
}

// ─── Funnel (Stufen) ─────────────────────────────────────────────────────────

export function Funnel({
  stages, fmt, ofPrevious, ofTotal,
}: {
  stages: { label: string; count: number }[]
  fmt: (v: number) => string; ofPrevious: string; ofTotal: string
}) {
  const first = Math.max(stages[0]?.count ?? 0, 1)
  return (
    <ol className="flex flex-col gap-2.5">
      {stages.map((s, i) => {
        const share = s.count / first
        const prev = i ? stages[i - 1].count : s.count
        const step = prev > 0 ? s.count / prev : 0
        // Ordinale Stufen: gleiche Farbe, nach unten satter
        const strength = 45 + (55 * i) / Math.max(stages.length - 1, 1)
        return (
          <li key={s.label} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2 text-xs">
              <span className="text-on-surface-variant truncate flex-1">{s.label}</span>
              <span className="font-semibold text-on-surface tabular-nums">{fmt(s.count)}</span>
              <span className="text-on-surface-variant tabular-nums whitespace-nowrap text-right">
                {i === 0 ? `100 % ${ofTotal}` : `${Math.round(step * 100)} % ${ofPrevious}`}
              </span>
            </div>
            <div className="h-5 rounded-md bg-surface-container-high overflow-hidden">
              <div
                className="h-full rounded-r-md transition-[width] duration-500"
                style={{
                  width: `${Math.max(share * 100, s.count > 0 ? 1.5 : 0)}%`,
                  background: `color-mix(in oklab, ${ACCENT} ${strength}%, var(--color-surface-container-high))`,
                }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Heatmap Wochentag × Stunde ──────────────────────────────────────────────

export function Heatmap({
  grid, rowLabels, fmt, less, more, unit,
}: {
  grid: number[][]; rowLabels: string[]; fmt: (v: number) => string; less: string; more: string; unit: string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [tip, setTip] = useState<Tip | null>(null)
  // Skala bis zum 95. Perzentil: ein einzelner Ausreisser (z.B. alle
  // Seed-Uploads in einer Stunde) faerbt sonst alles andere blass
  const nonZero = grid.flat().filter((v) => v > 0).sort((x, y) => x - y)
  const max = Math.max(nonZero[Math.floor((nonZero.length - 1) * 0.95)] ?? 1, 1)
  const min = Math.min(nonZero[0] ?? max, max)
  const LABEL_W = 28
  const cols = 24
  const cell = Math.max(Math.min((width - LABEL_W) / cols, 22), 6)
  const H = cell * 7 + 18
  const shade = (v: number) =>
    v === 0
      ? 'var(--color-surface-container-high)'
      : `color-mix(in oklab, ${ACCENT} ${Math.round(12 + 88 * (max > min ? Math.min((v - min) / (max - min), 1) : 1))}%, var(--color-surface-container-high))`

  return (
    <div className="flex flex-col gap-2">
      <div ref={ref} className="relative w-full" style={{ height: H }}>
        {width > 0 && (
          <svg width={width} height={H} role="img" aria-label={`${rowLabels.join(', ')}`}>
            {grid.map((row, d) => (
              <g key={d}>
                <text x={0} y={d * cell + cell / 2} dy="0.32em" fontSize={10} fill={MUTED}>{rowLabels[d]}</text>
                {row.map((v, h) => (
                  <rect
                    key={h}
                    x={LABEL_W + h * cell + 1} y={d * cell + 1}
                    width={cell - 2} height={cell - 2} rx={Math.min(3, cell / 4)}
                    fill={shade(v)}
                    onPointerEnter={() => setTip({
                      x: LABEL_W + h * cell, y: d * cell,
                      title: `${rowLabels[d]}, ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00`,
                      rows: [{ label: unit, value: fmt(v) }],
                    })}
                    onPointerLeave={() => setTip(null)}
                  />
                ))}
              </g>
            ))}
            {[0, 6, 12, 18, 23].map((h) => (
              <text key={h} x={LABEL_W + h * cell + cell / 2} y={7 * cell + 13} textAnchor="middle" fontSize={10} fill={MUTED}>
                {String(h).padStart(2, '0')}
              </text>
            ))}
          </svg>
        )}
        <Tooltip tip={tip} width={width} />
      </div>
      <div className="flex items-center gap-2 self-end text-[10px] text-on-surface-variant" aria-hidden="true">
        {less}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="h-2.5 w-4 rounded-sm" style={{ background: shade(min + f * (max - min)) }} />
        ))}
        {more}
      </div>
    </div>
  )
}

// ─── Horizontale Rangliste ───────────────────────────────────────────────────

export function BarList({ items, fmt }: { items: { name: string; count: number }[]; fmt: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <ol className="flex flex-col gap-2">
      {items.map((it) => (
        <li key={it.name} className="grid grid-cols-[minmax(0,6.5rem)_1fr_2.5rem] items-center gap-3">
          <span className="text-xs text-on-surface truncate">{it.name}</span>
          <div className="h-2 rounded-full bg-surface-container-high">
            <div className="h-full rounded-full" style={{ width: `${(it.count / max) * 100}%`, background: ACCENT }} />
          </div>
          <span className="text-xs font-semibold text-on-surface text-right tabular-nums">{fmt(it.count)}</span>
        </li>
      ))}
    </ol>
  )
}

// ─── Anteile als ein Balken ──────────────────────────────────────────────────

export function SplitBar({ parts, fmt }: { parts: { label: string; count: number; color: string }[]; fmt: (v: number) => string }) {
  const total = parts.reduce((s, p) => s + p.count, 0)
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-3xl font-semibold text-on-surface leading-none">{fmt(total)}</p>
      </div>
      <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={parts.map((p) => `${p.label} ${p.count}`).join(', ')}>
        {parts.filter((p) => p.count > 0).map((p, i, arr) => (
          <div
            key={p.label}
            className={`h-full ${i === 0 ? 'rounded-l-full' : ''} ${i === arr.length - 1 ? 'rounded-r-full' : ''} transition-opacity`}
            style={{ width: `${(p.count / total) * 100}%`, background: p.color, opacity: hover && hover !== p.label ? 0.45 : 1 }}
            onPointerEnter={() => setHover(p.label)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-xs">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
            <span className="text-on-surface-variant flex-1">{p.label}</span>
            <span className="font-semibold text-on-surface tabular-nums">{fmt(p.count)}</span>
            <span className="text-on-surface-variant tabular-nums w-10 text-right">
              {total ? Math.round((p.count / total) * 100) : 0} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
