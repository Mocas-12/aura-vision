module.exports = function(req, res) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({
    message: 'Final Survival Test',
    key_ok: !!process.env.NVIDIA_API_KEY
  }))
}
