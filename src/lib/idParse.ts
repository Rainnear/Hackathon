// Finds a person's name in the text read off a Philippine ID, using the labels printed on it:
//   PhilSys (national ID)   Apelyido/Last Name · Mga Pangalan/Given Names · Gitnang Apelyido/Middle Name
//   UMID / SSS / GSIS       SURNAME · GIVEN NAME · MIDDLE NAME
//   Voter's, postal, PRC    Last Name · First Name · Middle Name
//   Driver's license (LTO)  "Last Name, First Name, Middle Name" then "DELA CRUZ, JUAN SANTOS" on the next line
// No dependencies, so it can be tested on its own.

export interface OcrLine {
  text: string
  /** 0 to 1 */
  conf: number
}

export interface ParsedId {
  last: string
  first: string
  middle: string
  suffix: string
  birthdate: string
  confidence: { last: number; first: number; mi: number; suffix: number; birthdate: number }
}

const LAST = /\b(APELYIDO|LAST\s*NAME|SURNAME|FAMILY\s*NAME)\b/
const FIRST = /\b(MGA\s*PANGALAN|GIVEN\s*NAMES?|FIRST\s*NAME)\b/
const MIDDLE = /\b(GITNANG\s*APELYIDO|MIDDLE\s*NAME)\b/
const BIRTH = /\b(PETSA\s*NG\s*KAPANGANAKAN|DATE\s*OF\s*BIRTH|BIRTH\s*DATE|BIRTHDATE|DOB|KAPANGANAKAN)\b/
const ANY_LABEL = new RegExp([LAST, FIRST, MIDDLE, BIRTH].map((r) => r.source).join('|') + '|\\b(SEX|KASARIAN|ADDRESS|TIRAHAN|NATIONALITY|BLOOD|CIVIL\\s*STATUS|SIGNATURE|LAGDA|ID\\s*NO|CRN|EXPIRATION|VALID|AGENCY)\\b')
const SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV']

const up = (s: string) => s.toUpperCase().replace(/[‘’`]/g, "'").replace(/\s+/g, ' ').trim()

/** What is left of a line once its label words are taken out ("APELYIDO/LAST NAME: DELA CRUZ" → "DELA CRUZ"). */
function stripLabels(s: string, keepSlashes = false) {
  return s
    .replace(new RegExp(ANY_LABEL.source, 'g'), ' ')
    // Dates like 1979/03/02 keep their slashes; for names a slash only separates label words.
    .replace(keepSlashes ? /[:|]/g : /[/:|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Keep letters (with Ñ), spaces, hyphens, periods and commas; anything else is OCR noise. */
function cleanName(s: string) {
  const v = up(s).replace(/[^A-ZÑ .,'-]/g, '').replace(/\s+/g, ' ').replace(/^[ .,'-]+|[ ,'-]+$/g, '').trim()
  // A real name has at least two letters and isn't mostly punctuation.
  return (v.match(/[A-ZÑ]/g)?.length ?? 0) >= 2 ? v : ''
}

/** The value for a label: on the same line after the label, or else on the next line that isn't a label. */
function valueAfter(lines: OcrLine[], i: number, isName: boolean): { text: string; conf: number } | null {
  const same = stripLabels(up(lines[i].text), !isName)
  const sameVal = isName ? cleanName(same) : same
  if (sameVal && sameVal.length >= 2) return { text: sameVal, conf: lines[i].conf }
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
    const t = up(lines[j].text)
    if (ANY_LABEL.test(t)) {
      // The next line is a label too: its leftover text may still be our value (labels side by side).
      continue
    }
    const v = isName ? cleanName(t) : t
    if (v) return { text: v, conf: lines[j].conf }
  }
  return null
}

function splitSuffix(name: string): { name: string; suffix: string } {
  const parts = name.replace(/,/g, ' ').split(' ').filter(Boolean)
  const lastTok = parts.at(-1)?.replace(/\./g, '') ?? ''
  if (parts.length > 1 && SUFFIXES.includes(lastTok)) {
    return { name: parts.slice(0, -1).join(' '), suffix: ['JR', 'SR'].includes(lastTok) ? `${lastTok}.` : lastTok }
  }
  return { name: parts.join(' '), suffix: '' }
}

export function parseIdText(raw: OcrLine[]): ParsedId {
  const lines = raw.map((l) => ({ text: l.text, conf: l.conf })).filter((l) => l.text.trim())
  const out: ParsedId = { last: '', first: '', middle: '', suffix: '', birthdate: '', confidence: { last: 0, first: 0, mi: 0, suffix: 0, birthdate: 0 } }

  for (let i = 0; i < lines.length; i++) {
    const t = up(lines[i].text)
    const hasLast = LAST.test(t)
    const hasFirst = FIRST.test(t)

    // Driver's license: all three labels on one line, the full name on the next ("LAST, FIRST MIDDLE").
    if (hasLast && hasFirst && !out.last) {
      const next = lines.slice(i + 1, i + 3).find((l) => cleanName(l.text).includes(','))
      if (next) {
        const [lastPart, rest = ''] = cleanName(next.text).split(',', 2)
        const given = rest.replace(/,/g, ' ').trim().split(' ').filter(Boolean)
        const s = splitSuffix(lastPart.trim())
        out.last = s.name
        // With no separate middle-name line, the middle name is taken as the last word; a little less sure.
        out.middle = given.length > 1 ? given.at(-1)! : ''
        const firstS = splitSuffix(given.slice(0, given.length > 1 ? -1 : undefined).join(' '))
        out.first = firstS.name
        out.suffix = s.suffix || firstS.suffix
        out.confidence.last = next.conf
        out.confidence.first = next.conf * 0.9
        out.confidence.mi = out.middle ? next.conf * 0.7 : 0
        out.confidence.suffix = next.conf
        continue
      }
    }
    if (hasLast && !out.last) {
      const v = valueAfter(lines, i, true)
      if (v) {
        const s = splitSuffix(v.text.replace(/,.*$/, ''))
        out.last = s.name
        if (s.suffix) out.suffix = s.suffix
        out.confidence.last = v.conf
      }
    } else if (hasFirst && !out.first) {
      const v = valueAfter(lines, i, true)
      if (v) {
        const s = splitSuffix(v.text.replace(/,/g, ' '))
        out.first = s.name
        if (s.suffix) out.suffix = s.suffix
        out.confidence.first = v.conf
        out.confidence.suffix = v.conf
      }
    } else if (MIDDLE.test(t) && !out.middle) {
      const v = valueAfter(lines, i, true)
      if (v) {
        out.middle = v.text
        out.confidence.mi = v.conf
      }
    } else if (BIRTH.test(t) && !out.birthdate) {
      const v = valueAfter(lines, i, false)
      const date = v?.text.match(/\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|[A-Z]{3,9}\.? \d{1,2},? \d{4}|\d{1,2} [A-Z]{3,9}\.? \d{4}/)
      if (v && date) {
        out.birthdate = date[0]
        out.confidence.birthdate = v.conf
      }
    }
  }
  if (!out.suffix) out.confidence.suffix = Math.min(out.confidence.last || 1, out.confidence.first || 1)
  return out
}

/** Sure enough to skip the AI reader: both names found and read clearly. */
export const parsedIsSure = (p: ParsedId, threshold = 0.75) =>
  !!p.last && !!p.first && p.confidence.last >= threshold && p.confidence.first >= threshold

// ---------- Lists: one tanod per line ----------

export interface ListRow {
  last: string
  first: string
  /** "S." or "" */
  mi: string
  suffix: string
  /** 0 to 1: how sure the reader is of this row. */
  conf: number
}

// Surname particles that belong with the word after them ("DELA CRUZ", "DE LOS SANTOS", "STA. ANA").
const PARTICLES = ['DE', 'DEL', 'DELA', 'DELOS', 'DE LA', 'DE LOS', 'DELAS', 'SAN', 'STA', 'STA.', 'STO', 'STO.', 'LA', 'LAS', 'LOS']
const HEADER = /\b(NAME|PANGALAN|LIST|LISTAHAN|BARANGAY|TANOD|MUNICIPALITY|SIGNATURE|POSITION|NO\.?|TOTAL|CERTIF|PREPARED|NOTED|APPROVED)\b/
const isInitial = (t: string) => /^[A-ZÑ]\.?$/.test(t)
const suffixOf = (t: string) => {
  const s = t.replace(/\./g, '')
  return SUFFIXES.includes(s) ? (['JR', 'SR'].includes(s) ? `${s}.` : s) : ''
}

/** Split "JUAN S. DELA CRUZ", "DELA CRUZ, JUAN S." or "1. Juan Dela Cruz Jr." into parts. Null if it isn't a name. */
export function parseNameLine(raw: string, conf = 1): ListRow | null {
  let s = up(raw)
    .replace(/^\s*[(#]?\d{1,3}[).:-]?\s+/, '') // leading numbering "1." "12)" "(3"
    .replace(/[^A-ZÑ .,'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!s || HEADER.test(s) || (s.match(/[A-ZÑ]/g)?.length ?? 0) < 4) return null
  let suffix = ''
  let mi = ''
  if (s.includes(',')) {
    // "LAST, FIRST M." (the usual way lists are written)
    const [lastPart, ...rest] = s.split(',')
    // The suffix can sit anywhere after the comma ("RAMON JR., P." or "RAMON P. JR.").
    const words = rest.join(' ').split(' ').filter(Boolean)
    const sIdx = words.findIndex((w) => suffixOf(w))
    if (sIdx >= 0) suffix = suffixOf(words.splice(sIdx, 1)[0])
    const given = words
    if (given.length > 1 && isInitial(given.at(-1)!)) mi = `${given.pop()![0]}.`
    const lastWords = lastPart.trim().split(' ').filter(Boolean)
    if (!suffix && lastWords.length > 1 && suffixOf(lastWords.at(-1)!)) suffix = suffixOf(lastWords.pop()!)
    const row = { last: lastWords.join(' '), first: given.join(' '), mi, suffix, conf }
    return row.last && row.first ? row : null
  }
  // "FIRST M. LAST": an initial in the middle separates the given names from the surname.
  const words = s.split(' ').filter(Boolean)
  if (words.length < 2) return null
  if (suffixOf(words.at(-1)!)) suffix = suffixOf(words.pop()!)
  const iIdx = words.findIndex((w, i) => i > 0 && i < words.length - 1 && isInitial(w))
  if (iIdx > 0) {
    return { first: words.slice(0, iIdx).join(' '), mi: `${words[iIdx][0]}.`, last: words.slice(iIdx + 1).join(' '), suffix, conf }
  }
  // No initial: the surname is the last word, plus any particle before it ("JUAN DELA CRUZ"). Less sure.
  let cut = words.length - 1
  while (cut > 1 && PARTICLES.includes(words[cut - 1])) cut--
  if (cut > 1 && PARTICLES.includes(`${words[cut - 2]} ${words[cut - 1]}`)) cut -= 2
  return { first: words.slice(0, cut).join(' '), mi: '', last: words.slice(cut).join(' '), suffix, conf: conf * 0.7 }
}

export function parseListLines(lines: OcrLine[]): ListRow[] {
  return lines.map((l) => parseNameLine(l.text, l.conf)).filter((r): r is ListRow => !!r)
}
