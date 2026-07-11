import { registerSW } from 'virtual:pwa-register'

let applyUpdate: ((reloadPage?: boolean) => Promise<void>) | null = null

export function startPwaRegistration() {
  applyUpdate = registerSW({
    onNeedRefresh() {
      window.dispatchEvent(new CustomEvent('kaoyan-pwa-update'))
    },
    onOfflineReady() {
      window.dispatchEvent(new CustomEvent('kaoyan-offline-ready'))
    }
  })
}

export function updatePwa() {
  return applyUpdate?.(true) ?? Promise.resolve()
}
