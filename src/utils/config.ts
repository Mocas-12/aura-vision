// Single source of truth for external endpoints (overridable at build time).
const workerBase = (import.meta.env.VITE_WORKER_BASE as string | undefined)?.replace(/\/+$/, '')
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '')

export const WORKER_BASE = workerBase || 'https://square-bread-b238.a18577y.workers.dev'

// Vercel deployment base (e.g. https://aura-vision.vercel.app) hosting /api/*.
// Empty on GitHub Pages builds unless configured — server-side activation is
// then unavailable and the client falls back per quota.ts.
export const API_BASE = apiBase || ''
