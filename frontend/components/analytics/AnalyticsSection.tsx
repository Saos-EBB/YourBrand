'use client'

import { useEffect, useMemo, useState } from 'react'
import { fetchApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { useTenant } from '@/components/TenantProvider'
import {
  ACCENT, AreaChart, BarList, ChartCard, ColumnChart, Funnel, Heatmap, Legend, SplitBar, StatTile,
  fmtEur, fmtNum, type Series,
} from './charts'

// Spiegel von backend/src/modules/core/admin/dashboard-analytics.query.ts
interface Kpi { current: number; previous: number }
export interface DashboardAnalytics {
  range: { days: 7 | 30 | 90; bucket: 'hour' | 'day'; from: string; to: string; launchedAt: string | null }
  buckets: string[]
  series: {
    signups: number[]; messages: number[]; contactRequests: number[]
    coins: number[]; uploads: number[]; revenue: number[]
  }
  usersBefore: number
  kpis: { signups: Kpi; activity: Kpi; revenue: Kpi; activeSubscriptions: Kpi }
  funnel: { key: 'registered' | 'verified' | 'photo' | 'contacted' | 'conversation' | 'premium'; count: number }[]
  heatmap: number[][]
  plans: { plan: 'monthly' | 'yearly' | 'lifetime'; count: number }[]
  topInterests: { name: string; count: number }[]
  topCities: { name: string; count: number }[]
}

const RANGES = [7, 30, 90] as const

// Bucket kommt als "YYYY-MM-DDTHH:00" in Berliner Wandzeit, ohne Zone
function parts(b: string) {
  const [date, time] = b.split('T')
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d, time, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

export function AnalyticsSection() {
  const { t, locale } = useTranslation()
  const a = t.analytics
  const { modules } = useTenant()
  const [days, setDays] = useState<(typeof RANGES)[number]>(30)
  const [data, setData] = useState<DashboardAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchApi<DashboardAnalytics>(`/admin/dashboard/analytics?days=${days}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null) } })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : t.common.error) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])

  const numLocale = locale === 'de' || locale === 'de_easy' || locale === 'leet' ? 'de-DE' : locale
  const n = (v: number) => fmtNum(v, numLocale)
  const eur = (v: number) => fmtEur(v, numLocale)
  const eurAxis = (v: number) => fmtEur(v, numLocale, true)
  const weekdays = a.weekdays
  const labels = { showTable: a.showTable, showChart: a.showChart }

  const view = useMemo(() => {
    if (!data) return null
    const hourly = data.range.bucket === 'hour'
    const p = data.buckets.map(parts)
    // Stundenweise: Wochentag dazu, sonst steht dreimal "15:00" an der Achse
    const xLabels = p.map((b) => (hourly ? `${weekdays[(b.weekday + 6) % 7]} ${b.time}` : `${b.d}.${b.m}.`))
    const tipTitles = p.map((b) => `${weekdays[(b.weekday + 6) % 7]}, ${b.d}.${b.m}.${b.y}${hourly ? ` · ${b.time}` : ''}`)
    let running = data.usersBefore
    const cumulative = data.series.signups.map((v) => (running += v))
    const activitySeries: Series[] = [
      ...(modules.chat ? [
        { key: 'messages', label: a.messages, color: 'var(--viz-1)', values: data.series.messages },
        { key: 'contactRequests', label: a.contactRequests, color: 'var(--viz-2)', values: data.series.contactRequests },
      ] : []),
      { key: 'uploads', label: a.uploads, color: 'var(--viz-3)', values: data.series.uploads },
      ...(modules.hidden ? [{ key: 'coins', label: a.coins, color: 'var(--viz-4)', values: data.series.coins }] : []),
    ]
    const activityTotal = data.buckets.map((_, i) => activitySeries.reduce((s, ser) => s + ser.values[i], 0))
    // Sparklines: hoechstens ~14 Punkte, sonst wird es Rauschen
    const compress = (vals: number[]) => {
      const size = Math.max(1, Math.ceil(vals.length / 14))
      const out: number[] = []
      for (let i = 0; i < vals.length; i += size) out.push(vals.slice(i, i + size).reduce((s, v) => s + v, 0))
      return out
    }
    return { hourly, xLabels, tipTitles, cumulative, activitySeries, activityTotal, compress }
  }, [data, modules.chat, modules.hidden, weekdays, a])

  const stageLabel: Record<DashboardAnalytics['funnel'][number]['key'], string> = {
    registered: a.stageRegistered, verified: a.stageVerified, photo: a.stagePhoto,
    contacted: a.stageContacted, conversation: a.stageConversation, premium: a.stagePremium,
  }
  const planLabel = { monthly: a.planMonthly, yearly: a.planYearly, lifetime: a.planLifetime }
  const planColor = { monthly: 'var(--viz-1)', yearly: 'var(--viz-2)', lifetime: 'var(--viz-3)' }

  const launched = data?.range.launchedAt
    ? new Date(data.range.launchedAt).toLocaleDateString(numLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  return (
    <div className="space-y-3">
      {/* Filter: eine Zeile ueber allem, was er steuert */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="radiogroup" aria-label={a.title} className="inline-flex rounded-xl border border-outline-variant bg-surface-container p-0.5">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={days === r}
              onClick={() => { if (r !== days) { setLoading(true); setDays(r) } }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                days === r ? 'bg-surface-container-highest text-on-surface' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {a.range.replace('{n}', String(r))}
            </button>
          ))}
        </div>
        {launched && (
          <p className="flex items-center gap-1.5 text-xs text-on-surface-variant">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-fixed-dim" aria-hidden="true" />
            {a.liveSince.replace('{date}', launched)}
          </p>
        )}
      </div>

      {error && !data && <p className="text-sm text-error">{error}</p>}
      {!data && loading && <AnalyticsSkeleton />}

      {/* Beim Nachladen bleibt der alte Stand sichtbar, nur blasser */}
      {data && view && (
        <div className={`space-y-3 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label={a.kpiSignups} value={n(data.kpis.signups.current)}
              current={data.kpis.signups.current} previous={data.kpis.signups.previous}
              spark={view.compress(data.series.signups)} deltaLabel={a.vsPrevious} newLabel={a.isNew}
            />
            <StatTile
              label={a.kpiActivity} value={n(data.kpis.activity.current)}
              current={data.kpis.activity.current} previous={data.kpis.activity.previous}
              spark={view.compress(view.activityTotal)} deltaLabel={a.vsPrevious} newLabel={a.isNew}
            />
            {modules.payments && (
              <>
                <StatTile
                  label={a.kpiRevenue} value={eur(data.kpis.revenue.current)}
                  current={data.kpis.revenue.current} previous={data.kpis.revenue.previous}
                  spark={view.compress(data.series.revenue)} deltaLabel={a.vsPrevious} newLabel={a.isNew}
                />
                <StatTile
                  label={a.kpiSubscriptions} value={n(data.kpis.activeSubscriptions.current)}
                  current={data.kpis.activeSubscriptions.current} previous={data.kpis.activeSubscriptions.previous}
                  deltaLabel={a.vsPrevious} newLabel={a.isNew}
                />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard
              className="lg:col-span-2"
              title={a.growthTitle}
              subtitle={a.growthSub}
              labels={labels}
              aside={<span className="text-xl font-semibold text-on-surface">{n(view.cumulative[view.cumulative.length - 1] ?? 0)}</span>}
              table={{ head: [a.time, a.growthSub, a.signupsTitle], rows: view.tipTitles.map((tt, i) => [tt, view.cumulative[i], data.series.signups[i]]) }}
            >
              <AreaChart values={view.cumulative} xLabels={view.xLabels} tipTitles={view.tipTitles} seriesLabel={a.membersUnit} fmt={n} height={240} />
            </ChartCard>

            <ChartCard
              className="lg:col-span-2"
              title={a.activityTitle}
              subtitle={`${a.activitySub} · ${view.hourly ? a.perHour : a.perDay}`}
              labels={labels}
              table={{
                head: [a.time, ...view.activitySeries.map((s) => s.label), a.total],
                rows: view.tipTitles.map((tt, i) => [tt, ...view.activitySeries.map((s) => s.values[i]), view.activityTotal[i]]),
              }}
            >
              <Legend items={view.activitySeries.map((s) => ({
                label: s.label, color: s.color, value: n(s.values.reduce((x, y) => x + y, 0)),
              }))} />
              <ColumnChart series={view.activitySeries} xLabels={view.xLabels} tipTitles={view.tipTitles} fmt={n} totalLabel={a.total} height={240} />
            </ChartCard>

            <ChartCard
              title={a.signupsTitle}
              subtitle={view.hourly ? a.perHour : a.perDay}
              labels={labels}
              table={{ head: [a.time, a.count], rows: view.tipTitles.map((tt, i) => [tt, data.series.signups[i]]) }}
            >
              <ColumnChart
                series={[{ key: 'signups', label: a.signupsTitle, color: ACCENT, values: data.series.signups }]}
                xLabels={view.xLabels} tipTitles={view.tipTitles} fmt={n}
              />
            </ChartCard>

            {modules.payments && (
              <ChartCard
                title={a.revenueTitle}
                subtitle={`${a.revenueSub} · ${view.hourly ? a.perHour : a.perDay}`}
                labels={labels}
                aside={<span className="text-xl font-semibold text-on-surface">{eur(data.kpis.revenue.current)}</span>}
                table={{ head: [a.time, a.revenueTitle], rows: view.tipTitles.map((tt, i) => [tt, eur(data.series.revenue[i])]) }}
              >
                <ColumnChart
                  series={[{ key: 'revenue', label: a.revenueTitle, color: ACCENT, values: data.series.revenue }]}
                  xLabels={view.xLabels} tipTitles={view.tipTitles} fmt={eurAxis}
                />
              </ChartCard>
            )}

            <ChartCard
              title={a.funnelTitle}
              subtitle={a.funnelSub}
              labels={labels}
              table={{
                head: [a.stage, a.count, a.share],
                rows: data.funnel.filter((s) => modules.payments || s.key !== 'premium').map((s) => [stageLabel[s.key], s.count, `${Math.round((s.count / Math.max(data.funnel[0].count, 1)) * 100)} %`]),
              }}
            >
              <Funnel
                stages={data.funnel
                  .filter((s) => modules.payments || s.key !== 'premium')
                  .map((s) => ({ label: stageLabel[s.key], count: s.count }))}
                fmt={n} ofPrevious={a.ofPrevious} ofTotal={a.ofTotal}
              />
            </ChartCard>

            <ChartCard
              title={a.heatmapTitle}
              subtitle={a.heatmapSub}
              labels={labels}
              table={{
                head: [a.time, ...weekdays],
                rows: Array.from({ length: 24 }, (_, h) => [`${String(h).padStart(2, '0')}:00`, ...data.heatmap.map((row) => row[h])]),
              }}
            >
              <Heatmap grid={data.heatmap} rowLabels={weekdays} fmt={n} less={a.less} more={a.more} unit={a.kpiActivity} />
            </ChartCard>
          </div>

          <div className={`grid grid-cols-1 gap-3 ${modules.payments ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {modules.payments && (
              <ChartCard
                title={a.plansTitle} subtitle={a.plansSub} labels={labels}
                table={{ head: [a.plansTitle, a.count], rows: data.plans.map((p) => [planLabel[p.plan], p.count]) }}
              >
                <SplitBar fmt={n} parts={data.plans.map((p) => ({ label: planLabel[p.plan], count: p.count, color: planColor[p.plan] }))} />
              </ChartCard>
            )}
            <ChartCard
              title={a.interestsTitle} labels={labels}
              table={{ head: [a.interestsTitle, a.membersUnit], rows: data.topInterests.map((i) => [i.name, i.count]) }}
            >
              {data.topInterests.length ? <BarList items={data.topInterests} fmt={n} /> : <Empty text={a.noData} />}
            </ChartCard>
            <ChartCard
              title={a.citiesTitle} labels={labels}
              table={{ head: [a.citiesTitle, a.membersUnit], rows: data.topCities.map((i) => [i.name, i.count]) }}
            >
              {data.topCities.length ? <BarList items={data.topCities} fmt={n} /> : <Empty text={a.noData} />}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs text-on-surface-variant py-6 text-center">{text}</p>
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden="true">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-2xl bg-surface-container" />)}
      </div>
      <div className="h-72 rounded-2xl bg-surface-container" />
      <div className="h-72 rounded-2xl bg-surface-container" />
    </div>
  )
}
