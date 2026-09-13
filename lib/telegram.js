// Telegram Bot API istemcisi (gercek HTTP cagrilari)
function token() {
  return process.env.TELEGRAM_BOT_TOKEN
}
export function defaultChat() {
  return process.env.TELEGRAM_CHAT_ID
}
export function telegramConfigured() {
  return !!token()
}

export async function tgApi(method, body) {
  if (!token()) throw new Error('TELEGRAM_BOT_TOKEN tanimli degil')
  const res = await fetch(`https://api.telegram.org/bot${token()}/${method}`, {
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
  })
}

export async function tgAnswerCallback(id, text) {
  return tgApi('answerCallbackQuery', { callback_query_id: id, text: text || 'Islem alindi' })
}

export async function tgGetFileUrl(fileId) {
  const info = await tgApi('getFile', { file_id: fileId })
  return `https://api.telegram.org/file/bot${token()}/${info.file_path}`
}

export async function tgDownloadBase64(fileId) {
  const url = await tgGetFileUrl(fileId)
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  return buf.toString('base64')
}

export async function tgDownloadToFile(fileId, destPath) {
  const fs = await import('fs/promises')
  const url = await tgGetFileUrl(fileId)
  const res = await fetch(url)
  const buf = Buffer.from(await res.arrayBuffer())
  await fs.writeFile(destPath, buf)
  return destPath
}
