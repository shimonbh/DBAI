import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { MetricsSnapshot } from '@/types/monitor'
import { theme } from '@/theme'

interface Props {
  snapshot: MetricsSnapshot | null
  snapshots: MetricsSnapshot[]
}

/** Live gauge cards + sparkline chart for CPU, connections, and QPS. */
export function MetricsGauges({ snapshot, snapshots }: Props) {
  const chartData = snapshots.slice(-30).map((s, i) => ({
    t: i,
    cpu: s.cpu_percent,
    conn: s.active_connections,
    qps: s.queries_per_sec,
  }))

  return (
    <div>
      {/* Gauge cards */}
      <div style={styles.gauges}>
        <GaugeCard
          label="Active Connections"
          value={snapshot?.active_connections ?? 0}
          unit=""
          color="#89b4fa"
        />
        <GaugeCard
          label="Queries / sec"
          value={snapshot?.queries_per_sec ?? 0}
          unit="qps"
          color="#a6e3a1"
        />
        <GaugeCard
          label="CPU"
          value={snapshot?.cpu_percent ?? 0}
          unit="%"
          color={snapshot?.cpu_percent ?? 0 > 80 ? '#f38ba8' : '#fab387'}
        />
      </div>

      {/* Sparkline chart */}
      {chartData.length > 1 && (
        <div style={styles.chartWrap}>
          <div style={styles.chartTitle}>Activity (last 30 samples)</div>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={chartData}>
              <XAxis dataKey="t" hide />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: theme.bgPanel, border: `1px solid ${theme.borderColor}`, fontSize: 11 }}
                labelStyle={{ display: 'none' }}
              />
              <Line type="monotone" dataKey="conn" stroke="#89b4fa" dot={false} strokeWidth={1.5} name="Connections" />
              <Line type="monotone" dataKey="qps"  stroke="#a6e3a1" dot={false} strokeWidth={1.5} name="QPS" />
              <Line type="monotone" dataKey="cpu"  stroke="#fab387" dot={false} strokeWidth={1.5} name="CPU%" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function GaugeCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardValue, color }}>{typeof value === 'number' ? value.toLocaleString() : value}{unit}</div>
      <div style={styles.cardLabel}>{label}</div>
    </div>
  )
}

const styles = {
  gauges:     { display: 'flex', gap: 10, marginBottom: 10 },
  card:       { flex: 1, background: theme.bgPanel, borderRadius: 6, padding: '10px 12px', border: `1px solid ${theme.borderColor}` },
  cardValue:  { fontSize: 22, fontWeight: 700, lineHeight: 1 },
  cardLabel:  { fontSize: 10, color: theme.textMuted, marginTop: 4 },
  chartWrap:  { background: theme.bgPanel, borderRadius: 6, padding: '8px 10px', border: `1px solid ${theme.borderColor}` },
  chartTitle: { fontSize: 10, color: theme.textMuted, marginBottom: 4 },
}
