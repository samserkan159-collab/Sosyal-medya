// Facebook / Instagram Graph API istemcisi (gercek HTTP cagrilari)
const V = process.env.META_GRAPH_VERSION || 'v21.0'
const BASE = `https://graph.facebook.com/${V}`

export async function graphGet(path, params, token) {
  const url = new URL(`${BASE}/${path}`)
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v))
  url.searchParams.set('access_token', token)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data?.error?.message || `Graph API GET hatasi (${res.status})`)
  return data
}

export async function graphPost(path, body, token) {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  })
  const data = await res.json()
  if (!res.ok || data.error) throw new Error(data?.error?.message || `Graph API POST hatasi (${res.status})`)
  return data
}

export async function crawlPage(pageId, token) {
  const fields =
    'name,about,description,category,hours,phone,emails,website,single_line_address,whatsapp_number,cover,picture,fan_count,link,is_published'
  return graphGet(pageId, { fields }, token)
}

export async function replyToComment(commentId, message, token) {
  return graphPost(`${commentId}/comments`, { message }, token)
}

// Yoruma ozel Messenger DM (comment_id ile private reply)
export async function sendPrivateReply(pageId, commentId, message, token) {
  return graphPost(
    `${pageId}/messages`,
    { recipient: { comment_id: commentId }, message: { text: message }, messaging_type: 'RESPONSE' },
    token
  )
}

export async function updatePageField(pageId, fields, token) {
  return graphPost(pageId, fields, token)
}

// Sayfa verisinden saglik skoru + eksik alanlar hesapla
export function computeHealth(data) {
  const checks = [
    { key: 'about', title: 'Hakkinda / Kisa aciklama', severity: 'HIGH', ok: !!data.about },
    { key: 'description', title: 'Detayli aciklama', severity: 'MEDIUM', ok: !!data.description },
    { key: 'phone', title: 'Telefon numarasi', severity: 'HIGH', ok: !!data.phone },
    { key: 'website', title: 'Web sitesi', severity: 'MEDIUM', ok: !!data.website },
    { key: 'emails', title: 'E-posta adresi', severity: 'LOW', ok: !!(data.emails && data.emails.length) },
    { key: 'whatsapp_number', title: 'WhatsApp numarasi', severity: 'HIGH', ok: !!data.whatsapp_number },
    { key: 'single_line_address', title: 'Adres bilgisi', severity: 'MEDIUM', ok: !!data.single_line_address },
    { key: 'hours', title: 'Calisma saatleri', severity: 'MEDIUM', ok: !!data.hours },
    { key: 'cover', title: 'Kapak fotografi', severity: 'HIGH', ok: !!(data.cover && data.cover.source) },
    { key: 'picture', title: 'Profil fotografi', severity: 'HIGH', ok: !!(data.picture && data.picture.data && data.picture.data.url) },
    { key: 'category', title: 'Kategori', severity: 'LOW', ok: !!data.category },
  ]
  const weight = { HIGH: 3, MEDIUM: 2, LOW: 1 }
  let total = 0
  let got = 0
  const missing = []
  checks.forEach((c) => {
    total += weight[c.severity]
    if (c.ok) got += weight[c.severity]
    else
      missing.push({
        key: c.key,
        title: c.title,
        severity: c.severity,
        actionUrl: `https://www.facebook.com/${data.id || ''}/settings`,
      })
  })
  const score = Math.round((got / total) * 100)
  return { score, missing }
}
