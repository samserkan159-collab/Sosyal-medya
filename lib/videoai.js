import { GoogleGenAI } from '@google/genai'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { spawnFfmpeg } from '@/lib/ffmpeg'
import { UPLOAD_DIR, ensureDirs, safeName } from '@/lib/paths'
import { probeDuration } from '@/lib/video'
import { VIDEO_AI_MODELS, modelCatalog } from '@/lib/videoai-models'

export { VIDEO_AI_MODELS, modelCatalog }

const KEY = process.env.GEMINI_API_KEY
const TEXT_MODEL = process.env.AI_MODEL || 'gemini-3.8-flash'

export function videoAiConfigured() {
  return !!KEY
}

function requireKey() {
  if (!KEY) throw new Error('GEMINI_API_KEY tanimli degil')
}

function client() {
  requireKey()
  return new GoogleGenAI({ apiKey: KEY })
}

function textOf(response) {
  if (!response) return ''
  if (typeof response.text === 'string' && response.text) return response.text
  const parts = response?.candidates?.[0]?.content?.parts
  if (Array.isArray(parts)) return parts.map((p) => p?.text || '').join('')
  return ''
}

function extractJson(text) {
  if (!text) return null
  let t = String(text).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1)
  try { return JSON.parse(t) } catch { return null }
}

function findModel(id) {
  return VIDEO_AI_MODELS.find((m) => m.id === id)
}

export function estimateUsd(modelId, seconds) {
  const m = findModel(modelId)
  if (!m) return null
  const sec = Number(seconds)
  if (!m.durations.includes(sec)) return null
  return Number((m.usdPerSec * sec).toFixed(2))
}

const PROMPT_SYSTEM = `Sen reklam ve Reels yonetmenisin. Google Veo / Gemini Omni icin profesyonel, sinematik video promptu yazarsin.
Kamera, isik, hareket, urun netligi, gercekcilik. Abarti reklam dili yok. SADECE gecerli JSON dondur.
prompt = modele gidecek INGILIZCE (daha iyi sonuc). promptTr = AYNI sahnenin TAM Turkce karsiligi.
Kullanici Turkce sahne yazdiysa YENI SAHNE UYDURMA — onun yazdigini Ingilizceye cevir.`

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const ff = spawnFfmpeg(args)
    let err = ''
    ff.stderr.on('data', (d) => { err += d.toString() })
    ff.on('error', (e) => reject(new Error('ffmpeg: ' + e.message)))
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-220) || 'ffmpeg ' + code))))
  })
}

/** Tam videoyu Gemini'ye gonderme — pahali. 3-5 kucuk kare yeter. */
async function framesFromVideo(buffer) {
  const dir = path.join(os.tmpdir(), `aivid_fr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  await fs.mkdir(dir, { recursive: true })
  const src = path.join(dir, 'in.mp4')
  await fs.writeFile(src, buffer)
  try {
    let dur = 10
    try { dur = await probeDuration(src) } catch { /* sure yoksa 10sn varsay */ }
    const span = Math.min(Math.max(dur, 1), 60)
    const n = span <= 8 ? 3 : 5
    const parts = []
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.35) / n) * span
      const dest = path.join(dir, `f${i}.jpg`)
      await runFfmpeg(['-y', '-ss', t.toFixed(2), '-i', src, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '6', dest])
      const buf = await fs.readFile(dest)
      if (buf.length > 80) parts.push({ inlineData: { mimeType: 'image/jpeg', data: buf.toString('base64') } })
    }
    return parts
  } finally {
    try { await fs.rm(dir, { recursive: true, force: true }) } catch { /* tmp */ }
  }
}

export async function buildScenePrompt({ kind, buffer, mime, description, refImages }) {
  requireKey()
  const note = (description || '').trim()
  const refs = Array.isArray(refImages) ? refImages.filter((r) => r?.buffer) : []

  if (kind === 'text' || (!buffer && !refs.length && note)) {
    if (!note) throw new Error('Turkce sahne yazin')
    const synced = await syncScenePrompt({ source: 'tr', text: note })
    return {
      titleTr: '',
      prompt: synced.prompt,
      promptTr: note,
      notesTr: 'Senin Turkce sahnen Ingilizceye cevrildi — yeni sahne uydurulmadi.',
    }
  }

  const extra = note ? `\nKullanici notu: "${note}"` : ''
  const roleList = refs.map((r, i) => `${i + 1}) ${r.role || 'gorsel'}`).join('; ')
  const what = kind === 'video'
    ? 'Bunlar urun videosundan alinmis kareler (tam video degil). Sahne, kamera, isik, urun, tempo yaz.'
    : refs.length
      ? `Kullanici referans fotograflar verdi. Roller: ${roleList}. Videoda bu varliklari birlestir (or: kisi + klima + veri ekrani). Yeni kisi/urun uydurma; fotolardaki yuz, urun ve ekran ayni kalsin.`
      : 'Bu bir urun / mekan fotografidir.'
  const userText = `${what}${extra}

Cikis JSON:
{
  "titleTr": "kisa Turkce baslik",
  "promptTr": "Ayni sahnenin TAM Turkce metni (hangi resim kim: kisi, klima, ekran)",
  "prompt": "Veo/Omni icin Ingilizce sinematik prompt (promptTr ile ayni sahne, roller net)",
  "notesTr": "Turkce 1 cumle"
}`

  const parts = [{ text: userText }]
  if (kind === 'video' && buffer) {
    const frames = await framesFromVideo(buffer)
    if (!frames.length) throw new Error('Videodan kare alinamadi')
    parts.push(...frames)
  } else if (refs.length) {
    for (let i = 0; i < refs.length; i++) {
      const r = refs[i]
      parts.push({ text: `Resim ${i + 1} — rol: ${r.role || 'gorsel'}` })
      parts.push({ inlineData: { mimeType: r.mime || 'image/jpeg', data: Buffer.from(r.buffer).toString('base64') } })
    }
  } else if (buffer && mime) {
    parts.push({ inlineData: { mimeType: mime, data: Buffer.from(buffer).toString('base64') } })
  }

  const response = await client().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      systemInstruction: PROMPT_SYSTEM,
      temperature: 0.45,
      responseMimeType: 'application/json',
    },
  })
  const raw = textOf(response)
  const json = extractJson(raw)
  if (json?.prompt || json?.promptTr) {
    return {
      titleTr: json.titleTr || '',
      prompt: json.prompt || '',
      promptTr: json.promptTr || '',
      notesTr: json.notesTr || '',
    }
  }
  if (raw) return { titleTr: '', prompt: raw, promptTr: '', notesTr: '' }
  throw new Error('Sahne promptu uretilemedi')
}

export async function syncScenePrompt({ source, text }) {
  requireKey()
  const src = String(text || '').trim()
  if (!src) throw new Error('Cevirilecek metin yok')
  const fromTr = String(source || '') === 'tr'
  const userText = fromTr
    ? `Asagidaki Turkce sahneyi Veo/Omni icin Ingilizce video promptuna CEVIR. Yeni sahne, ekstra kamera veya urun UYDURMA. Sadece dil + hafif sinematik ifade.\n\n${src}\n\nJSON: {"prompt":"Ingilizce ceviri","promptTr":"kullanicinin Turkcesi (aynen koru)"}`
    : `Asagidaki Ingilizce video promptunu Turkceye cevir. Ayni sahne. Ozetleme.\n\n${src}\n\nJSON: {"prompt":"orijinal Ingilizceyi koru","promptTr":"TAM Turkce karsilik"}`

  const response = await client().models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    config: {
      systemInstruction: PROMPT_SYSTEM,
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  })
  const raw = textOf(response)
  const json = extractJson(raw)
  if (fromTr) {
    const prompt = json?.prompt || raw
    if (!prompt) throw new Error('Ingilizce prompt yazilamadi')
    return { prompt, promptTr: src }
  }
  const promptTr = json?.promptTr || raw
  if (!promptTr) throw new Error('Turkce ceviri yazilamadi')
  return { prompt: json?.prompt || src, promptTr }
}

function dataUrlToImage(dataUrl) {
  const mime = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)?.[1] || 'image/jpeg'
  const data = String(dataUrl).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  return { imageBytes: data, mimeType: mime }
}

function rolePrompt(prompt, refs) {
  const text = String(prompt || '').trim()
  if (!refs.length) return text
  const map = refs.map((r, i) => `Image ${i + 1} = ${r.role || 'asset'}`).join('. ')
  return `${text}\n\nReference assets: ${map}. Keep the person, product and screen matching the photos.`
}

function pickPrimaryRef(refs) {
  return refs.find((r) => /klima|urun|product|unit|dis/i.test(r.role || '')) || refs[0]
}

export async function startVideoJob({ modelId, seconds, prompt, imageBase64, images }) {
  requireKey()
  const spec = findModel(modelId)
  if (!spec) throw new Error('Bilinmeyen model')
  const sec = Number(seconds)
  if (!spec.durations.includes(sec)) throw new Error('Bu model icin sure: ' + spec.durations.join(', ') + ' sn')

  const refs = (Array.isArray(images) ? images : [])
    .filter((r) => r?.image)
    .slice(0, 3)
  if (!refs.length && imageBase64) refs.push({ role: 'urun', image: imageBase64 })

  const text = rolePrompt(prompt, refs)
  if (!text) throw new Error('Prompt zorunlu')

  const baseConfig = {
    numberOfVideos: 1,
    durationSeconds: sec,
    aspectRatio: '9:16',
    resolution: spec.resolution || '720p',
    personGeneration: 'allow_adult',
  }

  const timed = (p, ms, msg) => Promise.race([
    p,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ])

  const run = async (mode) => {
    const params = { model: spec.model, prompt: text, config: { ...baseConfig } }
    if (mode === 'refs') {
      params.config.referenceImages = refs.map((r) => ({
        image: dataUrlToImage(r.image),
        referenceType: 'ASSET',
      }))
    } else if (refs.length) {
      params.image = dataUrlToImage(pickPrimaryRef(refs).image)
    }
    return timed(
      client().models.generateVideos(params),
      spec.id === 'omni' ? 25000 : 55000,
      spec.id === 'omni'
        ? 'Omni cevap vermedi (takildi). Veo 3.1 Lite secip tekrar dene.'
        : 'Video baslatma 55sn asti. Sayfayi yenile, Veo Lite ile tekrar dene.',
    )
  }

  let operation
  const wantRefs = refs.length >= 2
  try {
    operation = await run(wantRefs ? 'refs' : 'single')
  } catch (e) {
    if (!wantRefs) throw e
    if (/takildi|asti/i.test(e.message || '')) throw e
    operation = await run('single')
  }

  return {
    operationName: operation.name,
    operation,
    estimatedUsd: estimateUsd(modelId, sec),
    spec,
    usedRefs: refs.length,
  }
}

export async function pollVideoOperation(operationName) {
  requireKey()
  const ai = client()
  const operation = await ai.operations.getVideosOperation({ operation: { name: operationName } })
  if (!operation.done) return { done: false, operation }
  if (operation.error) {
    const msg = operation.error.message || JSON.stringify(operation.error)
    throw new Error(msg)
  }
  const clip = operation.response?.generatedVideos?.[0]
  const video = clip?.video
  if (!video) throw new Error('Video donmedi (RAI / bos cevap)')
  ensureDirs()
  const file = `aivid_${safeName(String(Date.now()))}.mp4`
  const dest = path.join(UPLOAD_DIR, file)
  await ai.files.download({ file: clip, downloadPath: dest })
  try {
    await fs.access(dest)
  } catch {
    if (video.videoBytes) await fs.writeFile(dest, Buffer.from(video.videoBytes, 'base64'))
    else throw new Error('Video dosyasi yazilamadi')
  }
  return { done: true, file, url: `/api/media?dir=uploads&file=${file}` }
}
