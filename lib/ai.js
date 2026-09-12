import { LlmChat, UserMessage, ImageContent, OpenAISpeechToText } from 'emergentintegrations'

const KEY = process.env.EMERGENT_LLM_KEY
const MODEL = process.env.AI_MODEL || 'gpt-4o'

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
export async function aiChatJson({ system, prompt, sessionId, temperature = 0.6 }) {
  if (!KEY) throw new Error('EMERGENT_LLM_KEY tanimli degil')
  const chat = new LlmChat(KEY, sessionId || 'cockpit-' + Date.now(), system)
    .withModel('openai', MODEL)
    .withParams({ temperature })
  const reply = await chat.sendMessage(new UserMessage({ text: prompt }))
  return { raw: reply, json: extractJson(reply) }
}

export async function aiVisionJson({ base64, prompt, system }) {
  if (!KEY) throw new Error('EMERGENT_LLM_KEY tanimli degil')
  const clean = String(base64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
  const chat = new LlmChat(
    KEY,
    'vision-' + Date.now(),
    system || 'Sen uzman bir Facebook sayfa denetcisi ve OCR gorsel analiz uzmanisin. Her zaman Turkce ve sadece gecerli JSON dondur.'
  )
    .withModel('openai', MODEL)
    .withParams({ temperature: 0.1 })
  const reply = await chat.sendMessage(new UserMessage({ text: prompt, file_contents: [new ImageContent(clean)] }))
  return { raw: reply, json: extractJson(reply) }
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
  if (!KEY) throw new Error('EMERGENT_LLM_KEY tanimli degil')
  const stt = new OpenAISpeechToText(KEY)
  const r = await stt.transcribe(filePath)
  if (typeof r === 'string') return r
  return r?.text || r?.transcript || (r ? JSON.stringify(r) : '')
}
