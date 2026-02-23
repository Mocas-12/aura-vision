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
    var base64 = raw.replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '')
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

    var promptText = '你是一个专业的视觉分析专家。请识别图中的物品，并按以下格式用中文回复：\n\n【名称】：（如果是日文/英文，请翻译成中文名称）\n\n【介绍】：（简述该物品的用途、主要特点。如果包装上有日语或英语说明，请提取核心信息并转化为中文介绍）\n要求：语言专业且亲切，介绍字数控制在 80 字以内。\n特别注意包装上的细小文字，优先识别品牌名和商品类别。'
    var defaultModel = 'meta/llama-3.2-11b-vision-instruct'
    var model = defaultModel
    var baseURL = 'https://integrate.api.nvidia.com/v1'
    var requestUrl = baseURL + '/chat/completions'

    var payload = {
      model: model,
      max_tokens: 1024,
      stream: false,
      temperature: 0.2,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + base64 } },
            { type: 'text', text: promptText }
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
          'Accept': 'application/json',
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

    function maskKey(k) {
      var s = String(k || '')
      var head = s.slice(0, 10)
      var tail = s.slice(-4)
      return head + '...' + tail
    }

    function sendOnce(currModel, localPayload, done) {
      localPayload = localPayload ? JSON.parse(JSON.stringify(localPayload)) : JSON.parse(JSON.stringify(payload))
      localPayload.model = currModel
      var opts = makeOptions()
      var buf = ''
      try { console.log('NVIDIA request URL:', requestUrl, 'model:', currModel, 'auth:', maskKey(apiKey)) } catch (e) {}
      var nreq = https.request(opts, function(nres) {
        nres.on('data', function(d) { buf += d })
        nres.on('end', function() {
          var parsed
          try { parsed = JSON.parse(buf) } catch (e) { parsed = { raw: buf } }
          var text = extractContent(parsed)
          var status = nres.statusCode || 200
          var statusText = nres.statusMessage || ''
          var headers = nres.headers || {}
          done(null, { status: status, statusText: statusText, headers: headers, content: text, parsed: parsed })
        })
      })
      nreq.on('error', function(err) {
        done(err)
      })
      nreq.write(JSON.stringify(localPayload))
      nreq.end()
    }

    sendOnce(model, payload, function(err1, r1) {
      if (err1) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          error: 'NVIDIA request failed',
          message: String(err1 && err1.message ? err1.message : err1),
          request_url: requestUrl
        }))
        return
      }
      if (r1.status === 404) {
        var m2 = 'nvidia/moonshotai/kimi-v1.5'
        sendOnce(m2, payload, function(err2, r2) {
          if (err2) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({
              error: 'NVIDIA request failed',
              message: String(err2 && err2.message ? err2.message : err2),
              request_url: requestUrl
            }))
            return
          }
          if (r2.status === 404) {
            var m3 = 'moonshotai/kimi-v1.5'
            sendOnce(m3, payload, function(err3, r3) {
              if (err3) {
                res.statusCode = 502
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(JSON.stringify({
                  error: 'NVIDIA request failed',
                  message: String(err3 && err3.message ? err3.message : err3),
                  request_url: requestUrl
                }))
                return
              }
              res.statusCode = r3.status
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              var choice3 = null
              try { choice3 = r3.parsed && r3.parsed.choices ? r3.parsed.choices[0] : null } catch (e) {}
              var raw3 = null
              if (!r3.content) {
                try { raw3 = JSON.stringify({ statusText: r3.statusText, headers: r3.headers, choice0: choice3, request_url: requestUrl }) } catch (e) { raw3 = JSON.stringify({ request_url: requestUrl }) }
              }
              res.end(JSON.stringify({
                status: r3.status,
                empty: !r3.content,
                content: r3.content,
                model_used: m3,
                nvidia: r3.content ? r3.parsed : choice3,
                nvidia_primary_choice: choice3,
                raw_choice_json: raw3,
                request_url: requestUrl
              }))
            })
            return
          }
          res.statusCode = r2.status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          var choice2 = null
          try { choice2 = r2.parsed && r2.parsed.choices ? r2.parsed.choices[0] : null } catch (e) {}
          var raw2 = null
          if (!r2.content) {
            try { raw2 = JSON.stringify({ statusText: r2.statusText, headers: r2.headers, choice0: choice2, request_url: requestUrl }) } catch (e) { raw2 = JSON.stringify({ request_url: requestUrl }) }
          }
          var out2 = r2.parsed || {}
          if (raw2 != null) out2.raw_choice_json = raw2
          out2.request_url = requestUrl
          res.end(JSON.stringify(out2))
        })
        return
      }
      res.statusCode = r1.status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      var primaryChoice = null
      try { primaryChoice = r1.parsed && r1.parsed.choices ? r1.parsed.choices[0] : null } catch (e) {}
      var raw_choice_json = null
      if (!r1.content) {
        try {
          raw_choice_json = JSON.stringify({
            statusText: r1.statusText,
            headers: r1.headers,
            choice0: primaryChoice,
            request_url: requestUrl
          })
        } catch (e) {
          raw_choice_json = JSON.stringify({ request_url: requestUrl })
        }
      }
      var out1 = r1.parsed || {}
      if (raw_choice_json != null) out1.raw_choice_json = raw_choice_json
      out1.request_url = requestUrl
      res.end(JSON.stringify(out1))
    })
  })
}
