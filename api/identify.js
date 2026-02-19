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

    var promptText = 'What is this? Answer in one Chinese word.'
    var defaultModel = 'meta/llama-3.2-11b-vision-instruct'
    var model = defaultModel
    var baseURL = 'https://integrate.api.nvidia.com/v1'
    var requestUrl = baseURL + '/chat/completions'

    function buildPayload(usePrefix) {
      return {
        model: model,
        max_tokens: 512,
        stream: false,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: (usePrefix ? 'data:image/jpeg;base64,' : '') + base64 } },
              { type: 'text', text: promptText }
            ]
          }
        ]
      }
    }
    var payload = buildPayload(true)

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

    function sendOnce(currModel, localPayload, done) {
      localPayload = localPayload ? JSON.parse(JSON.stringify(localPayload)) : JSON.parse(JSON.stringify(payload))
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
      res.statusCode = r1.status
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      var primaryChoice = null
      try { primaryChoice = r1.parsed && r1.parsed.choices ? r1.parsed.choices[0] : null } catch (e) {}
      var raw_choice_json = null
      var finish_reason = null
      try { finish_reason = primaryChoice && primaryChoice.finish_reason ? primaryChoice.finish_reason : null } catch (e) {}
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
      if (r1.content || (finish_reason && finish_reason !== 'content_filter')) {
        res.end(JSON.stringify({
          status: r1.status,
          empty: !r1.content,
          content: r1.content,
          model_used: model,
          finish_reason: finish_reason,
          x_nvidia_request_id: r1.headers && r1.headers['x-nvidia-request-id'],
          nvidia: r1.content ? r1.parsed : primaryChoice,
          nvidia_primary_choice: primaryChoice,
          raw_choice_json: raw_choice_json,
          request_url: requestUrl,
          attempted_format: 'data_url'
        }))
        return
      }
      var payloadNoPrefix = buildPayload(false)
      sendOnce(model, payloadNoPrefix, function(err2, r2) {
        if (err2) {
          res.statusCode = r1.status || 502
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            status: r1.status,
            empty: !r1.content,
            content: r1.content,
            model_used: model,
            finish_reason: finish_reason,
            x_nvidia_request_id: r1.headers && r1.headers['x-nvidia-request-id'],
            nvidia: r1.parsed,
            raw_choice_json: raw_choice_json,
            request_url: requestUrl,
            attempted_format: 'data_url',
            retry_error: String(err2 && err2.message ? err2.message : err2)
          }))
          return
        }
        var choice1 = null
        try { choice1 = r2.parsed && r2.parsed.choices ? r2.parsed.choices[0] : null } catch (e) {}
        var finish_reason2 = null
        try { finish_reason2 = choice1 && choice1.finish_reason ? choice1.finish_reason : null } catch (e) {}
        var raw_choice_json2 = null
        if (!r2.content) {
          try {
            raw_choice_json2 = JSON.stringify({
              statusText: r2.statusText,
              headers: r2.headers,
              choice0: choice1,
              request_url: requestUrl
            })
          } catch (e) {
            raw_choice_json2 = JSON.stringify({ request_url: requestUrl })
          }
        }
        res.statusCode = r2.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          status: r2.status,
          empty: !r2.content,
          content: r2.content,
          model_used: model,
          finish_reason: finish_reason2,
          x_nvidia_request_id: r2.headers && r2.headers['x-nvidia-request-id'],
          nvidia: r2.content ? r2.parsed : choice1,
          nvidia_primary_choice: choice1,
          raw_choice_json: raw_choice_json2,
          request_url: requestUrl,
          attempted_format: 'base64_only',
          first_status: r1.status,
          first_finish_reason: finish_reason
        }))
      })
    })
  })
}
