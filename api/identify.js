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
      max_tokens: 512,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'You are a helpful assistant. The image is a clear shot of a beverage. Ignore the background.' }
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

    function makeOptions() {
      return {
        hostname: 'integrate.api.nvidia.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        }
      }
    }

    function extractContent(parsed) {
      var text = null
      try {
        if (parsed && parsed.choices && parsed.choices.length > 0) {
          for (var i = 0; i < parsed.choices.length; i++) {
            var c = parsed.choices[i]
            var candidate = null
            if (c && c.message && c.message.content) candidate = c.message.content
            else if (c && c.delta && c.delta.content) candidate = c.delta.content
            if (candidate) { text = candidate; break }
          }
        }
      } catch (e) {}
      return text
    }

    function sendOnce(currModel, done) {
      var localPayload = JSON.parse(JSON.stringify(payload))
      localPayload.model = currModel
      var opts = makeOptions()
      var buf = ''
      var nreq = https.request(opts, function(nres) {
        nres.on('data', function(d) { buf += d })
        nres.on('end', function() {
          var parsed
          try { parsed = JSON.parse(buf) } catch (e) { parsed = { raw: buf } }
          var text = extractContent(parsed)
          var status = nres.statusCode || 200
          done(null, { status: status, content: text, parsed: parsed })
        })
      })
      nreq.on('error', function(err) {
        done(err)
      })
      nreq.write(JSON.stringify(localPayload))
      nreq.end()
    }

    sendOnce(model, function(err1, r1) {
      if (err1) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'NVIDIA request failed', message: String(err1 && err1.message ? err1.message : err1) }))
        return
      }
      var needFallback = (!r1 || !r1.content || r1.status >= 400) && model === allowedModels[0]
      if (!needFallback) {
        res.statusCode = r1.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: r1.status,
          empty: !r1.content,
          content: r1.content,
          model_used: model,
          nvidia: r1.parsed
        }))
        return
      }
      var fallback = allowedModels[1]
      sendOnce(fallback, function(err2, r2) {
        if (err2) {
          res.statusCode = r1.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            status: r1.status,
            empty: !r1.content,
            content: r1.content,
            model_used: model,
            fallback_error: String(err2 && err2.message ? err2.message : err2),
            nvidia: r1.parsed
          }))
          return
        }
        var finalContent = r2 && r2.content ? r2.content : r1.content
        var finalStatus = r2 && r2.content ? r2.status : r1.status
        res.statusCode = finalStatus
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: finalStatus,
          empty: !finalContent,
          content: finalContent,
          model_used: r2 && r2.content ? fallback : model,
          primary_status: r1.status,
          fallback_status: r2.status,
          nvidia_primary: r1.parsed,
          nvidia_fallback: r2.parsed
        }))
      })
    })
  })
}
