module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'GET' || req.method === 'OPTIONS') {
    return res.status(200).send('Backend is Alive')
  }
  return res.status(200).json({ message: 'Ready for POST' })
}
