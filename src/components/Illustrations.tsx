import type { ReactNode } from 'react'

import type { TemplateId } from '../domain/types'

// Spot illustrations, drawn inline so they work offline and follow the light and dark themes: every
// fill and line uses the app's colour tokens through the .il-* classes in styles.css. Decorative only
// (aria-hidden): the words next to them always say the same thing.

const Svg = ({ w, h, className = '', children }: { w: number; h: number; className?: string; children: ReactNode }) => (
  <svg className={`il ${className}`} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" focusable="false">
    {children}
  </svg>
)

/** A tanod: cap, face, uniform. */
function Tanod({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect className="il-a" x="-13" y="20" width="26" height="34" rx="9" />
      <rect className="il-cap" x="-13" y="34" width="26" height="4" />
      <circle className="il-skin" cx="0" cy="10" r="10" />
      <path className="il-cap" d="M-11 4 Q0 -8 11 4 Z" />
      <rect className="il-cap" x="-12" y="3" width="24" height="3" rx="1.5" />
      <rect className="il-w" x="6" y="25" width="5" height="5" rx="1" />
    </g>
  )
}

/** Sign-in: the barangay hall, its flag, and two tanods. */
export function HallArt() {
  return (
    <Svg w={320} h={140} className="il-hero">
      <ellipse className="il-s" cx="160" cy="128" rx="150" ry="10" />
      <circle className="il-w" cx="278" cy="30" r="16" />
      <line className="il-ln" x1="52" y1="126" x2="52" y2="28" />
      <path className="il-a" d="M53 30h26l-6 7 6 7H53z" />
      <rect className="il-p il-ln" x="78" y="62" width="128" height="64" rx="3" />
      <path className="il-a" d="M70 64 142 28l72 36z" />
      <rect className="il-p" x="118" y="44" width="48" height="12" rx="2" />
      <rect className="il-s" x="129" y="88" width="26" height="38" rx="2" />
      <rect className="il-s" x="92" y="78" width="22" height="18" rx="2" />
      <rect className="il-s" x="170" y="78" width="22" height="18" rx="2" />
      <line className="il-ln" x1="122" y1="50" x2="162" y2="50" />
      <Tanod x={236} y={70} />
      <Tanod x={266} y={74} s={0.92} />
    </Svg>
  )
}

/** Waiting for approval: a clock on a phone. */
export function WaitingArt() {
  return (
    <Svg w={200} h={120} className="il-spot">
      <ellipse className="il-s" cx="100" cy="112" rx="80" ry="7" />
      <rect className="il-p il-ln" x="66" y="6" width="68" height="104" rx="12" />
      <rect className="il-g" x="88" y="12" width="24" height="4" rx="2" />
      <circle className="il-s" cx="100" cy="56" r="24" />
      <path className="il-ink" d="M100 42v15l10 7" />
      <circle className="il-a" cx="134" cy="22" r="12" />
      <path className="il-onA" d="M129 22h10M134 17v10" transform="rotate(45 134 22)" />
      <rect className="il-g" x="80" y="88" width="40" height="6" rx="3" />
    </Svg>
  )
}

/** An empty tanod list: an ID card and a clipboard waiting to be filled. */
export function EmptyListArt() {
  return (
    <Svg w={220} h={124} className="il-spot">
      <ellipse className="il-s" cx="110" cy="116" rx="96" ry="7" />
      <rect className="il-p il-ln" x="40" y="12" width="78" height="100" rx="6" />
      <rect className="il-a" x="62" y="6" width="34" height="12" rx="4" />
      {[34, 50, 66, 82].map((y) => (
        <g key={y}>
          <rect className="il-g" x="52" y={y} width="8" height="8" rx="2" />
          <rect className="il-g" x="66" y={y + 2} width="40" height="4" rx="2" />
        </g>
      ))}
      <g transform="rotate(-6 160 70)">
        <rect className="il-p il-ln" x="118" y="44" width="80" height="52" rx="6" />
        <rect className="il-a" x="118" y="44" width="80" height="12" rx="6" />
        <rect className="il-a" x="118" y="50" width="80" height="6" />
        <circle className="il-skin" cx="138" cy="74" r="9" />
        <rect className="il-g" x="154" y="66" width="34" height="5" rx="2.5" />
        <rect className="il-g" x="154" y="76" width="24" height="5" rx="2.5" />
      </g>
      <circle className="il-a" cx="190" cy="30" r="14" />
      <path className="il-onA" d="M184 30h12M190 24v12" />
    </Svg>
  )
}

/** Review, all clear: the documents with a check seal. */
export function AllClearArt() {
  return (
    <Svg w={200} h={120} className="il-spot">
      <ellipse className="il-s" cx="100" cy="112" rx="80" ry="7" />
      <rect className="il-p il-ln" x="52" y="20" width="62" height="84" rx="4" transform="rotate(-8 83 62)" />
      <rect className="il-p il-ln" x="76" y="14" width="62" height="88" rx="4" />
      {[30, 42, 54, 66].map((y) => <rect key={y} className="il-g" x="86" y={y} width="42" height="5" rx="2.5" />)}
      <circle className="il-ok" cx="138" cy="84" r="22" />
      <path className="il-onA" d="m128 84 7 7 13-14" />
    </Svg>
  )
}

/** Photo tips for scanning: what a good ID or page photo looks like. */
export function PhotoTips({ subject }: { subject: 'id' | 'page' }) {
  const page = subject === 'page'
  const item = page
    ? (
        <g>
          <rect className="il-p il-ln" x="34" y="14" width="40" height="52" rx="3" />
          {[24, 32, 40, 48].map((y) => <rect key={y} className="il-g" x="40" y={y} width="28" height="3" rx="1.5" />)}
        </g>
      )
    : (
        <g>
          <rect className="il-p il-ln" x="26" y="24" width="56" height="36" rx="4" />
          <rect className="il-a" x="26" y="24" width="56" height="8" rx="4" />
          <circle className="il-skin" cx="38" cy="45" r="6" />
          <rect className="il-g" x="48" y="40" width="26" height="4" rx="2" />
          <rect className="il-g" x="48" y="48" width="18" height="4" rx="2" />
        </g>
      )
  const tips = [
    {
      label: page ? 'Straight on, flat on a table' : 'Flat on a table',
      art: (
        <>
          <rect className="il-g" x="6" y="58" width="96" height="10" rx="3" />
          {item}
          <path className="il-ln-dash" d="M54 4v14" />
        </>
      ),
    },
    {
      label: 'Good light, no glare',
      art: (
        <>
          <circle className="il-w" cx="88" cy="14" r="9" />
          {item}
        </>
      ),
    },
    {
      label: page ? 'The whole page in view' : 'The whole ID in view',
      art: (
        <>
          {item}
          <path className="il-a-ln" d="M14 14h10M14 14v10M94 14H84M94 14v10M14 70h10M14 70V60M94 70H84M94 70V60" />
        </>
      ),
    },
  ]
  return (
    <ul className="photo-tips">
      {tips.map((t) => (
        <li key={t.label}>
          <Svg w={108} h={76}>{t.art}</Svg>
          <span>{t.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** How Sakto works, in four steps. */
export function HowItWorks({ compact = false }: { compact?: boolean }) {
  const steps = [
    {
      t: 'Encode',
      d: 'Scan IDs or type each tanod',
      art: (
        <>
          <rect className="il-p il-ln" x="18" y="10" width="44" height="58" rx="4" />
          {[22, 32, 42].map((y) => <rect key={y} className="il-g" x="26" y={y} width="28" height="4" rx="2" />)}
          <path className="il-a" d="m58 44 14-14 6 6-14 14-8 2z" />
        </>
      ),
    },
    {
      t: 'Check',
      d: 'Fix what Sakto points out',
      art: (
        <>
          <rect className="il-p il-ln" x="14" y="10" width="44" height="58" rx="4" />
          {[22, 32, 42].map((y) => <rect key={y} className="il-g" x="22" y={y} width="28" height="4" rx="2" />)}
          <circle className="il-s il-a-ln" cx="56" cy="46" r="13" />
          <path className="il-a-ln" d="m65 55 10 10" />
        </>
      ),
    },
    {
      t: 'Print',
      d: 'Payroll, certification, IDs',
      art: (
        <>
          <rect className="il-p il-ln" x="26" y="6" width="36" height="22" rx="2" />
          <rect className="il-a" x="10" y="26" width="68" height="28" rx="6" />
          <rect className="il-p il-ln" x="24" y="44" width="40" height="28" rx="2" />
          <rect className="il-g" x="30" y="52" width="28" height="4" rx="2" />
          <circle className="il-w" cx="68" cy="34" r="3" />
        </>
      ),
    },
    {
      t: 'Hand over',
      d: 'To the Liga Rep, on time',
      art: (
        <>
          <path className="il-w" d="M10 30h26l6 6h30v32H10z" />
          <path className="il-a" d="M10 38h62v30H10z" />
          <circle className="il-ok" cx="62" cy="22" r="12" />
          <path className="il-onA" d="m56 22 4 4 8-8" />
        </>
      ),
    },
  ]
  return (
    <ol className={`how ${compact ? 'compact' : ''}`}>
      {steps.map((s, i) => (
        <li key={s.t}>
          <Svg w={88} h={76}>{s.art}</Svg>
          <b>{i + 1}. {s.t}</b>
          <span>{s.d}</span>
        </li>
      ))}
    </ol>
  )
}

/** A miniature of each printed form, for the Templates cards. */
export function DocThumb({ id }: { id: TemplateId }) {
  const lines = (x: number, y: number, n: number, w: number, gap = 7) =>
    Array.from({ length: n }, (_, i) => <rect key={i} className="il-g" x={x} y={y + i * gap} width={w} height="3" rx="1.5" />)
  if (id === 'payroll')
    return (
      <Svg w={120} h={84} className="il-thumb">
        <rect className="il-p il-ln" x="4" y="4" width="112" height="76" rx="3" />
        <rect className="il-a" x="40" y="10" width="40" height="4" rx="2" />
        <rect className="il-ln" x="12" y="20" width="96" height="44" />
        {[29, 38, 47, 56].map((y) => <line key={y} className="il-ln-thin" x1="12" y1={y} x2="108" y2={y} />)}
        <line className="il-ln-thin" x1="30" y1="20" x2="30" y2="64" />
        <line className="il-ln-thin" x1="84" y1="20" x2="84" y2="64" />
        <path className="il-a-ln" d="M88 34c3-3 5 2 8-1s4 1 6-1M88 52c3-3 5 2 8-1s4 1 6-1" />
        <rect className="il-s" x="12" y="68" width="96" height="6" rx="1" />
      </Svg>
    )
  if (id === 'idcopy')
    return (
      <Svg w={84} h={110} className="il-thumb">
        <rect className="il-p il-ln" x="4" y="4" width="76" height="102" rx="3" />
        <rect className="il-a" x="22" y="10" width="40" height="4" rx="2" />
        <rect className="il-s il-ln-thin" x="12" y="22" width="28" height="20" rx="2" />
        <rect className="il-s il-ln-thin" x="44" y="22" width="28" height="20" rx="2" />
        <circle className="il-skin" cx="20" cy="31" r="4" />
        {[70, 82, 94].map((y) => (
          <g key={y}>
            <path className="il-a-ln" d={`M16 ${y - 4}c4-4 6 3 10-1s5 2 8-1`} />
            <line className="il-ln-thin" x1="12" y1={y} x2="72" y2={y} />
          </g>
        ))}
      </Svg>
    )
  if (id === 'certification')
    return (
      <Svg w={84} h={110} className="il-thumb">
        <rect className="il-p il-ln" x="4" y="4" width="76" height="102" rx="3" />
        <circle className="il-w" cx="42" cy="18" r="7" />
        <rect className="il-a" x="24" y="30" width="36" height="4" rx="2" />
        {lines(14, 42, 4, 56)}
        {lines(22, 72, 2, 40, 6)}
        <path className="il-a-ln" d="M48 92c4-5 7 3 11-1s6 2 9-1" />
        <line className="il-ln-thin" x1="44" y1="96" x2="72" y2="96" />
      </Svg>
    )
  if (id === 'cover')
    return (
      <Svg w={84} h={110} className="il-thumb">
        <rect className="il-p il-ln" x="4" y="4" width="76" height="102" rx="3" />
        <rect className="il-a" x="12" y="12" width="34" height="5" rx="2.5" />
        {lines(12, 24, 4, 32)}
        <g className="il-ink-f">
          <rect x="52" y="12" width="20" height="20" rx="1" className="il-p il-ln-thin" />
          {[[54, 14], [64, 14], [54, 24], [59, 19], [66, 25], [62, 21]].map(([x, y], i) => <rect key={i} x={x} y={y} width="4" height="4" />)}
        </g>
        <rect className="il-ln-thin" x="12" y="58" width="60" height="38" />
        {[66, 74, 82].map((y) => <line key={y} className="il-ln-thin" x1="12" y1={y} x2="72" y2={y} />)}
      </Svg>
    )
  // The masterlist: a numbered table.
  return (
    <Svg w={84} h={110} className="il-thumb">
      <rect className="il-p il-ln" x="4" y="4" width="76" height="102" rx="3" />
      <rect className="il-a" x="18" y="10" width="48" height="4" rx="2" />
      <rect className="il-ln-thin" x="12" y="22" width="60" height="66" />
      {[30, 38, 46, 54, 62, 70, 78].map((y) => <line key={y} className="il-ln-thin" x1="12" y1={y} x2="72" y2={y} />)}
      <line className="il-ln-thin" x1="20" y1="22" x2="20" y2="88" />
      <line className="il-ln-thin" x1="12" y1="98" x2="34" y2="98" />
      <line className="il-ln-thin" x1="50" y1="98" x2="72" y2="98" />
    </Svg>
  )
}
