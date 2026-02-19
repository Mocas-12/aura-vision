const https = require('https')

module.exports = function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') {
    res.statusCode = 200
    res.end('')
    return
  }
  if (req.method === 'GET') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: true, method: 'GET' }))
    return
  }
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Method Not Allowed' }))
    return
  }

  var apiKey = process.env.NVIDIA_API_KEY
  if (!apiKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Missing NVIDIA_API_KEY' }))
    return
  }

  var bodyStr = ''
  req.on('data', function(chunk) {
    bodyStr += chunk.toString('utf-8')
  })
  req.on('end', function() {
    var input
    try {
      input = JSON.parse(bodyStr || '{}')
    } catch (e) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Invalid JSON body' }))
      return
    }

    var raw = String(input.imageDataUrl || input.base64 || input.image || '')
    var base64 = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s+/g, '')
    if (!base64) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Missing image base64' }))
      return
    }
    var approxBytes = Math.floor(base64.length * 3 / 4)
    var maxBytes = 4.5 * 1024 * 1024
    if (approxBytes > maxBytes) {
      res.statusCode = 413
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'Image too large, please compress before upload', approxBytes: approxBytes }))
      return
    }

    var promptText = 'You are a helpful assistant. Identify the object in this image. If it is a drink like Wheat Tea (麦茶), please tell me its name and key features in Chinese.'
    var allowedModels = ['meta/llama-3.2-11b-vision-instruct', 'nvidia/llama-3.1-405b-instruct']
    var model = String((input && input.model) || '').trim()
    if (allowedModels.indexOf(model) === -1) model = allowedModels[0]

    var payload = {
      model: model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant.' }
          ]
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: promptText },
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } }
          ]
        }
      ]
    }

    var options = {
      hostname: 'integrate.api.nvidia.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      }
    }

    var nreq = https.request(options, function(nres) {
      var buf = ''
      nres.on('data', function(d) { buf += d })
      nres.on('end', function() {
        var parsed
        try { parsed = JSON.parse(buf) } catch (e) { parsed = { raw: buf } }
        var text = null
        var empty = true
        try {
          if (parsed && parsed.choices && parsed.choices.length > 0) {
            for (var i = 0; i < parsed.choices.length; i++) {
              var c = parsed.choices[i]
              var candidate = null
              if (c && c.message && c.message.content) candidate = c.message.content
              else if (c && c.delta && c.delta.content) candidate = c.delta.content
              if (candidate) { text = candidate; break }
            }
            empty = !text
          }
        } catch (e) {
          empty = true
        }
        res.statusCode = nres.statusCode || 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: nres.statusCode || 200,
          empty: empty,
          content: text,
          nvidia: parsed
        }))
      })
    })
    nreq.on('error', function(err) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({
        error: 'NVIDIA request failed',
        message: String(err && err.message ? err.message : err)
      }))
    })
    nreq.write(JSON.stringify(payload))
    nreq.end()
  })
}
