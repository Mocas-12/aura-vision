module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.status(200).json({
    message: 'Final Test Success',
    key: !!process.env.NVIDIA_API_KEY,
  })
}
