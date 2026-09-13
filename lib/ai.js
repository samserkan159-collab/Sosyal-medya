import { GoogleGenAI } from '@google/genai'
import fs from 'fs/promises'
import path from 'path'

const KEY = process.env.GEMINI_API_KEY
const MODEL = process.env.AI_MODEL || 'gemini-3.8-flash'
const STT_MODEL = process.env.AI_STT_MODEL || 'gemini-3.5-transcribe'

const DEFAULT_VISION_SYSTEM =
  'Sen uzman bir Facebook sayfa denetcisi ve OCR gorsel analiz uzmanisin. Her zaman Turkce ve sadece gecerli JSON dondur.'

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
  if (Array.isArray(parts)) {
    return parts.map((p) => p?.text || '').join('')
  }
  return ''
}

function imageMime(base64) {
  const match = String(base64 || '').match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  return match?.[1] || 'image/png'
}

function audioMime(filePath) {
  const ext = path.extname(filePath || '').toLowerCase()
  const map = {
    '.oga': 'audio/ogg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.mp3': 'audio/mp3',
    '.mpeg': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/m4a',
    '.aac': 'audio/aac',
    '.flac': 'audio/flac',
    '.webm': 'audio/webm',
  }
  return map[ext] || 'audio/ogg'
}

// ---- JSON extraction from LLM output ----
export function extractJson(text) {
  if (!text) return null
  let t = String(text).trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  const first = t.indexOf('{')
  const last = t.lastIndexOf('}')
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1)
  try {
    return JSON.parse(t)
  } catch (e) {
    return null
  }
}

export function aiConfigured() {
  return !!KEY
}

// ---- Generic text -> JSON ----
export async function aiChatJson({ system, prompt, sessionId: _sessionId, temperature = 0.6 }) {
  requireKey()
  const response = await client().models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: system,
      temperature,
      responseMimeType: 'application/json',
    },
  })
  const raw = textOf(response)
  return { raw, json: extractJson(raw) }
}

export async function aiVisionJson({ base64, prompt, system }) {
  requireKey()
  const clean = String(base64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: imageMime(base64), data: clean } },
        ],
      },
    ],
    config: {
      systemInstruction: system || DEFAULT_VISION_SYSTEM,
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  })
  const raw = textOf(response)
  return { raw, json: extractJson(raw) }
}

// ---- Multi-platform content factory ----
export async function generateMultiPlatform(inputText, page) {
  const brand = page?.pageName ? `Isletme adi: ${page.pageName}.` : ''
  const wa = page?.whatsappNumber ? `WhatsApp numarasi: ${page.whatsappNumber}.` : ''
  const system = `Sen usta bir sosyal medya metin yazari ve buyume pazarlama uzmanisin. Yerel isletmeler icin Turkce, guven veren, satis odakli metinler uretirsin. SADECE gecerli JSON dondur, aciklama ekleme.`
  const prompt = `${brand} ${wa}\nAsagidaki ham girdiden 4 platform icin optimize edilmis icerik uret.\n\nHAM GIRDI:\n"""${inputText}"""\n\nSu JSON semasinda dondur:\n{
  "fbCaption": "Facebook icin yerel guven odakli, WhatsApp linkine tesvik eden 3-5 cumlelik metin (emoji dengeli)",
  "igCaption": "Instagram Reels icin ilk 3 saniyelik guclu bir hook cumlesi + emojili govde",
  "ytTitle": "YouTube Shorts icin tiklama orani yuksek, 60 karakteri gecmeyen baslik",
  "ytDescription": "YouTube icin SEO uyumlu 2-3 paragraf aciklama",
  "tiktokCaption": "TikTok icin trend odaklu kisa dinamik metin",
  "hashtags": ["5 ile 8 arasi alakali hashtag, # isareti ile"]
}`
  const { json, raw } = await aiChatJson({ system, prompt, temperature: 0.75 })
  if (json) return json
  return {
    fbCaption: raw || inputText,
    igCaption: raw || inputText,
    ytTitle: (inputText || '').slice(0, 60),
    ytDescription: raw || inputText,
    tiktokCaption: raw || inputText,
    hashtags: [],
  }
}

// ---- Audit AI suggestions ----
export async function generateAuditSuggestions(pageData, missing) {
  const system = `Sen bir Meta/Facebook sayfa optimizasyon danismanisin. Yerel isletmeler icin profesyonel Turkce metinler yazarsin. SADECE gecerli JSON dondur.`
  const prompt = `Asagidaki Facebook sayfa verisine ve eksik alanlara gore oneriler uret.\n\nSAYFA VERISI:\n${JSON.stringify(pageData).slice(0, 2500)}\n\nEKSIK ALANLAR: ${JSON.stringify((missing || []).map((m) => m.key))}\n\nSu JSON semasinda dondur:\n{
  "bio": "Kisa, carpici bir sayfa biyografisi (max 140 karakter)",
  "aboutText": "Profesyonel, guven veren 2-3 cumlelik Hakkinda metni",
  "recommendedCta": "Onerilen cagri butonu (ornek: 'WhatsApp'tan Mesaj Gonder')"
}`
  const { json } = await aiChatJson({ system, prompt, temperature: 0.6 })
  return json || { bio: '', aboutText: '', recommendedCta: 'Mesaj Gonder' }
}

export async function analyzeAuditScreenshot(base64) {
  const prompt = `Bu bir Facebook sayfasinin mobil ekran goruntusudur. Detayli denetle ve SADECE su JSON semasinda dondur:\n{
  "pageNameVisible": true/false,
  "profilePhotoOk": true/false,
  "coverPhotoCropped": true/false,
  "ctaButtonPresent": true/false,
  "ocrText": "gorseldeki tum okunabilir metin",
  "issues": ["tespit edilen mobil gorunum sorunlari"],
  "recommendations": ["iyilestirme onerileri"],
  "score": 0-100 arasi mobil gorunum skoru
}`
  const { json, raw } = await aiVisionJson({ base64, prompt })
  return json || { ocrText: raw || '', issues: [], recommendations: [], score: 0 }
}

// ---- Afis icin AI metin onerisi (gorseli analiz eder) ----
export async function suggestPosterLabels(base64, context = '') {
  const ctx = context && context.trim() ? `\n\nKULLANICI ACIKLAMASI (cihazin ne ise yaradigi - bunu dikkate al): "${context.trim()}"` : ''
  const prompt = `Bu bir teknik cihaz/urun gorselidir.${ctx}\nBir sosyal medya satis afisi icin Turkce, kisa ve vurucu metin onerileri uret. SADECE su JSON semasinda dondur:\n{\n  "title": "1-3 kelimelik carpici ust baslik",\n  "badges": ["2-3 adet kisa rozet metni, ornek: DC INVERTER, 25 AMPER"],\n  "features": ["3 adet ikonlu teknik ozellik kutusu metni, ornek: Hassas Test"],\n  "arrows": ["gorselde ok ile isaret edilecek 1-2 parcanin kisa adi"],\n  "cta": "kisa cagri, ornek: WhatsApp'tan Yaz"\n}`
  const { json } = await aiVisionJson({ base64, prompt })
  return json || { title: '', badges: [], features: [], arrows: [], cta: '' }
}

// ---- Kullanici metinlerini gorsele uygun kutulara yerlestir (metni degistirmeden) ----
export async function customPosterBoxes(base64, texts, context = '') {
  const ctx = context && context.trim() ? `\nCihaz aciklamasi: "${context.trim()}"` : ''
  const list = (texts || []).map((t, i) => `${i + 1}. "${t}"`).join('\n')
  const prompt = `Bu bir urun/cihaz gorselidir.${ctx}\nKullanicinin verdigi ASAGIDAKI metinleri, bu gorsele uygun sekilde afis kutularina yerlestir. Metinleri KESINLIKLE DEGISTIRME, aynen kullan; sadece her metin icin en uygun kutu turunu ve goreli konumu (yuzde) belirle. Konumlar cihazin uzerini kapatmayacak sekilde kenarlarda olsun.\n\nMETINLER:\n${list}\n\nSADECE su JSON semasinda dondur:\n{\n  "boxes": [ { "text": "<verilen metin aynen>", "kind": "title|badge|feature|cta", "xPct": 0-100, "yPct": 0-100 } ]\n}`
  const { json } = await aiVisionJson({ base64, prompt })
  return json && Array.isArray(json.boxes) ? json : { boxes: [] }
}

export async function transcribeAudio(filePath) {
  requireKey()
  const buf = await fs.readFile(filePath)
  const response = await client().models.generateContent({
    model: STT_MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: audioMime(filePath), data: buf.toString('base64') } },
        ],
      },
    ],
  })
  const raw = textOf(response)
  return raw || ''
}
