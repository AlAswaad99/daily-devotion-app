/**
 * The chart primitives, drawn as plain SVG.
 *
 * No charting library: every figure this dashboard shows is a count over at most a
 * few dozen points, and the house rules — thin marks, 4px rounded data-ends sitting
 * on the baseline, 2px lines, a recessive grid, labels on selected points only —
 * are easier to hold to in fifty lines of SVG than to argue a library out of.
 *
 * Series colours come from the validated palette in globals.css. Two series is the
 * normal maximum here; a third distinction (a summary day, a day not yet reached)
 * is an annotation — a marker or a dashed track — not another hue.
 */

const GRID = '#e9edf2'
const AXIS_TEXT = { fontFamily: 'var(--font-mono), monospace', fontSize: 9.5, fill: '#93a0ae' }
const LABEL_TEXT = { fontFamily: 'var(--font-sans), sans-serif', fontSize: 11, fill: '#66717f' }

export const SERIES = ['#b4522a', '#2a78d6', '#158a61', '#4a3aa7'] as const

/** A bar with rounded top corners whose base sits flat on the axis. */
function topBarPath(x: number, y: number, w: number, h: number, r = 4): string {
  const rr = Math.min(r, w / 2, h)
  return `M${x} ${y + h}V${y + rr}a${rr} ${rr} 0 0 1 ${rr} -${rr}h${w - 2 * rr}a${rr} ${rr} 0 0 1 ${rr} ${rr}V${y + h}Z`
}

/**
 * Round the axis top up to a readable step rather than to the data's maximum.
 *
 * Steps are whole numbers by default, because every measure on this dashboard is a
 * count of people: on a quiet day with two readers, an axis labelled 0.5 and 1.5 is
 * offering half a person.
 */
function niceTicks(max: number, count = 4, integerOnly = true): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 1, ticks: [0, 1] }
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const candidates = [1, 2, 2.5, 5, 10]
    .map((m) => m * mag)
    .filter((s) => !integerOnly || (Number.isInteger(s) && s >= 1))
  const step = candidates.find((s) => s >= raw) ?? Math.max(integerOnly ? 1 : 0, mag * 10)
  const top = Math.ceil(max / step) * step
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

export interface Point {
  label: string
  a: number
  b?: number
}

/**
 * Bars for one measure with a line for a second, on ONE shared axis.
 *
 * Deliberately not a dual-axis chart: both series count people, so a second scale
 * would invent a relationship between them that the data does not have.
 */
export function BarsLine({
  data,
  width = 640,
  height = 210,
  barColor = SERIES[0],
  lineColor = SERIES[1],
  barWidth = 20,
  labelEvery = 2,
}: {
  data: Point[]
  width?: number
  height?: number
  barColor?: string
  lineColor?: string
  barWidth?: number
  labelEvery?: number
}) {
  if (data.length === 0) return <p className="muted">Nothing read yet.</p>

  const padL = 30
  const padR = 12
  const padT = 10
  const padB = 26
  const iw = width - padL - padR
  const ih = height - padT - padB
  const hasLine = data.some((d) => d.b !== undefined)
  const { top, ticks } = niceTicks(Math.max(...data.map((d) => Math.max(d.a, d.b ?? 0))))
  const y = (v: number) => padT + ih - (v / top) * ih
  const step = iw / data.length
  const cx = (i: number) => padL + step * i + step / 2
  const last = data.length - 1

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
          <text x={padL - 7} y={y(t) + 3.2} textAnchor="end" style={AXIS_TEXT}>
            {t}
          </text>
        </g>
      ))}
      <line x1={padL} x2={width - padR} y1={padT + ih} y2={padT + ih} stroke="#ccd4dd" strokeWidth={1} />

      {data.map((d, i) => (
        <path
          key={d.label}
          d={topBarPath(cx(i) - barWidth / 2, y(d.a), barWidth, padT + ih - y(d.a))}
          fill={barColor}
        >
          <title>{`${d.label}: ${d.a}`}</title>
        </path>
      ))}

      {hasLine && (
        <>
          <polyline
            points={data.map((d, i) => `${cx(i)},${y(d.b ?? 0)}`).join(' ')}
            fill="none"
            stroke={lineColor}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* One marker, on the latest point — a dot on every point is noise. */}
          <circle cx={cx(last)} cy={y(data[last]!.b ?? 0)} r={4} fill={lineColor} stroke="#fff" strokeWidth={2} />
        </>
      )}

      {data.map((d, i) =>
        i % labelEvery === 0 || i === last ? (
          <text key={d.label} x={cx(i)} y={height - 8} textAnchor="middle" style={AXIS_TEXT}>
            {d.label}
          </text>
        ) : null,
      )}
    </svg>
  )
}

/** Ordered magnitude, one hue, with the label outside the plot so bars start level. */
export function HBars({
  rows,
  width = 340,
  labelWidth = 60,
  valueWidth = 40,
  barHeight = 9,
  gap = 13,
  color = SERIES[0],
}: {
  rows: Array<{ label: string; value: number; display?: string; color?: string }>
  width?: number
  labelWidth?: number
  valueWidth?: number
  barHeight?: number
  gap?: number
  color?: string
}) {
  const height = rows.length * (barHeight + gap) - gap + 4
  const iw = width - labelWidth - valueWidth - 12
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {rows.map((r, i) => {
        const y = i * (barHeight + gap)
        const bw = r.value > 0 ? Math.max((r.value / max) * iw, 3) : 0
        return (
          <g key={r.label}>
            <text x={0} y={y + barHeight - 0.5} style={LABEL_TEXT}>
              {r.label}
            </text>
            <rect x={labelWidth} y={y} width={iw} height={barHeight} rx={4} fill="#eef1f5" />
            {bw > 0 && (
              <rect x={labelWidth} y={y} width={bw} height={barHeight} rx={4} fill={r.color ?? color} />
            )}
            <text
              x={width}
              y={y + barHeight - 0.5}
              textAnchor="end"
              style={{ ...AXIS_TEXT, fontSize: 11, fill: '#3a4450', fontWeight: 500 }}
            >
              {r.display ?? r.value}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Drop-off: one column per day, in order. A staircase down is the story.
 *
 * A zero-reader day is drawn as a visible empty track rather than a sliver, so
 * "nobody read it" cannot be mistaken for "no data here"; a day not yet reached is
 * a dashed track, which is a different fact again.
 */
export function Columns({
  values,
  width = 300,
  height = 74,
  color = SERIES[0],
  summaryAt = [],
  futureFrom = null,
  max,
  titles = [],
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
  summaryAt?: number[]
  futureFrom?: number | null
  max?: number
  titles?: string[]
}) {
  const peak = max ?? Math.max(...values, 1)
  const gap = 3
  const bw = (width - gap * (values.length - 1)) / values.length

  return (
    <svg viewBox={`0 0 ${width} ${height + 10}`} width="100%" height={height + 10} role="img">
      {values.map((v, i) => {
        const x = i * (bw + gap)
        const future = futureFrom !== null && i >= futureFrom
        const bh = (v / peak) * height
        return (
          <g key={i}>
            <rect
              x={x}
              y={0}
              width={bw}
              height={height}
              rx={2.5}
              fill={future ? 'transparent' : '#f1f4f7'}
              stroke={future ? '#e3e8ee' : undefined}
              strokeDasharray={future ? '2 2' : undefined}
            />
            {!future && bh > 0.5 && (
              <path d={topBarPath(x, height - bh, bw, bh, Math.min(3, bw / 2))} fill={color} />
            )}
            {summaryAt.includes(i) && (
              <path d={`M${x + bw / 2} ${height + 4}l2.6 4.4h-5.2z`} fill="var(--warn)" />
            )}
            <title>{titles[i] ?? `Day ${i + 1}: ${v} reader(s)`}</title>
          </g>
        )
      })}
      <line x1={0} x2={width} y1={height + 0.5} y2={height + 0.5} stroke="#ccd4dd" strokeWidth={1} />
    </svg>
  )
}

/** A trend shape beside a number. No axis, no labels — texture, not a chart. */
export function Sparkline({
  values,
  width = 92,
  height = 26,
  color = SERIES[0],
}: {
  values: number[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const x = (i: number) => (i / (values.length - 1)) * width
  const y = (v: number) => height - 2 - ((v - min) / span) * (height - 6)
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-hidden="true">
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={color} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={2.6} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  )
}

/** Cumulative growth: a single-series area with a 2px cap line. */
export function AreaChart({
  values,
  labels = [],
  width = 420,
  height = 132,
  color = SERIES[0],
}: {
  values: number[]
  labels?: string[]
  width?: number
  height?: number
  color?: string
}) {
  if (values.length < 2) return <p className="muted">Not enough history yet.</p>
  const padL = 28
  const padB = 20
  const iw = width - padL - 8
  const ih = height - padB - 8
  const { top, ticks } = niceTicks(Math.max(...values), 3)
  const x = (i: number) => padL + (i / (values.length - 1)) * iw
  const y = (v: number) => 8 + ih - (v / top) * ih
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padL} x2={width - 8} y1={y(t)} y2={y(t)} stroke={GRID} />
          <text x={padL - 6} y={y(t) + 3.2} textAnchor="end" style={AXIS_TEXT}>
            {t}
          </text>
        </g>
      ))}
      <polygon points={`${padL},${8 + ih} ${pts} ${width - 8},${8 + ih}`} fill={color} opacity={0.12} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={4} fill={color} stroke="#fff" strokeWidth={2} />
      {labels.map((l, i) => (
        <text
          key={l}
          x={x((i * (values.length - 1)) / Math.max(labels.length - 1, 1))}
          y={height - 5}
          textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
          style={AXIS_TEXT}
        >
          {l}
        </text>
      ))}
    </svg>
  )
}

/** Parts of one whole, with a 2px surface gap so the segments never touch. */
export function SplitBar({
  parts,
  width = 400,
  height = 26,
}: {
  parts: Array<{ value: number; color: string; label?: string }>
  width?: number
  height?: number
}) {
  const total = parts.reduce((n, p) => n + p.value, 0)
  if (total === 0) return null

  // Each segment gives up 2px to the surface so neighbours never touch; the offsets
  // are derived rather than accumulated in a variable, which keeps the render pure.
  const widths = parts.map((p, i) =>
    Math.max((p.value / total) * width - (i < parts.length - 1 ? 2 : 0), 0),
  )
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((n, w) => n + w + 2, 0))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      {parts.map((p, i) => {
        const pw = widths[i] ?? 0
        const at = offsets[i] ?? 0
        return (
          <g key={i}>
            <rect x={at} y={0} width={pw} height={height} rx={5} fill={p.color} />
            {pw > 56 && (
              <text
                x={at + 10}
                y={height / 2 + 4}
                style={{ fontFamily: 'var(--font-sans), sans-serif', fontSize: 11.5, fontWeight: 600, fill: '#fff' }}
              >
                {p.value}
              </text>
            )}
            <title>{`${p.label ?? ''} ${p.value}`.trim()}</title>
          </g>
        )
      })}
    </svg>
  )
}
