import { DATA_LABELS, DATA_ORDER, formatBytes, useDataMeter } from '../lib/dataMeter'
import { formatDateTime } from '../domain/format'
import { Box } from './ui'

/** How much internet Sakto has used since this tab opened, by what it was for. */
export function DataMeterCard() {
  const bytes = useDataMeter((s) => s.bytes)
  const since = useDataMeter((s) => s.since)
  const reset = useDataMeter((s) => s.reset)
  const used = DATA_ORDER.filter((k) => bytes[k] > 0)
  const total = used.reduce((a, k) => a + bytes[k], 0)
  return (
    <Box
      title="Data used this session"
      tip="Counted on this device since Sakto was opened in this tab, so you know what each step costs on mobile data. Sizes are close estimates. The reader model downloads only the first time on a device; the reader's engine (up to about 4 MB, also once) isn't counted."
      aside={
        <div className="row">
          <span className="badge">{formatBytes(total)}</span>
          <button type="button" className="btn sm" onClick={reset}>Start over</button>
        </div>
      }
      className="dash-card data-meter"
      collapsible="dash-data"
    >
      <div className="box-bd">
        {used.length ? (
          <p className="dm-line">
            {used.map((k) => (
              <span key={k}>
                {DATA_LABELS[k]} <b className="num">{formatBytes(bytes[k])}</b>
                {k === 'model' && <small> (first time only)</small>}
              </span>
            ))}
          </p>
        ) : (
          <p className="note">Nothing downloaded or uploaded yet in this session.</p>
        )}
        <p className="note">Since {formatDateTime(since)}</p>
      </div>
    </Box>
  )
}
