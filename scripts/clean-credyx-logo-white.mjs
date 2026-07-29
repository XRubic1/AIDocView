import fs from 'fs'
import { createCanvas, loadImage } from 'canvas'

const inputPath = 'public/credyx-logo-white-cred-no-bg.png'
const outputPath = 'public/credyx-logo-white-cred-no-bg.png'

// Removes semi-transparent near-white pixels that often create a “white matte/halo”
// around PNG transparency on dark backgrounds.
const WHITE_THRESHOLD = 235
const ALPHA_KEEP_OPAQUE_ONLY = 245 // keep pixels alpha>=245, remove alpha<245

const img = await loadImage(inputPath)
const canvas = createCanvas(img.width, img.height)
const ctx = canvas.getContext('2d')

ctx.clearRect(0, 0, canvas.width, canvas.height)
ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
const data = imageData.data

for (let i = 0; i < data.length; i += 4) {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  const a = data[i + 3]

  const nearWhite = r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD
  const hasAlpha = a > 0
  const isSemiTransparentMatte = hasAlpha && a < ALPHA_KEEP_OPAQUE_ONLY

  // If it's near-white and only semi-transparent, assume it belongs to the matte/halo.
  // Preserve opaque white letters (alpha close to 255) to avoid destroying the logo.
  if (nearWhite && isSemiTransparentMatte) {
    data[i + 3] = 0
  }
}

ctx.putImageData(imageData, 0, 0)

const out = canvas.toBuffer('image/png')
fs.writeFileSync(outputPath, out)

console.log(`Cleaned logo written to ${outputPath}`)

