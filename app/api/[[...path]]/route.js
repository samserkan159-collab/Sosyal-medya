import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import {
  aiConfigured,
  generateMultiPlatform,
  generateAuditSuggestions,
  analyzeAuditScreenshot,
} from '@/lib/ai'
import {
  crawlPage,
  computeHealth,
  replyToComment,
  sendPrivateReply,
  updatePageField,
} from '@/lib/meta'
import {
  tgSendMessage,
  tgAnswerCallback,
  tgDownloadBase64,
  telegramConfigured,
  defaultChat,
} from '@/lib/telegram'
import {
  youtubeConfigured,
  youtubeChannelId,
  youtubeOAuthToken,
  listChannelCommentThreads,
  listVideoCommentThreads,
  replyToYoutubeComment,
} from '@/lib/youtube'
import { listPageComments } from '@/lib/meta'
import { bgConfigured, bgProvider, removeBackground } from '@/lib/bgremoval'
import {
  googleConfigured, authorizeUrl, exchangeCode, getValidAccessToken,
  uploadShort, replyComment, redirectUri,
} from '@/lib/googleoauth'
import { publishFacebookReel } from '@/lib/fbreels'
import { igConfigured, publishInstagramReel } from '@/lib/instagram'
import { renderReels, renderMultiScene, PRESETS, presetPath } from '@/lib/reels'
import { probeDuration, trimVideo, extractThumbnail, toVertical, stripAudio, replaceAudio, probeVideoInfo, prependPoster, exciseRanges } from '@/lib/video'
import { transcribeAudio, suggestPosterLabels, customPosterBoxes } from '@/lib/ai'
import { videoAiConfigured, modelCatalog, estimateUsd, buildScenePrompt, syncScenePrompt, startVideoJob, pollVideoOperation } from '@/lib/videoai'
import { verifyMetaSignature } from '@/lib/auth'
import { getSchedulerState, startScheduler, stopScheduler, setLast, startScheduleWorker } from '@/lib/scheduler'
import { UPLOAD_DIR, MUSIC_DIR, ensureDirs, safeName } from '@/lib/paths'
import { pruneOldVideos } from '@/lib/video-gc'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import os from 'os'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ---------- MongoDB ----------
let client
let db
let connectPromise
let lastVideoPrune = 0
async function connectToMongo() {
  if (!db) {
    if (!connectPromise) {
      client = new MongoClient(process.env.MONGO_URL)
      connectPromise = client.connect().then(() => {
        db = client.db(process.env.DB_NAME)
        return db
      })
    }
    await connectPromise
  }
  const now = Date.now()
  if (now - lastVideoPrune > 20_000) {
    lastVideoPrune = now
    pruneOldVideos(db).catch(() => {})
  }
  return db
}

const strip = (doc) => {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}

const DEFAULT_COMMENT_TEMPLATE =
  'Merhabalar, fiyat ve detayli katalog bilgisi ozel mesaj (Messenger) kutunuza iletildi. Hizli iletisim icin WhatsApp hattimizdan yazabilirsiniz.'
const DEFAULT_DM_TEMPLATE =
  'Merhaba! Paylastigimiz video ile ilgili fiyat bilgisi talep etmistiniz. Detayli bilgi ve randevu icin dogrudan ustamizla gorusebilirsiniz:'

const PRICE_KEYWORDS = [
  'fiyat', 'ucret', 'ücret', 'ne kadar', 'kaç tl', 'kac tl', 'kaç para', 'kac para',
  'dm', 'katalog', 'bilgi', 'maliyet', 'price', 'fiyatı', 'fiyati',
]

// YouTube icin genisletilmis anahtar kelimeler
const YT_KEYWORDS = [
  ...PRICE_KEYWORDS,
  'iletisim', 'iletişim', 'nerede', 'adres', 'konum', 'contact', 'nereden', 'subeniz', 'şubeniz',
]

const DEFAULT_YT_REPLY =
  'Ilginiz icin tesekkurler! Fiyat, iletisim ve adres bilgileri icin kanal aciklamamizdaki baglantidan bize ulasabilirsiniz. 📩'

async function log(service, level, message, details) {
  try {
    const database = await connectToMongo()
    await database.collection('system_logs').insertOne({
      id: uuidv4(),
      service,
      level,
      message,
      details: details || null,
      createdAt: new Date(),
    })
  } catch (e) {
    console.error('log error', e)
  }
}

function cors(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

function json(data, status = 200) {
  return cors(NextResponse.json(data, { status }))
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 200 }))
}

// ---------- helpers ----------
function integrationsStatus() {
  return {
    ai: aiConfigured(),
    meta: !!process.env.PAGE_ACCESS_TOKEN && !!process.env.PAGE_ID,
    telegram: telegramConfigured(),
    youtube: youtubeConfigured(),
    youtubeReply: !!youtubeOAuthToken(),
    youtubeChannelId: youtubeChannelId(),
    google: googleConfigured(),
    bgRemoval: bgConfigured(),
    bgProvider: bgProvider(),
    instagram: igConfigured(),
    verifyToken: process.env.META_VERIFY_TOKEN || '',
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
  }
}

const REQUIRED_PERMISSIONS = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_basic',
  'instagram_manage_comments',
  'instagram_manage_messages',
]

// ================= COMMENT-TO-DM ENGINE (core, reusable) =================
async function processFacebookCommentCore(database, page, c, opts = {}) {
  // c: { commentId, fromId, fromName, message, postId }
  const skipIfExists = opts.skipIfExists !== false
  if (skipIfExists && c.commentId) {
    const existing = await database.collection('leads').findOne({ commentId: c.commentId })
    if (existing) return null
  }
  const pageId = page?.pageId
  const token = page?.accessToken || process.env.PAGE_ACCESS_TOKEN
  const commentTemplate = page?.commentTemplate || DEFAULT_COMMENT_TEMPLATE
  const dmTemplate = page?.dmTemplate || DEFAULT_DM_TEMPLATE
  const whatsapp = (page?.whatsappNumber || '').replace(/[^0-9]/g, '')
  const autoReply = page ? page.autoReplyActive !== false : true

  const lower = (c.message || '').toLowerCase()
  const isPrice = PRICE_KEYWORDS.some((k) => lower.includes(k))
  const sentiment = isPrice ? 'PRICE_INQUIRY' : 'GENERAL'

  const lead = {
    id: uuidv4(),
    pageId: page?.id || null,
    fbPageId: pageId,
    platform: 'FACEBOOK_COMMENT',
    externalUserId: c.fromId || 'unknown',
    userName: c.fromName || 'Bilinmeyen Kullanici',
    commentId: c.commentId || null,
    postId: c.postId || null,
    userMessage: c.message || '',
    replySent: false,
    dmSent: false,
    status: 'NEW',
    sentiment,
    whatsappNumber: page?.whatsappNumber || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  if (isPrice && autoReply && token && c.commentId) {
    try { await replyToComment(c.commentId, commentTemplate, token); lead.replySent = true }
    catch (e) { await log('COMMENT_TO_DM', 'ERROR', 'Public yanit basarisiz', { error: e.message, comment: c.commentId }) }
    try {
      const dmText = whatsapp ? `${dmTemplate}\nhttps://wa.me/${whatsapp}` : dmTemplate
      await sendPrivateReply(pageId, c.commentId, dmText, token); lead.dmSent = true
    } catch (e) { await log('COMMENT_TO_DM', 'ERROR', 'Private DM basarisiz', { error: e.message, comment: c.commentId }) }
  }

  try {
    if (c.commentId) await database.collection('leads').updateOne({ commentId: c.commentId }, { $setOnInsert: lead }, { upsert: true })
    else await database.collection('leads').insertOne(lead)
  } catch (e) { await log('COMMENT_TO_DM', 'WARN', 'Lead kaydedilemedi', { error: e.message }) }

  if (isPrice) {
    try {
      const text =
        `🚨 <b>YENI MUSTERI YAKALANDI!</b>\n\n` +
        `👤 Kullanici: <b>${lead.userName}</b>\n` +
        `💬 Yorum: <i>${c.message}</i>\n` +
        `🎯 Islem: ${lead.replySent ? 'Yoruma yanit ✅' : 'Yanit ✖️'} | ${lead.dmSent ? 'Messenger DM ✅' : 'DM ✖️'}\n` +
        `📊 Etiket: PRICE_INQUIRY`
      await tgSendMessage(text, {
        reply_markup: whatsapp ? { inline_keyboard: [[{ text: '💚 WhatsApp ile Yaz', url: `https://wa.me/${whatsapp}` }]] } : undefined,
      })
    } catch (e) { await log('TELEGRAM_BOT', 'WARN', 'Telegram alarmi gonderilemedi', { error: e.message }) }
  }

  await log('COMMENT_TO_DM', 'INFO', `Yorum islendi (${sentiment})`, { user: lead.userName, price: isPrice })
  return { user: lead.userName, sentiment, replySent: lead.replySent, dmSent: lead.dmSent }
}

async function processMetaWebhook(database, body) {
  const results = []
  const entries = body.entry || []
  for (const entry of entries) {
    const pageId = entry.id
    const page = await database.collection('facebook_pages').findOne({ pageId })
    const changes = entry.changes || []
    for (const change of changes) {
      if (change.field !== 'feed') continue
      const v = change.value || {}
      if (v.item !== 'comment' || v.verb !== 'add') continue
      if (v.from && String(v.from.id) === String(pageId)) continue
      const r = await processFacebookCommentCore(
        database,
        page || { pageId },
        { commentId: v.comment_id, fromId: v.from?.id, fromName: v.from?.name, message: v.message || '', postId: v.post_id },
        { skipIfExists: true }
      )
      if (r) results.push(r)
    }
  }
  return results
}

// ================= AUTO SCAN (cron) =================
async function scanAll(database) {
  const summary = { facebook: 0, youtube: 0, at: new Date().toISOString() }
  const pages = await database.collection('facebook_pages').find({}).toArray()
  for (const page of pages) {
    const token = page.accessToken || process.env.PAGE_ACCESS_TOKEN
    if (!token) continue
    try {
      const comments = await listPageComments(page.pageId, token)
      for (const c of comments) {
        const r = await processFacebookCommentCore(database, page, { commentId: c.id, fromId: c.from?.id, fromName: c.from?.name, message: c.message, postId: c.postId }, { skipIfExists: true })
        if (r) summary.facebook++
      }
    } catch (e) { await log('META_WEBHOOK', 'WARN', 'Cron FB tarama hatasi', { error: e.message }) }
  }
  if (youtubeConfigured() && youtubeChannelId()) {
    try {
      const data = await listChannelCommentThreads(youtubeChannelId())
      for (const item of data.items || []) {
        const top = item.snippet?.topLevelComment
        if (!top) continue
        const exists = await database.collection('leads').findOne({ commentId: top.id })
        if (exists) continue
        await processYoutubeComment(database, {
          commentId: top.id,
          text: top.snippet?.textOriginal || top.snippet?.textDisplay || '',
          author: top.snippet?.authorDisplayName,
          authorChannelId: top.snippet?.authorChannelId?.value,
          videoId: item.snippet?.videoId,
        })
        summary.youtube++
      }
    } catch (e) { await log('YOUTUBE', 'WARN', 'Cron YT tarama hatasi', { error: e.message }) }
  }
  await log('META_WEBHOOK', 'INFO', 'Otomatik tarama tamamlandi', summary)
  return summary
}

// Zamanlanmis paylasim worker'i (her dakika) - schedulerInit ile bir kez
let schedulerInit = false
async function ensureScheduler(database) {
  if (schedulerInit) return
  schedulerInit = true
  try {
    const s = await database.collection('settings').findOne({ id: 'cron' })
    if (s?.enabled) {
      startScheduler(process.env.CRON_SCAN_SCHEDULE || '*/15 * * * *', () => scanAll(database))
    }
  } catch (e) {}
  // Zamanli paylasim her zaman aktif
  startScheduleWorker(() => processDueSchedules(database))
}

// ================= PUBLISH (birlesik) =================
async function publishRenderTo(database, render, platform, caption) {
  const abs = path.join(UPLOAD_DIR, render.outFile)
  if (!fs.existsSync(abs)) throw new Error('Video dosyasi bulunamadi')
  if (platform === 'youtube') {
    let token = youtubeOAuthToken()
    if (!token) { try { token = await getValidAccessToken(database) } catch (e) {} }
    if (!token) throw new Error('OAUTH_REQUIRED: YouTube kanali baglanmamis')
    const r = await uploadShort(token, abs, caption || render.title || 'Reels', caption || render.description || '')
    return { youtube: r.id }
  }
  if (platform === 'facebook') {
    const page = await database.collection('facebook_pages').findOne({})
    const pid = page?.pageId || process.env.PAGE_ID
    const tok = page?.accessToken || process.env.PAGE_ACCESS_TOKEN
    if (!pid || !tok) throw new Error('PAGE_ID / PAGE_ACCESS_TOKEN tanimli degil')
    const r = await publishFacebookReel(abs, caption || render.description || '', pid, tok)
    return { facebook: r.video_id }
  }
  if (platform === 'instagram') {
    if (!igConfigured()) throw new Error('IG_USER_ID / PAGE_ACCESS_TOKEN tanimli degil')
    const videoUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/media?dir=uploads&file=${render.outFile}`
    const r = await publishInstagramReel({ videoUrl, caption: caption || render.description || '' })
    return { instagram: r.id }
  }
  throw new Error('bilinmeyen platform: ' + platform)
}

async function processDueSchedules(database) {
  const now = new Date()
  const due = await database.collection('schedules').find({ status: 'PENDING', scheduledAt: { $lte: now } }).limit(5).toArray()
  for (const s of due) {
    await database.collection('schedules').updateOne({ id: s.id }, { $set: { status: 'PUBLISHING', updatedAt: new Date() } })
    const render = await database.collection('renders').findOne({ id: s.jobId })
    const results = {}
    let ok = true
    if (!render) { ok = false; results.error = 'render bulunamadi' }
    else {
      for (const pf of s.platforms || []) {
        try { Object.assign(results, await publishRenderTo(database, render, pf, s.caption)) }
        catch (e) { ok = false; results[pf] = 'HATA: ' + e.message }
      }
    }
    await database.collection('schedules').updateOne({ id: s.id }, { $set: { status: ok ? 'PUBLISHED' : 'FAILED', results, publishedAt: new Date(), updatedAt: new Date() } })
    await log('SCHEDULER', ok ? 'INFO' : 'ERROR', `Zamanli paylasim islendi (${ok ? 'ok' : 'hata'})`, { id: s.id, results })
  }
  return due.length
}

// ================= TELEGRAM WEBHOOK =================
async function processTelegramWebhook(database, body) {
  // Inline buton tiklamalari
  if (body.callback_query) {
    const cq = body.callback_query
    const data = cq.data || ''
    if (data.startsWith('approve_post_')) {
      const id = data.replace('approve_post_', '')
      await database.collection('content_posts').updateOne(
        { id },
        { $set: { status: 'PUBLISHED', approvedAt: new Date(), publishedAt: new Date(), updatedAt: new Date() } }
      )
      await tgAnswerCallback(cq.id, 'Icerik onaylandi ve yayina alindi ✅')
      await tgSendMessage(`✅ <b>Icerik onaylandi ve yayina alindi.</b>\nID: <code>${id}</code>`)
      await log('TELEGRAM_BOT', 'INFO', 'Icerik onaylandi', { id })
      return { action: 'approved', id }
    }
    if (data.startsWith('reject_post_')) {
      const id = data.replace('reject_post_', '')
      await database.collection('content_posts').updateOne(
        { id },
        { $set: { status: 'DRAFT', updatedAt: new Date() } }
      )
      await tgAnswerCallback(cq.id, 'Icerik reddedildi')
      await log('TELEGRAM_BOT', 'INFO', 'Icerik reddedildi', { id })
      return { action: 'rejected', id }
    }
    await tgAnswerCallback(cq.id, 'Bilinmeyen komut')
    return { action: 'unknown_callback' }
  }

  const msg = body.message
  if (!msg) return { action: 'ignored' }

  // Gelen fotograf -> Vision analizi
  if (msg.photo && msg.photo.length) {
    try {
      const largest = msg.photo[msg.photo.length - 1]
      const base64 = await tgDownloadBase64(largest.file_id)
      const analysis = await analyzeAuditScreenshot(base64)
      const text =
        `🔍 <b>Ekran Goruntusu Analizi</b>\n\n` +
        `📊 Skor: <b>${analysis.score || 0}/100</b>\n` +
        (analysis.issues?.length ? `\n<b>Sorunlar:</b>\n• ${analysis.issues.join('\n• ')}` : '') +
        (analysis.recommendations?.length ? `\n\n<b>Oneriler:</b>\n• ${analysis.recommendations.join('\n• ')}` : '')
      await tgSendMessage(text, { chatId: msg.chat.id })
      await log('AI_VISION', 'INFO', 'Telegram foto analizi yapildi')
      return { action: 'photo_analyzed', score: analysis.score }
    } catch (e) {
      await tgSendMessage('Foto analizi basarisiz: ' + e.message, { chatId: msg.chat.id })
      await log('AI_VISION', 'ERROR', 'Telegram foto analizi hatasi', { error: e.message })
      return { action: 'photo_error' }
    }
  }

  // Gelen sesli mesaj -> Gemini Transcribe ile metne cevir -> icerik fabrikasi
  if (msg.voice || msg.audio) {
    try {
      const fileId = (msg.voice || msg.audio).file_id
      ensureDirs()
      const tmp = path.join(os.tmpdir(), `tg_voice_${Date.now()}.oga`)
      await tgDownloadToFile(fileId, tmp)
      const transcript = await transcribeAudio(tmp)
      try { await fsp.unlink(tmp) } catch (e) {}
      if (!transcript || !transcript.trim()) {
        await tgSendMessage('Ses metne cevrilemedi.', { chatId: msg.chat.id })
        return { action: 'voice_empty' }
      }
      const page = await database.collection('facebook_pages').findOne({})
      const content = await generateMultiPlatform(transcript, page)
      const post = {
        id: uuidv4(), pageId: page?.id || null, rawInputText: transcript, status: 'DRAFT',
        ...content, createdAt: new Date(), updatedAt: new Date(),
      }
      await database.collection('content_posts').insertOne(post)
      await tgSendMessage(
        `🎙️ <b>Sesli mesaj metne cevrildi:</b>\n<i>${transcript.slice(0, 300)}</i>\n\n<b>Facebook:</b>\n${content.fbCaption}`,
        { chatId: msg.chat.id, reply_markup: { inline_keyboard: [[{ text: '✅ Onayla & Yayinla', callback_data: `approve_post_${post.id}` }]] } }
      )
      await log('AI_VISION', 'INFO', 'Sesli mesaj icerige donusturuldu')
      return { action: 'voice_generated', id: post.id }
    } catch (e) {
      await tgSendMessage('Sesli mesaj islenemedi: ' + e.message, { chatId: msg.chat.id })
      await log('TELEGRAM_BOT', 'ERROR', 'Voice islemi hatasi', { error: e.message })
      return { action: 'voice_error' }
    }
  }

  // Metin -> icerik fabrikasina girdi
  if (msg.text && !msg.text.startsWith('/')) {
    try {
      const page = await database.collection('facebook_pages').findOne({})
      const content = await generateMultiPlatform(msg.text, page)
      const post = {
        id: uuidv4(),
        pageId: page?.id || null,
        rawInputText: msg.text,
        status: 'DRAFT',
        ...content,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('content_posts').insertOne(post)
      await tgSendMessage(
        `✍️ <b>Icerik uretildi!</b>\n\n<b>Facebook:</b>\n${content.fbCaption}\n\nOnaylamak icin panele gelin veya butona basin.`,
        {
          chatId: msg.chat.id,
          reply_markup: { inline_keyboard: [[{ text: '✅ Onayla & Yayinla', callback_data: `approve_post_${post.id}` }]] },
        }
      )
      return { action: 'text_generated', id: post.id }
    } catch (e) {
      await tgSendMessage('Icerik uretilemedi: ' + e.message, { chatId: msg.chat.id })
      return { action: 'text_error' }
    }
  }

  if (msg.text === '/start') {
    try {
      await tgSendMessage('👋 Command Cockpit botuna hos geldiniz! Ekran goruntusu gonderin (denetim) veya metin gonderin (icerik uretimi).', { chatId: msg.chat.id })
      return { action: 'start' }
    } catch (e) {
      return { action: 'start_error', error: e.message }
    }
  }

  return { action: 'ignored' }
}

// ================= YOUTUBE COMMENT ENGINE =================
async function processYoutubeComment(database, c) {
  // c: { commentId, text, author, authorChannelId, videoId }
  const lower = (c.text || '').toLowerCase()
  const isMatch = YT_KEYWORDS.some((k) => lower.includes(k))
  const sentiment = isMatch ? 'PRICE_INQUIRY' : 'GENERAL'

  const lead = {
    id: uuidv4(),
    pageId: null,
    platform: 'YOUTUBE_COMMENT',
    externalUserId: c.authorChannelId || 'yt_unknown',
    userName: c.author || 'YouTube Kullanicisi',
    commentId: c.commentId || null,
    postId: c.videoId || null,
    userMessage: c.text || '',
    replySent: false,
    dmSent: false,
    status: 'NEW',
    sentiment,
    whatsappNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  if (isMatch) {
    const page = await database.collection('facebook_pages').findOne({})
    const autoReply = page ? page.autoReplyActive !== false : true
    const replyText = (page?.ytReplyTemplate || '').trim() || DEFAULT_YT_REPLY
    const token = youtubeOAuthToken()
    if (autoReply && token && c.commentId) {
      try {
        await replyToYoutubeComment(c.commentId, replyText, token)
        lead.replySent = true
      } catch (e) {
        await log('YOUTUBE', 'ERROR', 'YouTube yorum yaniti basarisiz', { error: e.message, comment: c.commentId })
      }
    } else if (!token) {
      await log('YOUTUBE', 'WARN', 'YouTube yaniti atlandi (OAuth token yok)', { comment: c.commentId })
    }
    // Telegram alarmi
    try {
      const text =
        `🎬 <b>YOUTUBE MUSTERI YAKALANDI!</b>\n\n` +
        `👤 Kullanici: <b>${lead.userName}</b>\n` +
        `💬 Yorum: <i>${c.text}</i>\n` +
        `🎯 Islem: ${lead.replySent ? 'Otomatik yanit gonderildi ✅' : 'Yanit icin OAuth gerekli ⚠️'}\n` +
        `📊 Etiket: PRICE_INQUIRY`
      await tgSendMessage(text)
    } catch (e) {
      await log('TELEGRAM_BOT', 'WARN', 'YouTube Telegram alarmi gonderilemedi', { error: e.message })
    }
  }

  try {
    if (c.commentId) {
      await database.collection('leads').updateOne(
        { commentId: c.commentId },
        { $setOnInsert: lead },
        { upsert: true }
      )
    } else {
      await database.collection('leads').insertOne(lead)
    }
  } catch (e) {
    await log('YOUTUBE', 'WARN', 'YouTube lead kaydedilemedi', { error: e.message })
  }

  await log('YOUTUBE', 'INFO', `YouTube yorumu islendi (${sentiment})`, { user: lead.userName, match: isMatch })
  return { user: lead.userName, sentiment, replySent: lead.replySent, matched: isMatch }
}

// ================= ROUTER =================
async function handleRoute(request, { params }) {
  const { path: pathSegments = [] } = await params
  const route = `/${pathSegments.join('/')}`
  const method = request.method
  const url = new URL(request.url)

  try {
    const database = await connectToMongo()
    ensureScheduler(database)

    // ---- health / info ----
    if ((route === '/' || route === '/health') && method === 'GET') {
      return json({ status: 'ok', app: 'Command Cockpit', integrations: integrationsStatus() })
    }

    // ---- config (for UI) ----
    if (route === '/config' && method === 'GET') {
      return json({ integrations: integrationsStatus(), permissions: REQUIRED_PERMISSIONS })
    }

    // ---- STATS ----
    if (route === '/stats' && method === 'GET') {
      const [pages, leads, priceLeads, published, pending, reports] = await Promise.all([
        database.collection('facebook_pages').countDocuments(),
        database.collection('leads').countDocuments(),
        database.collection('leads').countDocuments({ sentiment: 'PRICE_INQUIRY' }),
        database.collection('content_posts').countDocuments({ status: 'PUBLISHED' }),
        database.collection('content_posts').countDocuments({ status: 'AWAITING_APPROVAL' }),
        database.collection('audit_reports').find({}).sort({ createdAt: -1 }).limit(1).toArray(),
      ])
      const recentLeads = await database.collection('leads').find({}).sort({ createdAt: -1 }).limit(6).toArray()
      const youtubeLeads = await database.collection('leads').countDocuments({ platform: 'YOUTUBE_COMMENT' })
      const allPages = await database.collection('facebook_pages').find({}).toArray()
      const avgHealth = allPages.length
        ? Math.round(allPages.reduce((a, p) => a + (p.healthScore || 0), 0) / allPages.length)
        : 0
      return json({
        totalPages: pages,
        totalLeads: leads,
        priceInquiries: priceLeads,
        publishedPosts: published,
        pendingApproval: pending,
        youtubeLeads,
        avgHealth,
        lastReport: reports[0] ? strip(reports[0]) : null,
        recentLeads: recentLeads.map(strip),
        integrations: integrationsStatus(),
      })
    }

    // ---- LOGS ----
    if (route === '/logs' && method === 'GET') {
      const logs = await database.collection('system_logs').find({}).sort({ createdAt: -1 }).limit(50).toArray()
      return json(logs.map(strip))
    }

    // ---- PAGES ----
    if (route === '/pages' && method === 'GET') {
      const pages = await database.collection('facebook_pages').find({}).sort({ createdAt: -1 }).toArray()
      return json(pages.map(strip))
    }
    if (route === '/pages' && method === 'POST') {
      const b = await request.json()
      if (!b.pageId || !b.pageName) return json({ error: 'pageId ve pageName zorunlu' }, 400)
      const doc = {
        id: uuidv4(),
        pageId: b.pageId,
        pageName: b.pageName,
        accessToken: b.accessToken || process.env.PAGE_ACCESS_TOKEN || '',
        category: b.category || null,
        whatsappNumber: b.whatsappNumber || null,
        phone: b.phone || null,
        website: b.website || null,
        about: b.about || null,
        coverPhotoUrl: null,
        profilePhotoUrl: null,
        healthScore: 0,
        autoReplyActive: true,
        commentTemplate: DEFAULT_COMMENT_TEMPLATE,
        dmTemplate: DEFAULT_DM_TEMPLATE,
        ytReplyTemplate: DEFAULT_YT_REPLY,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      const { id, createdAt, ...updateFields } = doc
      await database.collection('facebook_pages').updateOne(
        { pageId: b.pageId },
        { $set: updateFields, $setOnInsert: { id, createdAt } },
        { upsert: true }
      )
      const saved = await database.collection('facebook_pages').findOne({ pageId: b.pageId })
      return json(strip(saved))
    }
    if (route.startsWith('/pages/') && method === 'GET') {
      const id = pathSegments[1]
      const p = await database.collection('facebook_pages').findOne({ id })
      if (!p) return json({ error: 'Sayfa bulunamadi' }, 404)
      return json(strip(p))
    }
    if (route.startsWith('/pages/') && method === 'PUT') {
      const id = pathSegments[1]
      const b = await request.json()
      const allowed = ['pageName', 'accessToken', 'whatsappNumber', 'phone', 'website', 'about', 'commentTemplate', 'dmTemplate', 'ytReplyTemplate', 'autoReplyActive', 'category']
      const set = { updatedAt: new Date() }
      allowed.forEach((k) => { if (b[k] !== undefined) set[k] = b[k] })
      await database.collection('facebook_pages').updateOne({ id }, { $set: set })
      const p = await database.collection('facebook_pages').findOne({ id })
      return json(strip(p))
    }
    if (route.startsWith('/pages/') && method === 'DELETE') {
      const id = pathSegments[1]
      await database.collection('facebook_pages').deleteOne({ id })
      return json({ ok: true })
    }

    // ---- AUDIT ----
    if (route === '/audit/crawl' && method === 'POST') {
      const b = await request.json()
      const page = await database.collection('facebook_pages').findOne({ id: b.pageId })
      if (!page) return json({ error: 'Once bir Facebook sayfasi ekleyin' }, 400)
      const token = page.accessToken || process.env.PAGE_ACCESS_TOKEN
      if (!token) return json({ error: 'Bu sayfa icin PAGE_ACCESS_TOKEN tanimli degil' }, 400)

      let data
      try {
        data = await crawlPage(page.pageId, token)
      } catch (e) {
        await log('META_WEBHOOK', 'ERROR', 'Graph API crawl hatasi', { error: e.message })
        return json({ error: 'Graph API hatasi: ' + e.message }, 502)
      }
      const { score, missing } = computeHealth({ ...data, id: page.pageId })
      let suggestions = { bio: '', aboutText: '', recommendedCta: 'Mesaj Gonder' }
      try {
        suggestions = await generateAuditSuggestions(data, missing)
      } catch (e) {
        await log('AI_VISION', 'WARN', 'AI oneri uretilemedi', { error: e.message })
      }
      const report = {
        id: uuidv4(),
        pageId: page.id,
        status: 'COMPLETED',
        score,
        screenshotUrl: null,
        missingFields: missing,
        aiSuggestions: suggestions,
        executedActions: [],
        rawData: {
          about: data.about || null,
          phone: data.phone || null,
          website: data.website || null,
          category: data.category || null,
          fan_count: data.fan_count || 0,
        },
        createdAt: new Date(),
      }
      await database.collection('audit_reports').insertOne(report)
      await database.collection('facebook_pages').updateOne(
        { id: page.id },
        {
          $set: {
            healthScore: score,
            about: data.about || page.about,
            category: data.category || page.category,
            website: data.website || page.website,
            phone: data.phone || page.phone,
            coverPhotoUrl: data.cover?.source || null,
            profilePhotoUrl: data.picture?.data?.url || null,
            updatedAt: new Date(),
          },
        }
      )
      await log('META_WEBHOOK', 'INFO', `Sayfa denetlendi: skor ${score}`, { page: page.pageName })
      return json(strip(report))
    }

    if (route === '/audit/reports' && method === 'GET') {
      const reports = await database.collection('audit_reports').find({}).sort({ createdAt: -1 }).limit(20).toArray()
      return json(reports.map(strip))
    }

    if (route === '/audit/vision' && method === 'POST') {
      const b = await request.json()
      if (!b.image) return json({ error: 'image (base64/dataUrl) zorunlu' }, 400)
      let analysis
      try {
        analysis = await analyzeAuditScreenshot(b.image)
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Vision analizi hatasi', { error: e.message })
        return json({ error: 'Vision analizi hatasi: ' + e.message }, 502)
      }
      await log('AI_VISION', 'INFO', 'Ekran goruntusu analiz edildi', { score: analysis.score })
      return json(analysis)
    }

    // Eksik alanlari Facebook'a bas
    if (route === '/audit/fix' && method === 'POST') {
      const b = await request.json()
      const page = await database.collection('facebook_pages').findOne({ id: b.pageId })
      if (!page) return json({ error: 'Sayfa bulunamadi' }, 400)
      const token = page.accessToken || process.env.PAGE_ACCESS_TOKEN
      if (!token) return json({ error: 'PAGE_ACCESS_TOKEN tanimli degil' }, 400)
      if (!b.field || b.value === undefined) return json({ error: 'field ve value zorunlu' }, 400)
      try {
        const result = await updatePageField(page.pageId, { [b.field]: b.value }, token)
        await database.collection('facebook_pages').updateOne(
          { id: page.id },
          { $set: { [b.field]: b.value, updatedAt: new Date() } }
        )
        await log('META_WEBHOOK', 'INFO', `Alan Facebook'a gonderildi: ${b.field}`, { page: page.pageName })
        return json({ ok: true, result })
      } catch (e) {
        await log('META_WEBHOOK', 'ERROR', 'Alan gonderilemedi', { error: e.message, field: b.field })
        return json({ error: 'Facebook guncelleme hatasi: ' + e.message }, 502)
      }
    }

    // ---- CONTENT ----
    if (route === '/content/generate' && method === 'POST') {
      const b = await request.json()
      if (!b.inputText || !b.inputText.trim()) return json({ error: 'inputText zorunlu' }, 400)
      const page = b.pageId ? await database.collection('facebook_pages').findOne({ id: b.pageId }) : await database.collection('facebook_pages').findOne({})
      let content
      try {
        content = await generateMultiPlatform(b.inputText, page)
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Icerik uretimi hatasi', { error: e.message })
        return json({ error: 'AI icerik uretimi hatasi: ' + e.message }, 502)
      }
      const post = {
        id: uuidv4(),
        pageId: page?.id || null,
        rawInputText: b.inputText,
        rawMediaUrl: b.rawMediaUrl || null,
        status: 'DRAFT',
        fbCaption: content.fbCaption || '',
        igCaption: content.igCaption || '',
        ytTitle: content.ytTitle || '',
        ytDescription: content.ytDescription || '',
        tiktokCaption: content.tiktokCaption || '',
        hashtags: Array.isArray(content.hashtags) ? content.hashtags : [],
        telegramMessageId: null,
        approvedAt: null,
        publishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('content_posts').insertOne(post)
      return json(strip(post))
    }

    if (route === '/content' && method === 'GET') {
      const posts = await database.collection('content_posts').find({}).sort({ createdAt: -1 }).limit(50).toArray()
      return json(posts.map(strip))
    }

    if (route === '/content/telegram-approval' && method === 'POST') {
      const b = await request.json()
      const post = await database.collection('content_posts').findOne({ id: b.id })
      if (!post) return json({ error: 'Icerik bulunamadi' }, 400)
      try {
        const text =
          `📢 <b>YENI ICERIK ONAYI BEKLIYOR</b>\n\n` +
          `<b>Facebook:</b>\n${post.fbCaption}\n\n` +
          `<b>Instagram:</b>\n${post.igCaption}\n\n` +
          `<b>YouTube:</b> ${post.ytTitle}\n` +
          (post.hashtags?.length ? `\n${post.hashtags.join(' ')}` : '')
        const sent = await tgSendMessage(text, {
          reply_markup: {
            inline_keyboard: [[
              { text: '✅ Onayla & Yayinla', callback_data: `approve_post_${post.id}` },
              { text: '❌ Reddet', callback_data: `reject_post_${post.id}` },
            ]],
          },
        })
        await database.collection('content_posts').updateOne(
          { id: b.id },
          { $set: { status: 'AWAITING_APPROVAL', telegramMessageId: String(sent.message_id), updatedAt: new Date() } }
        )
        await log('TELEGRAM_BOT', 'INFO', 'Icerik onaya gonderildi', { id: b.id })
        return json({ ok: true, messageId: sent.message_id })
      } catch (e) {
        await log('TELEGRAM_BOT', 'ERROR', 'Telegram onay gonderilemedi', { error: e.message })
        return json({ error: 'Telegram gonderim hatasi: ' + e.message }, 502)
      }
    }

    if (route === '/content/publish' && method === 'POST') {
      const b = await request.json()
      const post = await database.collection('content_posts').findOne({ id: b.id })
      if (!post) return json({ error: 'Icerik bulunamadi' }, 400)
      await database.collection('content_posts').updateOne(
        { id: b.id },
        { $set: { status: 'PUBLISHED', approvedAt: new Date(), publishedAt: new Date(), updatedAt: new Date() } }
      )
      await log('META_WEBHOOK', 'INFO', 'Icerik yayina alindi', { id: b.id })
      const updated = await database.collection('content_posts').findOne({ id: b.id })
      return json(strip(updated))
    }

    // ---- LEADS ----
    if (route === '/leads' && method === 'GET') {
      const leads = await database.collection('leads').find({}).sort({ createdAt: -1 }).limit(200).toArray()
      return json(leads.map(strip))
    }
    if (route === '/leads' && method === 'POST') {
      // Manuel / test lead olusturma (gercek DB kaydi)
      const b = await request.json()
      const lead = {
        id: uuidv4(),
        pageId: b.pageId || null,
        platform: b.platform || 'FACEBOOK_COMMENT',
        externalUserId: b.externalUserId || uuidv4(),
        userName: b.userName || 'Manuel Kayit',
        commentId: b.commentId || null,
        postId: b.postId || null,
        userMessage: b.userMessage || '',
        replySent: !!b.replySent,
        dmSent: !!b.dmSent,
        status: b.status || 'NEW',
        sentiment: b.sentiment || 'GENERAL',
        whatsappNumber: b.whatsappNumber || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('leads').insertOne(lead)
      return json(strip(lead))
    }
    if (route.startsWith('/leads/') && method === 'PUT') {
      const id = pathSegments[1]
      const b = await request.json()
      const set = { updatedAt: new Date() }
      if (b.status) set.status = b.status
      await database.collection('leads').updateOne({ id }, { $set: set })
      const l = await database.collection('leads').findOne({ id })
      return json(strip(l))
    }

    // ---- WEBHOOKS: META (oturum muaf — verify token + imza) ----
    const metaHook = route === '/webhooks/meta' || route === '/webhook/meta'
    const tgHook = route === '/webhooks/telegram' || route === '/webhook/telegram'
    if (metaHook && method === 'GET') {
      const mode = url.searchParams.get('hub.mode')
      const verifyToken = url.searchParams.get('hub.verify_token')
      const challenge = url.searchParams.get('hub.challenge')
      if (mode === 'subscribe' && verifyToken === (process.env.META_VERIFY_TOKEN || '')) {
        await log('META_WEBHOOK', 'INFO', 'Webhook dogrulama basarili')
        return new NextResponse(challenge, { status: 200 })
      }
      return new NextResponse('Forbidden', { status: 403 })
    }
    if (metaHook && method === 'POST') {
      const raw = await request.text()
      const sig = request.headers.get('x-hub-signature-256') || request.headers.get('X-Hub-Signature-256')
      const chk = verifyMetaSignature(raw, sig)
      if (!chk.ok) {
        await log('META_WEBHOOK', 'ERROR', 'Imza reddedildi', { reason: chk.reason })
        return json({ error: chk.reason }, 403)
      }
      const body = raw ? JSON.parse(raw) : {}
      await log('META_WEBHOOK', 'INFO', 'Webhook olayi alindi', { object: body.object })
      const results = await processMetaWebhook(database, body)
      return json({ ok: true, processed: results })
    }

    // ---- WEBHOOKS: TELEGRAM (oturum muaf) ----
    if (tgHook && method === 'POST') {
      const secret = process.env.TELEGRAM_WEBHOOK_SECRET || ''
      if (secret) {
        const got = request.headers.get('x-telegram-bot-api-secret-token') || ''
        if (got !== secret) return json({ error: 'telegram token hatali' }, 403)
      }
      const body = await request.json()
      const result = await processTelegramWebhook(database, body)
      return json({ ok: true, result })
    }

    // ---- YOUTUBE ----
    if (route === '/youtube/status' && method === 'GET') {
      const ytLeads = await database.collection('leads').countDocuments({ platform: 'YOUTUBE_COMMENT' })
      return json({
        configured: youtubeConfigured(),
        replyEnabled: !!youtubeOAuthToken(),
        channelId: youtubeChannelId(),
        capturedLeads: ytLeads,
      })
    }

    // Kanal / video yorumlarini tara + fiyat/iletisim yorumlarina otomatik yanit
    if (route === '/youtube/scan' && method === 'POST') {
      const b = await request.json()
      if (!youtubeConfigured()) return json({ error: 'YOUTUBE_API_KEY tanimli degil' }, 400)
      const channelId = b.channelId || youtubeChannelId()
      const videoId = b.videoId
      if (!channelId && !videoId) return json({ error: 'channelId veya videoId gerekli' }, 400)
      let data
      try {
        data = videoId ? await listVideoCommentThreads(videoId) : await listChannelCommentThreads(channelId)
      } catch (e) {
        await log('YOUTUBE', 'ERROR', 'YouTube tarama hatasi', { error: e.message })
        return json({ error: 'YouTube API hatasi: ' + e.message }, 502)
      }
      const processed = []
      for (const item of data.items || []) {
        const top = item.snippet?.topLevelComment
        if (!top) continue
        const r = await processYoutubeComment(database, {
          commentId: top.id,
          text: top.snippet?.textOriginal || top.snippet?.textDisplay || '',
          author: top.snippet?.authorDisplayName,
          authorChannelId: top.snippet?.authorChannelId?.value,
          videoId: item.snippet?.videoId || videoId,
        })
        processed.push(r)
      }
      return json({ ok: true, scanned: (data.items || []).length, processed })
    }

    // YouTube yorum motoru testi (anahtar olmadan calisir - gercek DB kaydi)
    if (route === '/youtube/simulate' && method === 'POST') {
      const b = await request.json()
      const r = await processYoutubeComment(database, {
        commentId: 'yt_sim_' + uuidv4(),
        text: b.message || 'Bu urunun fiyati ne kadar, nerede satiyorsunuz?',
        author: b.userName || 'YouTube Test',
        authorChannelId: 'UC_sim_' + uuidv4().slice(0, 8),
        videoId: 'vid_' + uuidv4().slice(0, 8),
      })
      return json({ ok: true, simulated: true, processed: [r] })
    }

    // YouTube Shorts yayinlama (OAuth2 gerekir)
    if (route === '/youtube/publish' && method === 'POST') {
      const b = await request.json()
      const token = youtubeOAuthToken()
      if (!token) {
        return json({
          error: 'OAUTH_REQUIRED',
          message:
            "YouTube Shorts yuklemek icin OAuth2 access token (youtube.upload izni) gereklidir. Sadece YOUTUBE_API_KEY yorum okuma/tarama icindir. OAuth baglantisi kurulunca aktiflesecek.",
        }, 501)
      }
      // OAuth token mevcutsa: video dosyasi + resumable upload akisi gerektirir.
      if (b.id) {
        await database.collection('content_posts').updateOne(
          { id: b.id },
          { $set: { status: 'SCHEDULED', updatedAt: new Date() } }
        )
      }
      return json({
        ok: true,
        message: 'OAuth token bulundu. Video dosyasi resumable upload ile yuklenmelidir (medya dosyasi bekleniyor).',
        requiresMedia: true,
      }, 200)
    }

    // ================= STUDIO (Afis & Reels) =================
    if (route === '/studio/presets' && method === 'GET') {
      return json(PRESETS.map((p) => ({ id: p.id, name: p.name, url: `/api/media?dir=music&file=${p.id}.mp3` })))
    }

    // ---- LOGO KUTUPHANESI (max 5, base64 MongoDB) ----
    if (route === '/studio/logos' && method === 'GET') {
      const logos = await database.collection('studio_logos').find({}).sort({ createdAt: -1 }).toArray()
      return json(logos.map(strip))
    }
    if (route === '/studio/logos' && method === 'POST') {
      const b = await request.json()
      if (!b.image || !String(b.image).startsWith('data:image')) return json({ error: 'Gecerli bir gorsel (dataUrl) zorunlu' }, 400)
      const count = await database.collection('studio_logos').countDocuments()
      if (count >= 5) return json({ error: 'En fazla 5 logo saklayabilirsiniz. Once bir logoyu silin.' }, 400)
      const doc = { id: uuidv4(), name: b.name || `Logo ${count + 1}`, image: b.image, createdAt: new Date() }
      await database.collection('studio_logos').insertOne(doc)
      return json(strip(doc))
    }
    if (route.startsWith('/studio/logos/') && method === 'DELETE') {
      const id = pathSegments[2]
      await database.collection('studio_logos').deleteOne({ id })
      return json({ ok: true })
    }

    // ================= VIDEO KESICI (trim & split) =================
    // Parcali (chunked) video yukleme - proxy limitlerini asmak icin
    if (route === '/video/upload-chunk' && method === 'POST') {
      ensureDirs()
      const form = await request.formData()
      const uploadId = safeName(String(form.get('uploadId') || ''))
      const index = Number(form.get('index') || 0)
      const isFinal = String(form.get('final') || '') === 'true'
      const ext = safeName(String(form.get('ext') || 'mp4')).replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'mp4'
      const chunk = form.get('chunk')
      if (!uploadId || !chunk || typeof chunk === 'string') return json({ error: 'uploadId ve chunk zorunlu' }, 400)
      const file = `srcvid_${uploadId}.${ext}`
      const abs = path.join(UPLOAD_DIR, file)
      const buf = Buffer.from(await chunk.arrayBuffer())
      if (index === 0) await fsp.writeFile(abs, buf)
      else await fsp.appendFile(abs, buf)
      if (!isFinal) return json({ ok: true, received: index })
      // final: sureyi olc
      try {
        const duration = await probeDuration(abs)
        return json({ ok: true, file, url: `/api/media?dir=uploads&file=${file}`, duration })
      } catch (e) {
        return json({ error: 'Video okunamadi: ' + e.message }, 502)
      }
    }

    // Video kes (trim) - tek parca; renders kaydi olusturarak paylasim akisina baglanir
    if (route === '/video/trim' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      const start = Number(b.start) || 0
      const end = Number(b.end)
      if (!(end > start)) return json({ error: 'bitis, baslangictan buyuk olmali' }, 400)
      ensureDirs()
      const id = uuidv4()
      const outFile = `cut_${id}.mp4`
      const outAbs = path.join(UPLOAD_DIR, outFile)
      try {
        await trimVideo({ inputPath: inAbs, start, end, outPath: outAbs })
        const doc = {
          id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`,
          source: 'video-trim', duration: Number((end - start).toFixed(2)), title: b.title || '', description: b.description || '',
          error: null, createdAt: new Date(), updatedAt: new Date(),
        }
        await database.collection('renders').insertOne(doc)
        await log('AI_VISION', 'INFO', 'Video kesildi', { id, start, end })
        return json({ jobId: id, file: outFile, url: doc.videoUrl, duration: doc.duration })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Video kesme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Videodan aralik cikar (kalanlar birlesir, oynatici bu dosyayla devam eder)
    if (route === '/video/excise' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      const ranges = Array.isArray(b.ranges) && b.ranges.length
        ? b.ranges
        : (b.start != null && b.end != null ? [{ start: b.start, end: b.end }] : [])
      if (!ranges.length) return json({ error: 'silinecek aralik zorunlu' }, 400)
      ensureDirs()
      const id = uuidv4()
      const outFile = `edit_${id}.mp4`
      const outAbs = path.join(UPLOAD_DIR, outFile)
      try {
        await exciseRanges({ inputPath: inAbs, ranges, outPath: outAbs })
        let duration = null
        try { duration = Number((await probeDuration(outAbs)).toFixed(2)) } catch (e) {}
        const doc = {
          id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`,
          source: 'video-excise', duration, title: '', description: '',
          error: null, createdAt: new Date(), updatedAt: new Date(),
        }
        await database.collection('renders').insertOne(doc)
        await log('AI_VISION', 'INFO', 'Video araligi cikarildi', { id, ranges })
        return json({ jobId: id, file: outFile, url: doc.videoUrl, duration })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Video aralik cikarma hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Video bol (split) - esit parca (parts) veya nokta listesi (points saniye)
    if (route === '/video/split' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      ensureDirs()
      let total
      try { total = await probeDuration(inAbs) } catch (e) { return json({ error: 'sure okunamadi: ' + e.message }, 502) }
      const segments = []
      const cutPairs = []
      if (Array.isArray(b.ranges) && b.ranges.length) {
        for (const r of b.ranges) {
          const s = Math.max(0, Number(r.start) || 0)
          const e = Math.min(total, Number(r.end))
          if (e - s > 0.2) cutPairs.push([s, e])
        }
        if (!cutPairs.length) return json({ error: 'Gecerli baslangic-bitis araligi yok' }, 400)
      } else if (Array.isArray(b.points) && b.points.length) {
        const pts = b.points.map(Number).filter((n) => n > 0 && n < total).sort((a, c) => a - c)
        const bounds = [0, ...pts, total]
        for (let i = 0; i < bounds.length - 1; i++) {
          if (bounds[i + 1] - bounds[i] > 0.2) cutPairs.push([bounds[i], bounds[i + 1]])
        }
      } else {
        const parts = Math.max(2, Math.min(10, Number(b.parts) || 2))
        const bounds = [0]
        for (let i = 1; i <= parts; i++) bounds.push(Number(((total * i) / parts).toFixed(3)))
        for (let i = 0; i < bounds.length - 1; i++) cutPairs.push([bounds[i], bounds[i + 1]])
      }
      try {
        for (const [s, e] of cutPairs) {
          const id = uuidv4()
          const outFile = `split_${id}.mp4`
          await trimVideo({ inputPath: inAbs, start: s, end: e, outPath: path.join(UPLOAD_DIR, outFile) })
          const doc = {
            id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`,
            source: 'video-split', duration: Number((e - s).toFixed(2)), title: '', description: '',
            error: null, createdAt: new Date(), updatedAt: new Date(),
          }
          await database.collection('renders').insertOne(doc)
          segments.push({ jobId: id, index: segments.length, file: outFile, url: doc.videoUrl, start: Number(s.toFixed(2)), end: Number(e.toFixed(2)), duration: doc.duration })
        }
        await log('AI_VISION', 'INFO', 'Video bolundu', { parts: segments.length })
        return json({ segments })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Video bolme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // ---- AFIS KUTUPHANESI (Reels Studyosundan kaydedilen posterler) ----
    if (route === '/posters' && method === 'GET') {
      const posters = await database.collection('posters').find({}).sort({ createdAt: -1 }).toArray()
      return json(posters.map(strip))
    }
    if (route === '/posters' && method === 'POST') {
      const b = await request.json()
      if (!b.dataUrl || !String(b.dataUrl).startsWith('data:image')) return json({ error: 'Gecerli bir afis gorseli (dataUrl) zorunlu' }, 400)
      ensureDirs()
      const count = await database.collection('posters').countDocuments()
      if (count >= 12) return json({ error: 'En fazla 12 afis saklayabilirsiniz. Once bir afis silin.' }, 400)
      const id = uuidv4()
      const file = `intro_${id}.png`
      const data = String(b.dataUrl).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      await fsp.writeFile(path.join(UPLOAD_DIR, file), Buffer.from(data, 'base64'))
      const doc = { id, name: b.name || `Afis ${count + 1}`, file, url: `/api/media?dir=uploads&file=${file}`, thumb: b.thumb || null, createdAt: new Date() }
      await database.collection('posters').insertOne(doc)
      return json(strip(doc))
    }
    if (route.startsWith('/posters/') && method === 'DELETE') {
      const id = pathSegments[1]
      await database.collection('posters').deleteOne({ id })
      return json({ ok: true })
    }

    // Afisi videonun onune giris (intro) olarak ekle -> renders kaydi
    if (route === '/video/prepend-poster' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file (video) zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      ensureDirs()
      // afis kaynagi: kayitli posterFile veya dataUrl
      let posterAbs
      if (b.posterFile) {
        posterAbs = path.join(UPLOAD_DIR, safeName(b.posterFile))
        if (!posterAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(posterAbs)) return json({ error: 'afis dosyasi yok' }, 404)
      } else if (b.posterDataUrl) {
        const pf = `introposter_${uuidv4()}.png`
        posterAbs = path.join(UPLOAD_DIR, pf)
        const data = String(b.posterDataUrl).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
        await fsp.writeFile(posterAbs, Buffer.from(data, 'base64'))
      } else {
        return json({ error: 'posterFile veya posterDataUrl zorunlu' }, 400)
      }
      const id = uuidv4()
      const outFile = `intro_out_${id}.mp4`
      const outAbs = path.join(UPLOAD_DIR, outFile)
      try {
        const info = await probeVideoInfo(inAbs)
        const dur = Math.max(0.5, Math.min(10, Number(b.duration) || 2))
        await prependPoster({ posterPath: posterAbs, videoPath: inAbs, duration: dur, outPath: outAbs, info })
        let duration = null; try { duration = Number((await probeDuration(outAbs)).toFixed(2)) } catch (e) {}
        const doc = { id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`, source: 'video-intro', duration, title: '', description: '', error: null, createdAt: new Date(), updatedAt: new Date() }
        await database.collection('renders').insertOne(doc)
        await log('AI_VISION', 'INFO', 'Afis video onune eklendi', { id, dur })
        return json({ jobId: id, file: outFile, url: doc.videoUrl, duration })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Afis ekleme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Videodan kapak (thumbnail) al -> PNG
    if (route === '/video/thumbnail' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      ensureDirs()
      const outFile = `thumb_${uuidv4()}.png`
      try {
        await extractThumbnail({ inputPath: inAbs, time: Number(b.time) || 0, outPath: path.join(UPLOAD_DIR, outFile) })
        return json({ file: outFile, url: `/api/media?dir=uploads&file=${outFile}`, time: Number(b.time) || 0 })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Kapak alma hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Videoyu dikey 9:16 (Reels formati) yap -> renders kaydi
    if (route === '/video/vertical' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      ensureDirs()
      const id = uuidv4()
      const outFile = `vert_${id}.mp4`
      try {
        await toVertical({ inputPath: inAbs, outPath: path.join(UPLOAD_DIR, outFile) })
        let duration = null; try { duration = Number((await probeDuration(path.join(UPLOAD_DIR, outFile))).toFixed(2)) } catch (e) {}
        const doc = { id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`, source: 'video-vertical', duration, title: '', description: '', error: null, createdAt: new Date(), updatedAt: new Date() }
        await database.collection('renders').insertOne(doc)
        await log('AI_VISION', 'INFO', 'Video 9:16 yapildi', { id })
        return json({ jobId: id, file: outFile, url: doc.videoUrl, duration })
      } catch (e) {
        await log('AI_VISION', 'ERROR', '9:16 donusturme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Videonun sesini kaldir veya muzikle degistir -> renders kaydi
    if (route === '/video/audio' && method === 'POST') {
      const b = await request.json()
      if (!b.file) return json({ error: 'file zorunlu' }, 400)
      const inAbs = path.join(UPLOAD_DIR, safeName(b.file))
      if (!inAbs.startsWith(UPLOAD_DIR) || !fs.existsSync(inAbs)) return json({ error: 'video dosyasi yok' }, 404)
      ensureDirs()
      const action = b.action === 'music' ? 'music' : 'mute'
      const id = uuidv4()
      const outFile = `${action}_${id}.mp4`
      const outAbs = path.join(UPLOAD_DIR, outFile)
      try {
        if (action === 'mute') {
          await stripAudio({ inputPath: inAbs, outPath: outAbs })
        } else {
          let audioPath = null
          if (b.audioFile) { const ap = path.join(UPLOAD_DIR, safeName(b.audioFile)); if (fs.existsSync(ap)) audioPath = ap }
          if (!audioPath) audioPath = presetPath(b.presetId || 'enerjik')
          if (!audioPath) return json({ error: 'Muzik bulunamadi (preset veya yuklenen dosya)' }, 400)
          await replaceAudio({ inputPath: inAbs, audioPath, outPath: outAbs })
        }
        let duration = null; try { duration = Number((await probeDuration(outAbs)).toFixed(2)) } catch (e) {}
        const doc = { id, status: 'DONE', outFile, videoUrl: `/api/media?dir=uploads&file=${outFile}`, source: 'video-' + action, duration, title: '', description: '', error: null, createdAt: new Date(), updatedAt: new Date() }
        await database.collection('renders').insertOne(doc)
        await log('AI_VISION', 'INFO', 'Video ses islemi: ' + action, { id })
        return json({ jobId: id, file: outFile, url: doc.videoUrl, duration, action })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Video ses islemi hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Arka plan silme (Remove.bg / Photoroom)
    if (route === '/studio/remove-bg' && method === 'POST') {
      if (!bgConfigured()) return json({ error: `Arka plan silme icin ${bgProvider() === 'photoroom' ? 'PHOTOROOM_API_KEY' : 'REMOVE_BG_API_KEY'} gerekli` }, 503)
      const b = await request.json()
      if (!b.image) return json({ error: 'image (dataUrl) zorunlu' }, 400)
      const m = String(b.image).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/)
      const mime = m ? m[1] : 'image/jpeg'
      const data = m ? m[2] : b.image
      try {
        const out = await removeBackground(Buffer.from(data, 'base64'), 'input.png', mime)
        return json({ image: 'data:image/png;base64,' + out.toString('base64') })
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Arka plan silme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Afisi (canvas PNG) kaydet
    if (route === '/studio/save-poster' && method === 'POST') {
      const b = await request.json()
      if (!b.dataUrl) return json({ error: 'dataUrl zorunlu' }, 400)
      ensureDirs()
      const data = String(b.dataUrl).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
      const id = uuidv4()
      const file = `poster_${id}.png`
      await fsp.writeFile(path.join(UPLOAD_DIR, file), Buffer.from(data, 'base64'))
      return json({ id, file, url: `/api/media?dir=uploads&file=${file}` })
    }

    // Kullanici muzigi yukle (multipart)
    if (route === '/studio/upload-audio' && method === 'POST') {
      ensureDirs()
      const form = await request.formData()
      const f = form.get('file')
      if (!f || typeof f === 'string') return json({ error: 'file zorunlu' }, 400)
      const ext = (f.name && f.name.includes('.')) ? f.name.split('.').pop().toLowerCase() : 'mp3'
      const file = `audio_${uuidv4()}.${safeName(ext)}`
      await fsp.writeFile(path.join(UPLOAD_DIR, file), Buffer.from(await f.arrayBuffer()))
      return json({ file, url: `/api/media?dir=uploads&file=${file}` })
    }

    // Reels render (ffmpeg - arka planda) - tek veya coklu sahne
    if (route === '/studio/render' && method === 'POST') {
      const b = await request.json()
      const hasScenes = Array.isArray(b.scenes) && b.scenes.length > 0
      if (!hasScenes && !b.posterDataUrl && !b.posterFile) return json({ error: 'posterDataUrl, posterFile veya scenes zorunlu' }, 400)
      ensureDirs()
      const id = uuidv4()

      // audio
      let audioPath = null
      const mode = b.audioMode || 'silent'
      if (mode === 'preset') audioPath = presetPath(b.presetId || 'enerjik')
      else if (mode === 'upload' && b.audioFile) {
        const ap = path.join(UPLOAD_DIR, safeName(b.audioFile))
        if (fs.existsSync(ap)) audioPath = ap
      }

      const outFile = `reels_${id}.mp4`
      const outAbs = path.join(UPLOAD_DIR, outFile)

      // sahneleri diske yaz
      const scenes = []
      if (hasScenes) {
        for (let i = 0; i < b.scenes.length; i++) {
          const sc = b.scenes[i]
          const pf = `poster_${id}_${i}.png`
          const abs = path.join(UPLOAD_DIR, pf)
          const data = String(sc.posterDataUrl || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
          await fsp.writeFile(abs, Buffer.from(data, 'base64'))
          scenes.push({ posterPath: abs, duration: Math.max(1, Math.min(10, Number(sc.duration) || 3)) })
        }
      } else {
        const pf = `poster_${id}.png`
        const abs = path.join(UPLOAD_DIR, pf)
        if (b.posterDataUrl) {
          const data = String(b.posterDataUrl).replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
          await fsp.writeFile(abs, Buffer.from(data, 'base64'))
        } else {
          await fsp.copyFile(path.join(UPLOAD_DIR, safeName(b.posterFile)), abs)
        }
        scenes.push({ posterPath: abs, duration: 6 })
      }

      const totalDur = scenes.reduce((a, s) => a + s.duration, 0)
      const jobDoc = {
        id, status: 'RENDERING', outFile, videoUrl: null, audioMode: mode,
        sceneCount: scenes.length, transition: b.transition || 'fade', duration: totalDur,
        title: b.title || '', description: b.description || '', error: null, createdAt: new Date(), updatedAt: new Date(),
      }
      await database.collection('renders').insertOne(jobDoc)

      renderMultiScene({ scenes, transition: b.transition || 'fade', transitionDur: b.transitionDur || 0.7, outPath: outAbs, audioPath })
        .then(async () => {
          await database.collection('renders').updateOne({ id }, { $set: { status: 'DONE', videoUrl: `/api/media?dir=uploads&file=${outFile}`, updatedAt: new Date() } })
          await log('AI_VISION', 'INFO', 'Reels render tamam', { id, scenes: scenes.length })
        })
        .catch(async (e) => {
          await database.collection('renders').updateOne({ id }, { $set: { status: 'FAILED', error: e.message, updatedAt: new Date() } })
          await log('AI_VISION', 'ERROR', 'Reels render hatasi', { id, error: e.message })
        })
      return json({ jobId: id, status: 'RENDERING', sceneCount: scenes.length })
    }

    // Afis icin AI metin onerisi
    if (route === '/studio/suggest-labels' && method === 'POST') {
      if (!aiConfigured()) return json({ error: 'AI yapilandirilmamis' }, 503)
      const b = await request.json()
      if (!b.image) return json({ error: 'image (dataUrl) zorunlu' }, 400)
      try {
        const s = await suggestPosterLabels(b.image, b.context || '')
        await log('AI_VISION', 'INFO', 'Afis metin onerisi uretildi')
        return json(s)
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Afis oneri hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // Kullanici metinlerini gorsele uygun kutulara dok
    if (route === '/studio/custom-boxes' && method === 'POST') {
      if (!aiConfigured()) return json({ error: 'AI yapilandirilmamis' }, 503)
      const b = await request.json()
      if (!b.image || !Array.isArray(b.texts) || !b.texts.length) return json({ error: 'image ve texts zorunlu' }, 400)
      try {
        const r = await customPosterBoxes(b.image, b.texts, b.context || '')
        return json(r)
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Custom box hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    if (route.startsWith('/studio/render/') && method === 'GET') {
      const id = pathSegments[2]
      const doc = await database.collection('renders').findOne({ id })
      if (!doc) return json({ error: 'Render bulunamadi' }, 404)
      return json(strip(doc))
    }

    // ================= MEDIA STREAM =================
    if (route === '/media' && method === 'GET') {
      const dir = url.searchParams.get('dir')
      const file = safeName(url.searchParams.get('file') || '')
      const base = dir === 'music' ? MUSIC_DIR : dir === 'uploads' ? UPLOAD_DIR : null
      if (!base || !file) return json({ error: 'gecersiz istek' }, 400)
      const abs = path.join(base, file)
      if (!abs.startsWith(base) || !fs.existsSync(abs)) return json({ error: 'dosya yok' }, 404)
      const buf = await fsp.readFile(abs)
      const ext = file.split('.').pop().toLowerCase()
      const ct = ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'application/octet-stream'
      return new NextResponse(buf, { status: 200, headers: { 'Content-Type': ct, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } })
    }

    // ================= GOOGLE OAUTH (YouTube) =================
    if (route === '/video-ai/models' && method === 'GET') {
      return json({ ai: videoAiConfigured(), models: modelCatalog() })
    }
    if (route === '/video-ai/prompt' && method === 'POST') {
      if (!videoAiConfigured()) return json({ error: 'GEMINI_API_KEY tanimli degil' }, 503)
      const form = await request.formData()
      const description = String(form.get('description') || '')
      let kind = String(form.get('kind') || '')
      let buffer = null
      let mime = null
      const refImages = []
      const readBlob = async (f) => {
        if (!f || typeof f === 'string' || !f.arrayBuffer) return null
        const buf = Buffer.from(await f.arrayBuffer())
        if (buf.length > 22 * 1024 * 1024) return { tooBig: true }
        return { buf, mime: f.type || 'application/octet-stream' }
      }
      if (kind === 'video') {
        const got = await readBlob(form.get('file'))
        if (got?.tooBig) return json({ error: 'Dosya 20MB altinda olmali' }, 400)
        if (got) { buffer = got.buf; mime = got.mime }
      } else {
        for (let i = 1; i <= 3; i++) {
          const got = await readBlob(form.get('img' + i) || (i === 1 ? form.get('file') : null))
          if (got?.tooBig) return json({ error: 'Dosya 20MB altinda olmali' }, 400)
          if (!got) continue
          refImages.push({ buffer: got.buf, mime: got.mime || 'image/jpeg', role: String(form.get('role' + i) || '') })
        }
      }
      if (!kind) kind = buffer ? 'video' : refImages.length ? 'image' : 'text'
      if (!buffer && !refImages.length && !description.trim()) return json({ error: 'Video, fotograf veya urun aciklamasi gerekli' }, 400)
      try {
        const scene = await buildScenePrompt({ kind, buffer, mime, description, refImages })
        await log('AI_VISION', 'INFO', 'AI video sahne promptu', { kind })
        return json(scene)
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'Sahne promptu hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }
    if (route === '/video-ai/sync' && method === 'POST') {
      if (!videoAiConfigured()) return json({ error: 'GEMINI_API_KEY tanimli degil' }, 503)
      const b = await request.json().catch(() => ({}))
      try {
        const scene = await syncScenePrompt({ source: b.source, text: b.text })
        return json(scene)
      } catch (e) {
        return json({ error: e.message }, 502)
      }
    }
    if (route === '/video-ai/generate' && method === 'POST') {
      if (!videoAiConfigured()) return json({ error: 'GEMINI_API_KEY tanimli degil' }, 503)
      const b = await request.json()
      const usd = estimateUsd(b.modelId, b.seconds)
      if (usd == null) return json({ error: 'model veya sure gecersiz' }, 400)
      try {
        const started = await startVideoJob({
          modelId: b.modelId,
          seconds: b.seconds,
          prompt: b.prompt,
          imageBase64: b.image || null,
          images: Array.isArray(b.images) ? b.images : null,
        })
        const id = uuidv4()
        const doc = {
          id,
          status: 'RUNNING',
          modelId: b.modelId,
          seconds: Number(b.seconds),
          estimatedUsd: usd,
          prompt: b.prompt,
          operationName: started.operationName,
          outFile: null,
          videoUrl: null,
          error: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        await database.collection('video_ai_jobs').insertOne(doc)
        return json(strip(doc))
      } catch (e) {
        await log('AI_VISION', 'ERROR', 'AI video uretim baslamadi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }
    if (route.startsWith('/video-ai/job/') && method === 'GET') {
      const id = pathSegments[2]
      const job = await database.collection('video_ai_jobs').findOne({ id })
      if (!job) return json({ error: 'is bulunamadi' }, 404)
      if (job.status === 'RUNNING' && job.operationName) {
        try {
          const r = await pollVideoOperation(job.operationName)
          if (r.done) {
            await database.collection('video_ai_jobs').updateOne({ id }, {
              $set: { status: 'DONE', outFile: r.file, videoUrl: r.url, updatedAt: new Date(), error: null },
            })
            return json(strip(await database.collection('video_ai_jobs').findOne({ id })))
          }
        } catch (e) {
          await database.collection('video_ai_jobs').updateOne({ id }, { $set: { status: 'ERROR', error: e.message, updatedAt: new Date() } })
          return json(strip(await database.collection('video_ai_jobs').findOne({ id })))
        }
      }
      return json(strip(job))
    }

    if (route === '/oauth/google/url' && method === 'GET') {
      if (!googleConfigured()) return json({ error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET tanimli degil', redirectUri: redirectUri() }, 503)
      return json({ url: authorizeUrl('cockpit'), redirectUri: redirectUri() })
    }
    if (route === '/oauth/google/callback' && method === 'GET') {
      const code = url.searchParams.get('code')
      const base = process.env.NEXT_PUBLIC_BASE_URL || ''
      if (!code) return NextResponse.redirect(`${base}/?youtube=error`)
      try {
        const tok = await exchangeCode(code)
        const set = { id: 'youtube', accessToken: tok.access_token, expiresAt: new Date(Date.now() + (tok.expires_in || 3600) * 1000), updatedAt: new Date() }
        const update = { $set: set }
        if (tok.refresh_token) update.$set.refreshToken = tok.refresh_token
        await database.collection('oauth_tokens').updateOne({ id: 'youtube' }, update, { upsert: true })
        await log('YOUTUBE', 'INFO', 'Google OAuth baglandi')
        return NextResponse.redirect(`${base}/?youtube=connected`)
      } catch (e) {
        await log('YOUTUBE', 'ERROR', 'OAuth callback hatasi', { error: e.message })
        return NextResponse.redirect(`${base}/?youtube=error`)
      }
    }
    if (route === '/oauth/google/status' && method === 'GET') {
      const doc = await database.collection('oauth_tokens').findOne({ id: 'youtube' })
      return json({ connected: !!doc?.refreshToken, configured: googleConfigured(), redirectUri: redirectUri() })
    }

    // ================= PUBLISH: YouTube Short (OAuth) =================
    if (route === '/youtube/upload-short' && method === 'POST') {
      const b = await request.json()
      const render = b.jobId ? await database.collection('renders').findOne({ id: b.jobId }) : null
      const fileName = render?.outFile || b.file
      if (!fileName) return json({ error: 'jobId veya file zorunlu' }, 400)
      const abs = path.join(UPLOAD_DIR, safeName(fileName))
      if (!fs.existsSync(abs)) return json({ error: 'Video dosyasi bulunamadi' }, 404)
      let token = youtubeOAuthToken()
      if (!token) { try { token = await getValidAccessToken(database) } catch (e) {} }
      if (!token) return json({ error: 'OAUTH_REQUIRED', message: 'Once Ayarlar > YouTube Kanal Bagla ile OAuth baglantisi kurun.' }, 501)
      try {
        const res = await uploadShort(token, abs, b.title || render?.title || 'Reels', b.description || render?.description || '')
        await log('YOUTUBE', 'INFO', 'Shorts yuklendi', { videoId: res.id })
        return json({ ok: true, videoId: res.id, url: `https://youtube.com/shorts/${res.id}` })
      } catch (e) {
        await log('YOUTUBE', 'ERROR', 'Shorts yukleme hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // ================= PUBLISH: Facebook Reel =================
    if (route === '/reels/publish-fb' && method === 'POST') {
      const b = await request.json()
      const render = b.jobId ? await database.collection('renders').findOne({ id: b.jobId }) : null
      const fileName = render?.outFile || b.file
      if (!fileName) return json({ error: 'jobId veya file zorunlu' }, 400)
      const abs = path.join(UPLOAD_DIR, safeName(fileName))
      if (!fs.existsSync(abs)) return json({ error: 'Video dosyasi bulunamadi' }, 404)
      const pageDoc = b.pageId ? await database.collection('facebook_pages').findOne({ id: b.pageId }) : await database.collection('facebook_pages').findOne({})
      const pid = pageDoc?.pageId || process.env.PAGE_ID
      const tok = pageDoc?.accessToken || process.env.PAGE_ACCESS_TOKEN
      if (!pid || !tok) return json({ error: 'PAGE_ID / PAGE_ACCESS_TOKEN tanimli degil (Facebook sayfasi ekleyin)' }, 501)
      try {
        const res = await publishFacebookReel(abs, b.description || render?.description || '', pid, tok)
        await log('META_WEBHOOK', 'INFO', 'Facebook Reel yayinlandi', { videoId: res.video_id })
        return json({ ok: true, ...res })
      } catch (e) {
        await log('META_WEBHOOK', 'ERROR', 'Facebook Reel hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // ================= PUBLISH: Instagram Reel =================
    if (route === '/reels/publish-ig' && method === 'POST') {
      const b = await request.json()
      const render = b.jobId ? await database.collection('renders').findOne({ id: b.jobId }) : null
      if (!render) return json({ error: 'jobId zorunlu / render bulunamadi' }, 400)
      if (!igConfigured()) return json({ error: 'IG_USER_ID / PAGE_ACCESS_TOKEN tanimli degil' }, 501)
      try {
        const res = await publishRenderTo(database, render, 'instagram', b.caption)
        await log('META_WEBHOOK', 'INFO', 'Instagram Reel yayinlandi', res)
        return json({ ok: true, ...res })
      } catch (e) {
        await log('META_WEBHOOK', 'ERROR', 'Instagram Reel hatasi', { error: e.message })
        return json({ error: e.message }, 502)
      }
    }

    // ================= SCHEDULE (Zamanlanmis Paylasim) =================
    if (route === '/schedule' && method === 'GET') {
      const list = await database.collection('schedules').find({}).sort({ scheduledAt: 1 }).limit(200).toArray()
      return json(list.map(strip))
    }
    if (route === '/schedule' && method === 'POST') {
      const b = await request.json()
      if (!b.jobId || !b.scheduledAt || !Array.isArray(b.platforms) || !b.platforms.length) {
        return json({ error: 'jobId, scheduledAt ve platforms zorunlu' }, 400)
      }
      const render = await database.collection('renders').findOne({ id: b.jobId })
      if (!render) return json({ error: 'Render bulunamadi' }, 400)
      const doc = {
        id: uuidv4(),
        jobId: b.jobId,
        outFile: render.outFile,
        platforms: b.platforms,
        caption: b.caption || '',
        scheduledAt: new Date(b.scheduledAt),
        status: 'PENDING',
        results: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await database.collection('schedules').insertOne(doc)
      await log('SCHEDULER', 'INFO', 'Yeni zamanli paylasim', { id: doc.id, at: doc.scheduledAt })
      return json(strip(doc))
    }
    if (route.startsWith('/schedule/') && pathSegments[2] === 'publish-now' && method === 'POST') {
      const id = pathSegments[1]
      await database.collection('schedules').updateOne({ id }, { $set: { scheduledAt: new Date(), status: 'PENDING', updatedAt: new Date() } })
      await processDueSchedules(database)
      const doc = await database.collection('schedules').findOne({ id })
      return json(doc ? strip(doc) : { ok: true })
    }
    if (route.startsWith('/schedule/') && method === 'DELETE') {
      const id = pathSegments[1]
      await database.collection('schedules').deleteOne({ id })
      return json({ ok: true })
    }

    // ================= CRON =================
    if (route === '/cron/status' && method === 'GET') {
      const s = await database.collection('settings').findOne({ id: 'cron' })
      const state = getSchedulerState()
      return json({ 
        enabled: !!s?.enabled, 
        schedule: process.env.CRON_SCAN_SCHEDULE || '*/15 * * * *', 
        running: state.running,
        lastRun: state.lastRun,
        lastResult: state.lastResult
      })
    }
    if (route === '/cron/toggle' && method === 'POST') {
      const b = await request.json()
      const enabled = !!b.enabled
      await database.collection('settings').updateOne({ id: 'cron' }, { $set: { id: 'cron', enabled, updatedAt: new Date() } }, { upsert: true })
      if (enabled) startScheduler(process.env.CRON_SCAN_SCHEDULE || '*/15 * * * *', () => scanAll(database))
      else stopScheduler()
      return json({ ok: true, enabled, ...getSchedulerState() })
    }
    if (route === '/cron/run' && method === 'POST') {
      const r = await scanAll(database)
      setLast(r)
      return json({ ok: true, result: r })
    }

    // ---- Test simulator: fake a Meta comment to run the engine end-to-end ----
    if (route === '/simulate/comment' && method === 'POST') {
      const b = await request.json()
      const page = await database.collection('facebook_pages').findOne({ id: b.pageId }) ||
        await database.collection('facebook_pages').findOne({})
      const fbPageId = page?.pageId || process.env.PAGE_ID || 'SIM_PAGE'
      const fakeBody = {
        object: 'page',
        entry: [{
          id: fbPageId,
          changes: [{
            field: 'feed',
            value: {
              item: 'comment',
              verb: 'add',
              comment_id: 'sim_' + uuidv4(),
              post_id: fbPageId + '_' + uuidv4().slice(0, 8),
              from: { id: 'sim_user_' + uuidv4().slice(0, 6), name: b.userName || 'Test Musteri' },
              message: b.message || 'Bu urunun fiyati ne kadar?',
            },
          }],
        }],
      }
      const results = await processMetaWebhook(database, fakeBody)
      return json({ ok: true, simulated: true, processed: results })
    }

    return json({ error: `Route ${route} bulunamadi` }, 404)
  } catch (error) {
    console.error('API Error:', error)
    return json({ error: 'Sunucu hatasi', message: error.message }, 500)
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
