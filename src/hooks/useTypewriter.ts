import { useEffect, useRef, useState } from 'react'

export function useTypewriter(text: string, speed = 20) {
  const [rendered, setRendered] = useState('')
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (timer.current) {
      window.clearInterval(timer.current)
      timer.current = null
    }
    setRendered('')
    let i = 0
    timer.current = window.setInterval(() => {
      i++
      setRendered(text.slice(0, i))
      if (i >= text.length && timer.current) {
        window.clearInterval(timer.current)
        timer.current = null
      }
    }, Math.max(5, speed))
    return () => {
      if (timer.current) {
        window.clearInterval(timer.current)
        timer.current = null
      }
    }
  }, [text, speed])

  return rendered
}
