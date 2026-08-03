// Client-side photo downscaling before upload.
//
// Clinic uplinks are slow: a raw 6-8MB phone photo can take longer than the
// proxy's body timeout to transmit, so the upload dies as a 408 and the UI
// spins forever. A receipt/check photo re-encoded to ≤1800px JPEG is a few
// hundred KB and visually identical for audit purposes.
//
// Only raster images the browser can decode are touched; PDFs, documents, and
// anything that fails to decode (e.g. HEIC on non-Safari) upload unchanged.

const COMPRESS_OVER_BYTES = 1_200_000
const MAX_DIMENSION = 1800
const JPEG_QUALITY = 0.82

const COMPRESSIBLE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function compressImageFile(file: File): Promise<File> {
  if (file.size <= COMPRESS_OVER_BYTES) return file
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const looksImage = COMPRESSIBLE.includes(file.type) || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)
  if (!looksImage) return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.size >= file.size) return file

    const base = file.name.replace(/\.[^.]+$/, '')
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
  } catch {
    return file // undecodable (e.g. HEIC outside Safari) — send as-is
  }
}
