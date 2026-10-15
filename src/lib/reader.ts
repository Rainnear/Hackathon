// Reads a tanod's name off the front (and back) photos of their ID, or every name on a photographed
// list (one per line), in two steps:
//   1. Free, on this device: Tesseract reads the text and idParse finds the name by its printed labels.
//   2. Only if step 1 is not sure (always, for handwriting): the "read-scan" Edge Function asks an AI model.
//      The AI key lives in Supabase, never in the app. If the function isn't deployed, step 1's result
//      (possibly partial) is used and the secretary types the rest in the review pop-up.
import type Tesseract from 'tesseract.js'

import type { Suffix } from '../domain/types'
import { parseIdText, parseListLines, parsedIsSure, type ListRow, type OcrLine, type ParsedId } from './idParse'
import { supabase } from './supabase'

export type IdField = 'last' | 'first' | 'mi' | 'suffix' | 'birthdate'

export interface IdFields {
  last: string
  first: string
  mi: string
  suffix: Suffix
  /** As printed on the ID, if found. Shown to help tell apart people with the same name. */
  birthdate: string
  /** 0 to 1 per field; the pop-up asks the secretary to check anything below 0.8 or empty. */
  confidence: Partial<Record<IdField, number>>
  /** Who filled it: 'free' (on-device reader), 'ai' (Edge Function), or 'none'. */
  reader: string
}

/** A reader is always available now (the free one), so the pop-up no longer says "not connected". */
export const READER_CONNECTED = true

export const blankFields = (reader = 'none'): IdFields => ({ last: '', first: '', mi: '', suffix: '', birthdate: '', confidence: {}, reader })

const SUFFIXES: Suffix[] = ['', 'JR.', 'SR.', 'II', 'III', 'IV']

function toFields(p: ParsedId, reader: string): IdFields {
  const suffix = (SUFFIXES as string[]).includes(p.suffix) ? (p.suffix as Suffix) : ''
  return {
    last: p.last,
    first: p.first,
    mi: p.middle ? `${p.middle.replace(/[^A-ZÑ]/g, '')[0] ?? ''}.`.replace(/^\.$/, '') : '',
    suffix,
    birthdate: p.birthdate,
    confidence: p.confidence,
    reader,
  }
}

// One reader for the whole session, started on first use and stopped after a quiet spell.
let worker: Promise<Tesseract.Worker> | null = null
let idle: ReturnType<typeof setTimeout> | undefined
async function getWorker() {
  clearTimeout(idle)
  worker ??= import('tesseract.js').then(({ createWorker }) => createWorker('eng'))
  idle = setTimeout(() => {
    void worker?.then((w) => w.terminate())
    worker = null
  }, 3 * 60_000)
  return worker
}

async function readLines(image: Blob): Promise<OcrLine[]> {
  const w = await getWorker()
  const { data } = await w.recognize(image, { rotateAuto: true }, { blocks: true })
  return (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text, conf: l.confidence / 100 }))))
}

/** The free, on-device reader. Returns null if it couldn't run (e.g. no internet the very first time). */
async function readFree(front: Blob, back: Blob | null): Promise<ParsedId | null> {
  try {
    let p = parseIdText(await readLines(front))
    if (back && (!p.birthdate || !p.last || !p.first)) {
      const b = parseIdText(await readLines(back))
      // Some IDs print the name on the back; birthdates are often there too.
      if (!p.last && b.last) p = { ...b, birthdate: p.birthdate || b.birthdate }
      if (!p.birthdate && b.birthdate) p = { ...p, birthdate: b.birthdate, confidence: { ...p.confidence, birthdate: b.confidence.birthdate } }
    }
    return p
  } catch {
    return null
  }
}

/** The AI reader (Supabase Edge Function "read-scan"). Null if it isn't deployed, failed, or found nothing. */
async function readAi(scanId: string): Promise<IdFields | null> {
  try {
    const { data, error } = await supabase.functions.invoke('read-scan', { body: { scan_id: scanId } })
    if (error || !data?.fields) return null
    const f = data.fields as Omit<IdFields, 'reader'>
    if (!f.last && !f.first) return null
    return { ...blankFields('ai'), ...f, suffix: (SUFFIXES as string[]).includes(f.suffix) ? f.suffix : '', reader: 'ai' }
  } catch {
    return null
  }
}

export async function readId(front: Blob, back: Blob | null, scanId?: string): Promise<IdFields> {
  const free = await readFree(front, back)
  if (free && parsedIsSure(free)) return toFields(free, 'free')
  const ai = scanId ? await readAi(scanId) : null
  if (ai) return ai
  return free ? toFields(free, 'free') : blankFields()
}

export interface ListFields {
  rows: ListRow[]
  /** 'free', 'ai', or 'none' when nothing could be read (the secretary types from the photo). */
  reader: string
}

async function readAiList(scanId: string): Promise<ListRow[] | null> {
  try {
    const { data, error } = await supabase.functions.invoke('read-scan', { body: { scan_id: scanId } })
    if (error || !Array.isArray(data?.rows)) return null
    return (data.rows as ListRow[]).map((r) => ({ ...r, suffix: (SUFFIXES as string[]).includes(r.suffix) ? r.suffix : '' }))
  } catch {
    return null
  }
}

/** Reads one page of a list. Printed lists usually stay on the device; handwriting goes to the AI reader. */
export async function readList(page: Blob, scanId?: string): Promise<ListFields> {
  let free: ListRow[] | null = null
  try {
    free = parseListLines(await readLines(page))
  } catch {
    free = null
  }
  // Only trust the free reader when every line came out clearly.
  if (free?.length && free.every((r) => r.conf >= 0.75)) return { rows: free, reader: 'free' }
  const ai = scanId ? await readAiList(scanId) : null
  if (ai?.length) return { rows: ai, reader: 'ai' }
  return { rows: free ?? [], reader: free?.length ? 'free' : 'none' }
}
