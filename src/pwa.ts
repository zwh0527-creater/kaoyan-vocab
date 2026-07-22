import { registerSW } from 'virtual:pwa-register'

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null
let updateReady = false
const updateListeners = new Set<() => void>()

function notifyUpdateReady() {
  updateReady = true
  for (const listener of updateListeners) listener()
  window.dispatchEvent(new CustomEvent('kaoyan-pwa-update'))
}

export function startPwaRegistration() {
  applyUpdate = registerSW({
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
