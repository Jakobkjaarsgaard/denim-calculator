import { SYNTHETIC_OCR_LISTING_TEXT } from './fixtures'

/**
 * Generates a high-contrast PNG File containing synthetic listing text using an HTML5 Canvas.
 * Useful for testing browser-local OCR with a legible screenshot.
 */
export async function createSyntheticListingImageFile(
  text: string = SYNTHETIC_OCR_LISTING_TEXT,
  filename = 'synthetic-listing-screenshot.png'
): Promise<File> {
  const canvas = document.createElement('canvas')
  const lines = text.split(/\r?\n/)
  const width = 760
  const lineHeight = 44
  const padding = 48
  const height = Math.max(320, padding * 2 + lines.length * lineHeight)

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  // Pure white background for clean OCR recognition
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, width, height)

  // Clear dark text in sans-serif font
  ctx.fillStyle = '#000000'
  ctx.font = 'bold 26px Arial, Helvetica, sans-serif'
  ctx.textBaseline = 'top'

  lines.forEach((line, index) => {
    ctx.fillText(line, padding, padding + index * lineHeight)
  })

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('Failed to encode synthetic PNG'))
    }, 'image/png')
  })

  return new File([blob], filename, { type: 'image/png' })
}

/**
 * Generates a PNG File depicting a pair of jeans with no written text/numbers
 * to verify that an unreadable or photo-only screenshot reports a clean read failure
 * while keeping manual fields intact.
 */
export async function createUnreadableDenimPhotoFile(
  filename = 'denim-photo-no-text.png'
): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable')
  }

  // Indigo denim background with simple stitched pocket silhouette, zero text
  ctx.fillStyle = '#1E2F46'
  ctx.fillRect(0, 0, 400, 300)

  ctx.strokeStyle = '#D99B4E'
  ctx.lineWidth = 3
  ctx.strokeRect(120, 60, 160, 180)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('Failed to encode photo PNG'))
    }, 'image/png')
  })

  return new File([blob], filename, { type: 'image/png' })
}
