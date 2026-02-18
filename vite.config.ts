import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => {
  return {
    base: process.env.VITE_BASE_PATH || '/',
    plugins: [react()],
  }
})
