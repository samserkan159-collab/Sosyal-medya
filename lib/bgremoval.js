// Arka plan silme - Remove.bg / Photoroom provider switch (gercek API cagrilari)
function need(name) {
  const v = process.env[name]
  if (!v) throw new Error(`${name} tanimli degil (.env)`) 
  return v
}

export function bgProvider() {
  return process.env.BACKGROUND_PROVIDER || 'removebg'
}

export function bgConfigured() {
  const p = bgProvider()
  if (p === 'removebg') return !!process.env.REMOVE_BG_API_KEY
  if (p === 'photoroom') return !!process.env.PHOTOROOM_API_KEY
  return false
}

export async function removeBackground(buffer, filename = 'input.jpg', mime = 'image/jpeg') {
  const provider = bgProvider()
  const form = new FormData()
  form.append('image_file', new Blob([buffer], { type: mime }), filename)

  let url
  let headers
  if (provider === 'removebg') {
    url = 'https://api.remove.bg/v1.0/removebg'
    form.append('size', 'auto')
    headers = { 'X-Api-Key': need('REMOVE_BG_API_KEY') }
  } else if (provider === 'photoroom') {
    url = 'https://sdk.photoroom.com/v1/segment'
    headers = { 'x-api-key': need('PHOTOROOM_API_KEY') }
  } else {
    throw new Error('BACKGROUND_PROVIDER removebg veya photoroom olmali')
  }

  const r = await fetch(url, { method: 'POST', headers, body: form })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`Arka plan silme hatasi (${r.status}): ${t.slice(0, 200)}`)
  }
  return Buffer.from(await r.arrayBuffer())
}
