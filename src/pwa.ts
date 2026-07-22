import { registerSW } from 'virtual:pwa-register'

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null
let registration: ServiceWorkerRegistration | undefined
let updateReady = false
let lastUpdateCheck = 0
let resumeChecksAttached = false
const updateListeners = new Set<() => void>()
const updateCheckInterval = 60_000

function notifyUpdateReady() {
  updateReady = true
  for (const listener of updateListeners) listener()
  window.dispatchEvent(new CustomEvent('kaoyan-pwa-update'))
}

async function requestUpdateCheck(force = false) {
  if (!registration) return false
  const now = Date.now()
  if (!force && now - lastUpdateCheck < updateCheckInterval) return true
  lastUpdateCheck = now
  try {
    await registration.update()
    return true
  } catch {
    return false
  }
}

function attachResumeChecks() {
  if (resumeChecksAttached) return
  resumeChecksAttached = true
  const checkWhenVisible = () => {
    if (document.visibilityState === 'visible') void requestUpdateCheck()
  }
  document.addEventListener('visibilitychange', checkWhenVisible)
  window.addEventListener('pageshow', checkWhenVisible)
}

export function startPwaRegistration() {
  attachResumeChecks()
  applyUpdate = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, currentRegistration) {
      registration = currentRegistration
      void requestUpdateCheck(true)
    },
    onNeedRefresh() {
      notifyUpdateReady()
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('kaoyan-offline-ready'))
    }
  })
}

export function subscribeToPwaUpdate(listener: () => void) {
  updateListeners.add(listener)
  if (updateReady) queueMicrotask(listener)
  return () => updateListeners.delete(listener)
}

export function updatePwa() {
  updateReady = false
  return applyUpdate?.(true) ?? Promise.resolve()
}

export function checkPwaUpdate() {
  return requestUpdateCheck(true)
}
