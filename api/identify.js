export const config = { runtime: 'edge' }
export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': 'https://Mocas-12.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers: cors })
  }
  if (req.method === 'GET') {
    return new Response(JSON.stringify({ ok: true, method: 'GET' }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing NVIDIA_API_KEY' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  let input = {}
  try {
    input = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const raw = String(input.imageDataUrl || input.base64 || input.image || '')
  const base64 = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '')
  if (!base64) {
    return new Response(JSON.stringify({ error: 'Missing image base64' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const approxBytes = Math.floor(base64.length * 3 / 4)
  const maxBytes = 4.5 * 1024 * 1024
  if (approxBytes > maxBytes) {
    return new Response(JSON.stringify({ error: 'Image too large, please compress before upload', approxBytes }), { status: 413, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const promptText = '你是一个专业的视觉分析专家。请识别图中的物品，并按以下格式用中文回复：\n\n【名称】：（如果是日文/英文，请翻译成中文名称）\n\n【介绍】：（简述该物品的用途、主要特点。如果包装上有日语或英语说明，请提取核心信息并转化为中文介绍）\n要求：语言专业且亲切，介绍字数控制在 80 字以内。\n特别注意包装上的细小文字，优先识别品牌名和商品类别。'
  const baseURL = 'https://integrate.api.nvidia.com/v1'
  const requestUrl = baseURL + '/chat/completions'
  async function callModel(model) {
    const payload = {
      model,
      max_tokens: 1024,
      stream: false,
      temperature: 0.2,
      messages: [
        { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }, { type: 'text', text: promptText }] }
      ]
    }
    const r = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify(payload)
    })
    let json
    try { json = await r.json() } catch { json = null }
    return { status: r.status, json }
  }
  const m1 = 'meta/llama-3.2-11b-vision-instruct'
  const r1 = await callModel(m1)
  if (r1.status === 404) {
    const m2 = 'nvidia/moonshotai/kimi-v1.5'
    const r2 = await callModel(m2)
    if (r2.status === 404) {
      const m3 = 'moonshotai/kimi-v1.5'
      const r3 = await callModel(m3)
      const choice3 = r3.json && r3.json.choices ? r3.json.choices[0] : null
      const raw3 = choice3 ? null : JSON.stringify({ choice0: choice3, request_url: requestUrl })
      return new Response(JSON.stringify({ status: r3.status, empty: !(r3.json && r3.json.choices), nvidia: r3.json || choice3, nvidia_primary_choice: choice3, raw_choice_json: raw3, request_url: requestUrl }), { status: r3.status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
    }
    const choice2 = r2.json && r2.json.choices ? r2.json.choices[0] : null
    const raw2 = choice2 ? null : JSON.stringify({ choice0: choice2, request_url: requestUrl })
    const out2 = r2.json || {}
    if (raw2 != null) out2.raw_choice_json = raw2
    out2.request_url = requestUrl
    return new Response(JSON.stringify(out2), { status: r2.status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
  }
  const choice1 = r1.json && r1.json.choices ? r1.json.choices[0] : null
  let raw1 = null
  if (!choice1) {
    raw1 = JSON.stringify({ choice0: choice1, request_url: requestUrl })
  }
  const out1 = r1.json || {}
  if (raw1 != null) out1.raw_choice_json = raw1
  out1.request_url = requestUrl
  return new Response(JSON.stringify(out1), { status: r1.status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } })
}
