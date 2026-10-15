// Supabase Edge Function "read-scan": reads a scanned ID (the holder's name), one page of a typed or
// handwritten list of tanods (one row per person), or the names on a signed Barangay Certification,
// with an AI model. Sakto calls it only when the free
// on-device reader isn't sure: always the case for handwriting.
//
// Works with OpenAI or Anthropic, whichever key you add (Edge Functions → Secrets):
//   OPENAI_API_KEY      → OpenAI (model: OPENAI_MODEL, default gpt-6-astra; gpt-6.1-sol costs less)
//   ANTHROPIC_API_KEY   → Anthropic Claude
// If both are set, AI_PROVIDER = "openai" or "anthropic" picks one (default: openai).
//
// Deploy (no CLI needed): Supabase dashboard → Edge Functions → Deploy a new function → Via editor,
// name it read-scan, paste this file, Deploy.
//
// It runs as the signed-in person (their Authorization header), so row-level security decides which
// scans and photos it can read: a secretary only their own barangay's. No service-role key is used.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import OpenAI from 'npm:openai@7.25.0'
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const SUFFIXES = ['', 'JR.', 'SR.', 'II', 'III', 'IV']
const FIELDS = ['last_name', 'first_name', 'middle_name', 'suffix', 'birthdate'] as const

const ID_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_id: { type: 'boolean' },
    id_type: { type: 'string' },
    last_name: { type: 'string' },
    first_name: { type: 'string' },
    middle_name: { type: 'string' },
    suffix: { type: 'string', enum: SUFFIXES },
    birthdate: { type: 'string' },
    confidence: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'number' }])),
      required: [...FIELDS],
    },
  },
  required: ['is_id', 'id_type', ...FIELDS, 'confidence'],
}

const ID_PROMPT = `The photos above are one Philippine ID card (front, and the back if given), sent by a barangay secretary to list a barangay tanod for the provincial incentive.

Read the card holder's name and birthdate exactly as printed.
- last_name: the surname, all of it (e.g. "DELA CRUZ").
- first_name: all given names (e.g. "JUAN MIGUEL"), without the suffix.
- middle_name: the middle name (mother's maiden surname), if printed.
- suffix: JR., SR., II, III or IV only if printed; otherwise "".
- birthdate: as printed, or "" if not visible.
- Use capital letters and keep Ñ. Never guess a value you cannot see; leave it "".
- confidence: for each field, 0 to 1 for how clearly it can be read (0 if empty). Use a low value for glare, blur or a partly hidden field.
- is_id: false if this is not an ID card; id_type: e.g. "PhilSys national ID", "Driver's license", "UMID", "Voter's ID", "Barangay ID".`

const LIST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    is_list: { type: 'boolean' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          last_name: { type: 'string' },
          first_name: { type: 'string' },
          middle_initial: { type: 'string' },
          suffix: { type: 'string', enum: SUFFIXES },
          confidence: { type: 'number' },
        },
        required: ['last_name', 'first_name', 'middle_initial', 'suffix', 'confidence'],
      },
    },
  },
  required: ['is_list', 'rows'],
}

const LIST_PROMPT = `The photo above is one page of a typed or handwritten list of barangay tanods, sent by a barangay secretary so each person can be added to the tanod list for the provincial incentive.

Return one row per person, in the order they appear, top to bottom.
- Skip titles, column headers, line numbers, positions, signatures, dates and any name that is crossed out.
- Split each name: last_name (the whole surname, e.g. "DELA CRUZ"), first_name (all given names), middle_initial (one letter, no period, or ""), suffix (JR., SR., II, III or IV, or "").
- Names may be written "Juan S. Dela Cruz" or "Dela Cruz, Juan S."; the surname is usually after the middle initial, or before the comma.
- Use capital letters and keep Ñ. If a handwritten letter is unclear, give your best reading and a low confidence; never add people who are not written on the page.
- confidence: 0 to 1 per row, for how sure you are of that whole row.
- is_list: false if the page has no list of names.`

const CERT_PROMPT = `The photo above is a signed Barangay Certification from the Province of Iloilo. It says "This is to certify that the following names:" and then lists the barangay's tanods, usually numbered.

Return one row per person in that list, in the order they appear, top to bottom.
- Only the names in the list of tanods. Skip the Punong Barangay, signatures, dates, the barangay and municipality names, and anything crossed out.
- Split each name: last_name (the whole surname, e.g. "DELA CRUZ"), first_name (all given names), middle_initial (one letter, no period, or ""), suffix (JR., SR., II, III or IV, or "").
- Names are usually written "JUAN S. DELA CRUZ": the surname comes after the middle initial.
- Use capital letters and keep Ñ. If a letter is unclear, give your best reading and a low confidence; never add people who are not written on the page.
- confidence: 0 to 1 per row, for how sure you are of that whole row.
- is_list: false if the page has no list of names.`

type ImageType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
const IMAGE_TYPES: ImageType[] = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
interface Photo {
  label: string
  mediaType: ImageType
  base64: string
}

function toBase64(bytes: Uint8Array) {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** The model declined or returned nothing usable. */
class Unreadable extends Error {}

// ---------- Providers ----------
const openaiKey = Deno.env.get('OPENAI_API_KEY')
const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
const provider = (Deno.env.get('AI_PROVIDER') ?? (openaiKey ? 'openai' : 'anthropic')).toLowerCase()
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null
const anthropic = anthropicKey ? new Anthropic({ apiKey: anthropicKey }) : null

async function askOpenAI(photos: Photo[], prompt: string, name: string, schema: Record<string, unknown>): Promise<unknown> {
  const response = await openai!.responses.create({
    model: Deno.env.get('OPENAI_MODEL') ?? 'gpt-6-astra',
    input: [
      {
        role: 'user',
        content: [
          ...photos.flatMap((p) => [
            { type: 'input_text' as const, text: p.label },
            // "high" detail: handwriting and small ID print need the full resolution.
            { type: 'input_image' as const, image_url: `data:${p.mediaType};base64,${p.base64}`, detail: 'high' as const },
          ]),
          { type: 'input_text', text: prompt },
        ],
      },
    ],
    text: { format: { type: 'json_schema', name, schema, strict: true } },
  })
  // A refusal or a cut-off answer leaves no usable JSON.
  if (response.status !== 'completed' || !response.output_text) throw new Unreadable()
  return JSON.parse(response.output_text)
}

async function askAnthropic(photos: Photo[], prompt: string, schema: Record<string, unknown>): Promise<unknown> {
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = photos.flatMap((p) => [
    { type: 'text' as const, text: p.label },
    { type: 'image' as const, source: { type: 'base64' as const, media_type: p.mediaType, data: p.base64 } },
  ])
  content.push({ type: 'text', text: prompt })
  const response = await anthropic!.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    // If a safety classifier declines, Anthropic retries on its recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  })
  if (response.stop_reason === 'refusal') throw new Unreadable()
  const text = response.content.find((b) => b.type === 'text')
  if (!text || text.type !== 'text') throw new Unreadable()
  return JSON.parse(text.text)
}

function ask(photos: Photo[], prompt: string, name: string, schema: Record<string, unknown>) {
  if (provider === 'openai' && openai) return askOpenAI(photos, prompt, name, schema)
  if (anthropic) return askAnthropic(photos, prompt, schema)
  if (openai) return askOpenAI(photos, prompt, name, schema)
  throw new Error('No AI key set. Add OPENAI_API_KEY (or ANTHROPIC_API_KEY) under Edge Functions → Secrets.')
}

// ---------- The request ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405)
  const auth = req.headers.get('Authorization')
  if (!auth) return json({ error: 'Sign in first.' }, 401)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const body = await req.json().catch(() => ({}))
  const scanId = typeof body?.scan_id === 'string' ? body.scan_id : ''
  if (!scanId) return json({ error: 'scan_id is required.' }, 400)

  const { data: scan, error } = await supabase.from('scans').select('id, kind, front_path, back_path').eq('id', scanId).maybeSingle()
  if (error) return json({ error: error.message }, 500)
  if (!scan || !['id', 'list', 'certification'].includes(scan.kind) || !scan.front_path) return json({ error: 'Scan not found.' }, 404)
  // A signed certification is read like a list: one row per tanod named on it.
  const isList = scan.kind === 'list' || scan.kind === 'certification'

  const photos: Photo[] = []
  for (const [label, path] of [['Front', scan.front_path], ['Back', scan.back_path]] as const) {
    if (!path) continue
    const { data: blob, error: dlError } = await supabase.storage.from('scans').download(path)
    if (dlError || !blob) return json({ error: `Could not open the ${label.toLowerCase()} photo.` }, 500)
    photos.push({
      label: isList ? 'The page:' : `${label} of the ID:`,
      mediaType: (IMAGE_TYPES as string[]).includes(blob.type) ? (blob.type as ImageType) : 'image/jpeg',
      base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
    })
  }

  try {
    if (isList) {
      const r = (await ask(photos, scan.kind === 'certification' ? CERT_PROMPT : LIST_PROMPT, 'tanod_list', LIST_SCHEMA)) as {
        is_list: boolean
        rows: { last_name: string; first_name: string; middle_initial: string; suffix: string; confidence: number }[]
      }
      if (!r.is_list) return json({ rows: [] })
      return json({
        provider,
        rows: r.rows
          .map((x) => ({
            last: String(x.last_name ?? '').trim(),
            first: String(x.first_name ?? '').trim(),
            mi: x.middle_initial ? `${String(x.middle_initial).trim()[0]}.` : '',
            suffix: SUFFIXES.includes(x.suffix) ? x.suffix : '',
            conf: typeof x.confidence === 'number' ? x.confidence : 0.5,
          }))
          .filter((x) => x.last || x.first),
      })
    }

    const r = (await ask(photos, ID_PROMPT, 'id_card', ID_SCHEMA)) as {
      is_id: boolean
      id_type: string
      last_name: string
      first_name: string
      middle_name: string
      suffix: string
      birthdate: string
      confidence: Record<(typeof FIELDS)[number], number>
    }
    if (!r.is_id) return json({ fields: null, id_type: r.id_type })
    const middle = String(r.middle_name ?? '').trim()
    return json({
      provider,
      id_type: r.id_type,
      fields: {
        last: String(r.last_name ?? '').trim(),
        first: String(r.first_name ?? '').trim(),
        mi: middle ? `${middle[0]}.` : '',
        suffix: SUFFIXES.includes(r.suffix) ? r.suffix : '',
        birthdate: String(r.birthdate ?? '').trim(),
        confidence: {
          last: r.confidence?.last_name ?? 0,
          first: r.confidence?.first_name ?? 0,
          mi: r.confidence?.middle_name ?? 0,
          suffix: r.confidence?.suffix ?? 0,
          birthdate: r.confidence?.birthdate ?? 0,
        },
      },
    })
  } catch (e) {
    if (e instanceof Unreadable) return json({ error: 'The photo could not be read.' }, 422)
    if (e instanceof OpenAI.AuthenticationError || e instanceof Anthropic.AuthenticationError)
      return json({ error: 'The AI key is missing or wrong. Check it under Edge Functions → Secrets.' }, 500)
    if (e instanceof OpenAI.RateLimitError || e instanceof Anthropic.RateLimitError)
      return json({ error: 'The AI reader is busy or out of credit. Try again in a minute, or check the account balance.' }, 429)
    if (e instanceof OpenAI.APIError) return json({ error: `AI reader error ${e.status}: ${e.message}` }, 502)
    if (e instanceof Anthropic.APIError) return json({ error: `AI reader error ${e.status}: ${e.message}` }, 502)
    return json({ error: (e as Error).message }, 500)
  }
})
