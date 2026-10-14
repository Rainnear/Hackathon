/**
 * Shrinks a photo to at most `max` pixels on its long side, as JPEG. ID text stays readable and an upload
 * drops from several MB to a few hundred KB, which matters on prepaid mobile data. Falls back to the
 * original file when the browser can't decode it (e.g. HEIC outside Safari).
 */
export async function shrinkPhoto(file: Blob, max = 1600, quality = 0.85): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale)
    canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    return blob && blob.size < file.size ? blob : file
  } catch {
    return file
  }
}

export const extensionFor = (type: string) =>
  ({ 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' })[type] ?? 'jpg'
