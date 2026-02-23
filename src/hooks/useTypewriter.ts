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
    let i = 0
    timer.current = window.setInterval(() => {
      i++
      setRendered(text.slice(0, i))
      if (i >= text.length && timer.current) {
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
