import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

import { plural } from '../domain/format'
import type { Barangay, DocKey } from '../domain/types'
import { createScan, deleteScans, photoUrl, scanErrorMessage, type ScanKind } from '../lib/scans'
import { useEditable } from '../state/access'
import { useScans } from '../state/scans'
import { useStore } from '../state/store'
import { useSync } from '../state/sync'
import { toast } from '../state/toast'
import { Modal } from './Modal'
import { PhotoTips } from './Illustrations'
import { pairingLink } from '../lib/pairing'

interface Photo {
  key: string
  file: File
  url: string
}

/**
 * "Scan IDs": pick several ID photos at once (camera or gallery on a phone, files on a computer), paired
 * front + back in the order chosen. They upload, get read, and open in the review pop-up one after another.
 */
export function ScanUpload({ b, open, onClose, mode = 'id' }: { b: Barangay; open: boolean; onClose: () => void; mode?: 'id' | 'list' }) {
  const list = mode === 'list'
  const remote = useStore((s) => s.remote)
  const online = useSync((s) => s.online)
  const review = useScans((s) => s.review)
  const upsert = useScans((s) => s.upsert)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [paired, setPaired] = useState(true)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Thumbnails use object URLs; free them when the photos go away.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const add = (files: FileList | null) => {
    const imgs = [...(files ?? [])].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name))
    if (!imgs.length) return toast('Choose photos (JPG or PNG).')
    setPhotos((ps) => [...ps, ...imgs.map((file) => ({ key: crypto.randomUUID?.() ?? String(Math.random()), file, url: URL.createObjectURL(file) }))])
  }
  // A list: every photo is one page. IDs: photos pair up as front + back.
  const ids: Photo[][] = paired && !list ? photos.reduce<Photo[][]>((acc, p, i) => (i % 2 ? acc[acc.length - 1].push(p) : acc.push([p]), acc), []) : photos.map((p) => [p])
  const swap = (i: number) =>
    setPhotos((ps) => {
      const next = [...ps]
      ;[next[2 * i], next[2 * i + 1]] = [next[2 * i + 1], next[2 * i]]
      return next
    })
  const removeId = (group: Photo[]) => {
    group.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos((ps) => ps.filter((p) => !group.includes(p)))
  }
  const reset = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url))
    setPhotos([])
    setProgress(null)
  }
  const close = () => {
    if (progress) return
    reset()
    onClose()
  }

  const room = Math.max(0, b.limit - b.tanods.length)
  const bid = remote?.brgyIds[b.name]

  const start = async () => {
    if (!remote || !bid) return
    setProgress({ done: 0, total: ids.length })
    const created: string[] = []
    let failed = 0
    let reason = ''
    for (const [front, back] of ids) {
      try {
        const scan = await createScan({ submissionId: remote.submissionId, barangayId: bid, kind: mode, front: front.file, back: back?.file ?? null })
        upsert(scan)
        created.push(scan.id)
      } catch (e) {
        failed++
        reason ||= scanErrorMessage(e)
      }
      setProgress((p) => p && { ...p, done: p.done + 1 })
    }
    reset()
    onClose()
    if (failed) toast(`${plural(failed, list ? 'page' : 'ID')} could not be uploaded. ${reason}`)
    if (created.length) review(created)
  }

  return (
    <Modal open={open} onClose={close} title={`${list ? 'Scan a list' : 'Scan IDs'} · Brgy. ${b.name}`} wide>
      <div className="modal-bd stack">
        {progress ? (
          <div className="stack upload-progress" role="status">
            <p className="big-line">Uploading and reading {list ? 'page' : 'ID'} {Math.min(progress.done + 1, progress.total)} of {progress.total}…</p>
            <span className="bar big"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></span>
            <p className="note">Keep this window open. The review starts as soon as they're done.</p>
          </div>
        ) : (
          <>
            <PhotoTips subject={list ? 'page' : 'id'} />
            <p className="note">
              {list
                ? 'One photo per page, typed or handwritten. Each line becomes a tanod; you check them all before anything is added.'
                : 'Pick many at once: the front, then the back of each ID, so they stay together.'}
            </p>
            <label
              className={`drop ${dragging ? 'over' : ''}`}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                add(e.dataTransfer.files)
              }}
            >
              <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = '' }} />
              <span className="btn primary big">Choose photos</span>
              <span className="note">On a phone you can take photos or pick them from the gallery. On a computer, you can also drag photos here.</span>
            </label>
            {!list && !photos.length && remote && remote.brgyIds[b.name] && (
              <PhonePair submissionId={remote.submissionId} barangayId={remote.brgyIds[b.name]} barangay={b.name} />
            )}
            {photos.length > 0 && (
              <>
                <label className="check-inline" hidden={list}>
                  <input type="checkbox" checked={paired} onChange={(e) => setPaired(e.target.checked)} />
                  Each ID has a front and a back photo
                </label>
                <ol className="id-pairs">
                  {ids.map((group, i) => (
                    <li key={group[0].key}>
                      <b>{list ? 'Page' : 'ID'} {i + 1}</b>
                      <div className="pair">
                        {group.map((p, side) => (
                          <figure key={p.key}>
                            <img src={p.url} alt={`ID ${i + 1} ${side ? 'back' : 'front'}`} />
                            <figcaption>{list ? '' : side ? 'Back' : 'Front'}</figcaption>
                          </figure>
                        ))}
                        {paired && !list && group.length === 1 && <div className="missing">No back photo</div>}
                      </div>
                      <div className="row">
                        {paired && !list && group.length === 2 && <button type="button" className="btn sm" onClick={() => swap(i)}>Swap front and back</button>}
                        <button type="button" className="btn sm danger" onClick={() => removeId(group)}>Remove</button>
                      </div>
                    </li>
                  ))}
                </ol>
                {!list && ids.length > room && (
                  <div className="banner">
                    Brgy. {b.name} has room for {plural(room, 'more tanod')} (limit {b.limit}). Every ID still uploads; the extra ones wait in "Scans to review" until there is room.
                  </div>
                )}
              </>
            )}
            {!online && <div className="banner bad">Uploading photos needs internet. Connect, then try again.</div>}
          </>
        )}
      </div>
      {!progress && (
        <div className="modal-ft">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="button" className="btn primary big" disabled={!ids.length || !online || !bid} onClick={start}>
            Upload and read {ids.length ? plural(ids.length, list ? 'page' : 'ID') : list ? 'pages' : 'IDs'}
          </button>
        </div>
      )}
    </Modal>
  )
}

/**
 * "Use your phone": a QR code the Sakto phone app scans to send IDs to this barangay. The phone signs in
 * with its own account; each ID it sends appears here and opens the review pop-up by itself.
 * (From the Hackathon repository's web app; shown open here so it's easy to find.)
 */
function PhonePair({ submissionId, barangayId, barangay }: { submissionId: number; barangayId: number; barangay: string }) {
  const [qr, setQr] = useState<string | null>(null)
  const link = pairingLink({ submissionId, barangayId, barangay })
  useEffect(() => {
    let live = true
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 2, width: 440 }).then(
      (url) => live && setQr(url),
      () => live && setQr(''),
    )
    return () => {
      live = false
    }
  }, [link])

  return (
    <section className="phone-pair" aria-label="Scan with the Sakto phone app">
      <h3>Or scan with the Sakto phone app</h3>
      <div className="phone-pair-bd">
        {qr ? <img src={qr} alt={`Pairing code for Brgy. ${barangay}`} width={220} height={220} /> : <div className="qr-wait">{qr === '' ? 'The code could not be made.' : 'Making the code…'}</div>}
        <ol>
          <li>Open the Sakto app on the phone and sign in with the <b>same account</b> you use here.</li>
          <li>Tap <b>Scan pairing code</b> and point the camera at this code.</li>
          <li>Photograph each ID. They arrive here one by one and the review opens by itself, so keep Sakto open on this computer. You can close this window.</li>
        </ol>
      </div>
    </section>
  )
}

const DOC_KIND: Partial<Record<DocKey, ScanKind>> = { cert: 'certification', designation: 'designation', spa: 'spa' }

/** "Attach photo" / "View photo" beside a document in the checklist. Attaching also ticks it as received. */
export function DocPhoto({ b, k }: { b: Barangay; k: DocKey }) {
  const kind = DOC_KIND[k]
  const remote = useStore((s) => s.remote)
  const setDoc = useStore((s) => s.setDoc)
  const online = useSync((s) => s.online)
  const editable = useEditable()
  const bid = remote?.brgyIds[b.name]
  const scan = useScans((s) => [...s.list].reverse().find((x) => x.kind === kind && x.barangay_id === bid && x.status === 'saved'))
  const all = useScans((s) => s.list)
  const upsert = useScans((s) => s.upsert)
  const drop = useScans((s) => s.remove)
  const [busy, setBusy] = useState(false)
  if (!kind || !remote || !bid) return null

  const attach = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const s = await createScan({ submissionId: remote.submissionId, barangayId: bid, kind, front: file, back: null })
      upsert(s)
      setDoc(b.name, k, true)
      toast('Photo attached and marked as received.')
    } catch (e) {
      toast(scanErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  // Removes the photo (and any older ones it replaced), so a wrong or blurry photo isn't kept or read.
  const removePhoto = async () => {
    if (!window.confirm('Remove this photo? It is deleted for good. The document stays ticked as received; untick it if you no longer have it.')) return
    const mine = all.filter((x) => x.kind === kind && x.barangay_id === bid)
    setBusy(true)
    try {
      await deleteScans(mine)
      mine.forEach((x) => drop(x.id))
      toast('Photo removed.')
    } catch (e) {
      toast(scanErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  const view = async () => {
    if (!scan?.front_path) return
    try {
      window.open(await photoUrl(scan.front_path), '_blank', 'noopener')
    } catch {
      toast('The photo could not be opened. Check your internet.')
    }
  }

  return (
    <span className="doc-photo">
      {scan && <a href="#" role="button" className="linkbtn" onClick={(e) => { e.preventDefault(); void view() }}>View photo</a>}
      {editable && online && (
        <label className={`linkbtn ${busy ? 'busy' : ''}`}>
          {busy ? 'Working…' : scan ? 'Replace photo' : 'Attach photo'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { void attach(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      )}
      {scan && editable && online && (
        <button type="button" className="linkbtn danger" disabled={busy} onClick={() => void removePhoto()}>Remove photo</button>
      )}
    </span>
  )
}
