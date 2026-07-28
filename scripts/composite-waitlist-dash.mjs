/**
 * Stamp Credyx wordmark onto the real product screenshot navbar.
 * Keeps the authentic top bar + light sidebar from the source capture.
 */
import sharp from 'sharp'

const SRC =
  'C:/Users/Work/.cursor/projects/c-Users-Work-Desktop-Tools-AIDocView-main/assets/c__Users_Work_AppData_Roaming_Cursor_User_workspaceStorage_6828370191d56ba88745a37007b20610_images_Screenshot_2026-07-28_185124-3d3d23e0-095d-438c-bd65-d5dc936689d1.png'
const LOGO =
  'C:/Users/Work/.cursor/projects/c-Users-Work-Desktop-Tools-AIDocView-main/assets/c__Users_Work_AppData_Roaming_Cursor_User_workspaceStorage_6828370191d56ba88745a37007b20610_images_Generated_image-28e317d1-2213-4208-b8ce-85e665e1517d.png'

const OUT_PUBLIC = 'C:/Users/Work/Desktop/Tools/AIDocView-main/public/credyx-waitlist-dashboard.jpg'
const OUT_ASSETS =
  'C:/Users/Work/.cursor/projects/c-Users-Work-Desktop-Tools-AIDocView-main/assets/credyx-waitlist-dashboard.jpg'
const DEBUG = 'C:/Users/Work/Desktop/Tools/AIDocView-main/public/_nav-brand-debug.png'

const meta = await sharp(SRC).metadata()
const W = meta.width
const H = meta.height

// Top navbar brand zone: C-square + "ABC Trucking" (left of top bar)
const brandX = Math.round(W * 0.012)
const brandY = Math.round(H * 0.012)
const brandW = Math.round(W * 0.22)
const brandH = Math.round(H * 0.07)

const plate = await sharp({
  create: {
    width: brandW,
    height: brandH,
    channels: 3,
    background: { r: 255, g: 255, b: 255 },
  },
})
  .png()
  .toBuffer()

const wordmark = await sharp(LOGO)
  .trim({ threshold: 20 })
  .resize({ height: Math.max(22, Math.round(brandH * 0.55)), fit: 'inside' })
  .png()
  .toBuffer()
const wm = await sharp(wordmark).metadata()

const companySvg = Buffer.from(
  `<svg width="${Math.round(brandW * 0.55)}" height="${brandH}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="0" y="${Math.round(brandH * 0.62)}" ` +
    `font-family="Inter, Segoe UI, Arial, sans-serif" ` +
    `font-size="${Math.max(13, Math.round(brandH * 0.38))}" ` +
    `font-weight="600" fill="#334155">Demo Carrier LLC</text></svg>`
)
const company = await sharp(companySvg).png().toBuffer()

const logoLeft = 6
const companyLeft = logoLeft + wm.width + 12

const brandBlock = await sharp(plate)
  .composite([
    { input: wordmark, left: logoLeft, top: Math.round((brandH - wm.height) / 2) },
    { input: company, left: companyLeft, top: 0 },
  ])
  .png()
  .toBuffer()

await sharp(brandBlock).toFile(DEBUG)

const result = await sharp(SRC)
  .composite([{ input: brandBlock, left: brandX, top: brandY }])
  .jpeg({ quality: 95 })
  .toBuffer()

await sharp(result).toFile(OUT_PUBLIC)
await sharp(result).toFile(OUT_ASSETS)

console.log({
  src: `${W}x${H}`,
  brand: `${brandW}x${brandH} @ ${brandX},${brandY}`,
  wm: `${wm.width}x${wm.height}`,
})
