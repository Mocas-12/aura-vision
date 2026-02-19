module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  try {
    const info = {
      method: req.method,
      hasKey: !!process.env.NVIDIA_API_KEY,
      message: 'Backend Is Active',
    }
    return res.status(200).send(JSON.stringify(info, null, 2))
  } catch (err) {
    return res.status(500).send('Server Error: ' + (err && err.message ? err.message : String(err)))
  }
}
