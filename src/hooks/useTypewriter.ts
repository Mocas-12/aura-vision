import { useEffect, useRef, useState } from 'react'

export function useTypewriter(text: string, speed = 20): [string, boolean] {
  const [rendered, setRendered] = useState('')
  const [running, setRunning] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    setRendered('')
    setRunning(Boolean(text))
    const chars = Array.from(text || '')
    let i = 0
    timer.current = window.setInterval(() => {
      i++
      setRendered(chars.slice(0, i).join(''))
      if (i >= chars.length && timer.current) {
        window.clearInterval(timer.current)
        timer.current = null
        setRunning(false)
      }
    }, Math.max(5, speed))
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current)
        timer.current = null
      }
      setRunning(false)
    }
  }, [text, speed])

  return [rendered, running]
}
