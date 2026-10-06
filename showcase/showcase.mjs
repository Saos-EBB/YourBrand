// Showcase: derselbe Ablauf fuer jeden laufenden Mandanten — Screenshot pro
// Schritt + Video pro Mandant, danach Vergleichsbilder (und mit ffmpeg ein
// Vergleichsvideo) nebeneinander. Zeigt, dass es eine Codebasis ist, die sich
// pro Mandant anders verhaelt (Marke, Theme, Sprache, Module).
//
//   npm install && npx playwright install chromium   (einmalig)
//   scripts/tenant.sh up all                          (Mandanten muessen laufen)
//   npm run showcase                    alle Mandanten mit tenants/<slug>/.env (+ default, falls erreichbar)
//   npm run showcase -- kiez underground   nur diese
//   npm run showcase -- --compose-only     nur Vergleichsbilder/-video aus out/ neu bauen
//
// Ergebnis in showcase/out/: <slug>/NN-<schritt>.png, <slug>/ablauf.webm,
// vergleich-NN-<schritt>.png, vergleich.mp4 (nur mit ffmpeg).
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const outDir = path.join(here, 'out')
const personas = JSON.parse(fs.readFileSync(path.join(here, 'personas.json'), 'utf8'))
const PASSWORD = 'Demo1234!'
const VIEWPORT = { width: 1280, height: 800 }
// Hidden-Zone-Passwort (frontend/hooks/useHiddenZone.ts, MASTER_KEY).
const HIDDEN_KEY = 'YourBrand'
const executablePath = process.env.CHROMIUM_PATH || undefined

const args = process.argv.slice(2)
const composeOnly = args.includes('--compose-only')
const only = args.filter((a) => !a.startsWith('--'))

function envValue(file, key) {
  const line = fs.readFileSync(file, 'utf8').split('\n').find((l) => l.startsWith(`${key}=`))
  return line?.slice(key.length + 1).trim()
}

// Mandanten mit .env (von scripts/tenant.sh) + der Haupt-Stack "default".
function discoverTenants() {
  const list = [{ slug: 'default', frontend: 'http://localhost:3001', backend: 'http://localhost:3000' }]
  for (const slug of fs.readdirSync(path.join(root, 'tenants'))) {
    const env = path.join(root, 'tenants', slug, '.env')
    if (slug.startsWith('_') || slug === 'default' || !fs.existsSync(env)) continue
    list.push({
      slug,
      frontend: `http://localhost:${envValue(env, 'FRONTEND_PORT')}`,
      backend: `http://localhost:${envValue(env, 'BACKEND_PORT')}`,
    })
  }
  return list.filter((t) => only.length === 0 || only.includes(t.slug))
}

async function fetchTenant(t) {
  try {
    const res = await fetch(`${t.backend}/api/v1/tenant`, { signal: AbortSignal.timeout(5000) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

async function run(t, config) {
  const persona = personas[t.slug]
  if (!persona) return console.log(`  uebersprungen: keine Persona in personas.json`)
  const dir = path.join(outDir, t.slug)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })

  const browser = await chromium.launch({ executablePath })
  const context = await browser.newContext({ viewport: VIEWPORT, recordVideo: { dir, size: VIEWPORT } })
  // Next.js-Dev-Anzeige (Badge unten links) ausblenden — die Stacks laufen
  // im Dev-Modus, im Video soll nur die App zu sehen sein.
  // Constructable Stylesheet statt <style>-Tag: React entfernt bei der
  // Hydration fremde Knoten unter <html>, adoptedStyleSheets ueberleben das.
  await context.addInitScript(() => {
    const sheet = new CSSStyleSheet()
    sheet.replaceSync('nextjs-portal { display: none !important; }')
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
  })
  const page = await context.newPage()
  let n = 0
  const shot = async (name) => {
    const file = path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`)
    await page.screenshot({ path: file })
    console.log(`  ${path.relative(here, file)}`)
  }
  const settle = (ms = 2500) => page.waitForTimeout(ms)
  // Demo-Banner wegklicken, damit er nicht in jedem Bild steht.
  const closeBanner = async () => {
    const close = page.locator('[aria-label*="schlie" i], [aria-label*="close" i]').first()
    if (await close.isVisible().catch(() => false)) await close.click().catch(() => {})
  }

  try {
    await page.goto(`${t.frontend}/login`)
    await settle()
    await closeBanner()
    await page.locator('input:not([type=password])').first().pressSequentially(persona.user, { delay: 35 })
    await page.locator('input[type=password]').pressSequentially(PASSWORD, { delay: 35 })
    await shot('login')
    await page.keyboard.press('Enter')
    // Erster Login nach dem Seed: DSGVO-Zustimmung (/consent, AGB + Datenschutz)
    // — als eigener Schritt im Showcase, danach geht es normal weiter.
    await page.waitForURL(/dashboard|onboarding|consent/, { timeout: 30000 })
    if (page.url().includes('/consent')) {
      await settle(1500)
      for (const box of await page.locator('form input[type=checkbox]').all()) await box.check()
      await shot('zustimmung')
      await page.locator('form button[type=submit]').click()
      await page.waitForURL(/dashboard|onboarding/, { timeout: 30000 })
    }

    await page.goto(`${t.frontend}/dashboard`)
    await settle(3500)
    await shot('dashboard')

    if (config.modules.chat) {
      await page.goto(`${t.frontend}/chat`)
      await settle()
      await shot('chats')
      // Die ganze Zeile anklicken (aria-label "Unterhaltung mit <nickname>"),
      // nicht den Namen — der ist ein Link aufs Profil.
      await page.locator(`li [aria-label*="${persona.chatWith}"]`).first().click()
      await settle(3000)
      await shot('chat')
    }

    if (config.modules.matching) {
      await page.goto(`${t.frontend}/discover`)
      await settle(3500)
      await shot('discover')
    }

    if (config.modules.hidden) {
      // Einstieg wie ein Nutzer: 6x aufs Logo, Passwort ins Overlay.
      await page.goto(`${t.frontend}/dashboard`)
      await settle()
      const logo = page.locator(`aside button[aria-label="${config.brand.name} home"]`)
      for (let i = 0; i < 6; i++) { await logo.click(); await page.waitForTimeout(150) }
      const input = page.locator('[aria-label="Hidden area entry"] input')
      await input.waitFor({ timeout: 15000 })
      await settle(1500)
      await input.pressSequentially(HIDDEN_KEY, { delay: 60 })
      await page.keyboard.press('Enter')
      await settle(5000)
      await page.goto(`${t.frontend}/beef`)
      await settle(3000)
      // Tab "Public" (laufende Beefs) ueber die Position — die Labels wechseln
      // mit der Sprache, die Hidden Zone schaltet z.B. auf Leetspeak um.
      // Reihenfolge laut frontend/app/(app)/beef/page.tsx: requests, mine, public, ...
      await page.locator('main').last().locator('div.flex.border-b').first().locator('button').nth(2).click()
      await settle(2500)
      await shot('hidden-zone')
    }

    await page.goto(`${t.frontend}/settings`)
    await settle()
    await shot('einstellungen')
  } catch (err) {
    console.log(`  FEHLER: ${err.message.split('\n')[0]}`)
    await shot('fehler').catch(() => {})
  } finally {
    const video = page.video()
    await context.close()
    await browser.close()
    if (video) fs.renameSync(await video.path(), path.join(dir, 'ablauf.webm'))
  }
}

// Vergleich: pro Schritt ein Raster aller Mandanten, die den Schritt haben.
async function compose() {
  const tenants = fs.readdirSync(outDir).filter((d) => fs.statSync(path.join(outDir, d)).isDirectory()).sort()
  if (tenants.length === 0) return
  const steps = new Map()
  for (const slug of tenants) {
    for (const f of fs.readdirSync(path.join(outDir, slug)).filter((f) => f.endsWith('.png'))) {
      const step = f.replace(/^\d+-/, '').replace(/\.png$/, '')
      if (!steps.has(step)) steps.set(step, [])
      steps.get(step).push({ slug, file: path.join(outDir, slug, f) })
    }
  }
  const order = ['login', 'zustimmung', 'dashboard', 'chats', 'chat', 'discover', 'hidden-zone', 'einstellungen']
  // Alte Vergleiche weg — sonst bleiben Dateien aus frueheren Laeufen liegen.
  for (const f of fs.readdirSync(outDir).filter((f) => f.startsWith('vergleich'))) fs.rmSync(path.join(outDir, f))
  const browser = await chromium.launch({ executablePath })
  const page = await browser.newPage({ viewport: { width: 2580, height: 800 } })
  for (const step of order.filter((s) => steps.has(s))) {
    const cells = steps.get(step)
    const cols = cells.length > 2 ? 2 : cells.length
    const html = `<body style="margin:0;background:#0d0d0d;display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;padding:10px;font:600 24px system-ui,sans-serif;color:#eee">${
      cells.map((c) => `<div>${c.slug}<img src="file://${c.file}" style="width:100%;display:block;margin-top:6px;border-radius:6px"></div>`).join('')}</body>`
    const file = path.join(outDir, `.vergleich.html`)
    fs.writeFileSync(file, html)
    await page.goto(`file://${file}`)
    await page.waitForTimeout(500)
    // Nummer = Position im festen Ablauf, unabhaengig davon, welche Schritte es gibt.
    const target = path.join(outDir, `vergleich-${String(order.indexOf(step) + 1).padStart(2, '0')}-${step}.png`)
    await page.screenshot({ path: target, fullPage: true })
    console.log(`  ${path.relative(here, target)}`)
    fs.rmSync(file)
  }
  await browser.close()

  // Vergleichsvideo 2x2 (bis zu 4 Mandanten) — nur wenn ffmpeg installiert ist.
  const videos = tenants.map((s) => path.join(outDir, s, 'ablauf.webm')).filter((f) => fs.existsSync(f)).slice(0, 4)
  if (videos.length < 2) return
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  } catch {
    return console.log('  ffmpeg nicht gefunden — kein Vergleichsvideo (Einzelvideos liegen in out/<slug>/)')
  }
  const w = VIEWPORT.width / 2, h = VIEWPORT.height / 2
  const inputs = videos.flatMap((v) => ['-i', v])
  const scaled = videos.map((_, k) => `[${k}:v]scale=${w}:${h},setpts=PTS-STARTPTS[v${k}]`).join(';')
  const layout = videos.length === 2 ? '0_0|w0_0' : videos.length === 3 ? '0_0|w0_0|0_h0' : '0_0|w0_0|0_h0|w0_h0'
  const filter = `${scaled};${videos.map((_, k) => `[v${k}]`).join('')}xstack=inputs=${videos.length}:layout=${layout}:fill=black[out]`
  const target = path.join(outDir, 'vergleich.mp4')
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', target])
  console.log(`  ${path.relative(here, target)} (${videos.map((v) => path.basename(path.dirname(v))).join(', ')})`)
}

fs.mkdirSync(outDir, { recursive: true })
if (!composeOnly) {
  for (const t of discoverTenants()) {
    console.log(`== ${t.slug} (${t.frontend})`)
    const config = await fetchTenant(t)
    if (!config) { console.log('  nicht erreichbar — uebersprungen'); continue }
    await run(t, config)
  }
}
console.log('== Vergleich')
await compose()
