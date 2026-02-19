module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Content-Type', 'text/plain')
    return res.status(200).send('Final Test: Backend is really alive')
  } catch (e) {
    return res.status(500).send('Crash: ' + (e && e.message ? e.message : String(e)))
  }
}
