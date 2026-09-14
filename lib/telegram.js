// Telegram Bot API — FB ve YT bildirimleri ayri botlar
function tokenFor(bot) {
  if (bot === 'yt') return process.env.TELEGRAM_YT_BOT_TOKEN || ''
  return process.env.TELEGRAM_FB_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || ''
}

export function defaultChat() {
  return process.env.TELEGRAM_CHAT_ID
}

export function telegramConfigured() {
  return !!(tokenFor('fb') || tokenFor('yt'))
}

export function telegramFbConfigured() {
  return !!tokenFor('fb')
}

export function telegramYtConfigured() {
  return !!tokenFor('yt')
}

export async function tgApi(method, body, bot = 'fb') {
  const token = tokenFor(bot)
  if (!token) throw new Error(bot === 'yt' ? 'TELEGRAM_YT_BOT_TOKEN tanimli degil' : 'TELEGRAM_FB_BOT_TOKEN tanimli degil')
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.description || 'Telegram API hatasi')
  return data.result
}

export async function tgSendMessage(text, opts = {}) {
  return tgApi('sendMessage', {
    chat_id: opts.chatId || defaultChat(),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: false,
    reply_markup: opts.reply_markup,
  }, opts.bot || 'fb')
}

export async function tgAnswerCallback(id, text, bot = 'fb') {
  return tgApi('answerCallbackQuery', { callback_query_id: id, text: text || 'Islem alindi' }, bot)
}

export async function tgGetFileUrl(fileId, bot = 'fb') {
  const token = tokenFor(bot)
  const info = await tgApi('getFile', { file_id: fileId }, bot)
  return `https://api.telegram.org/file/bot${token}/${info.file_path}`
}

export async function tgDownloadBase64(fileId, bot = 'fb') {
  const url = await tgGetFileUrl(fileId, bot)
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.toString('base64')
}

export async function tgDownloadToFile(fileId, destPath, bot = 'fb') {
  const fs = await import('fs/promises')
  const url = await tgGetFileUrl(fileId, bot)
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(destPath, buf)
  return destPath
}
