/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('PWA update configuration', () => {
  it('keeps prompt activation compatible with the visible update button', () => {
    const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8')

    expect(config).toContain("registerType: 'prompt'")
    expect(config).not.toMatch(/skipWaiting\s*:\s*true/)
  })

  it('checks immediately and again when the iOS app returns to the foreground', () => {
    const client = readFileSync(new URL('./pwa.ts', import.meta.url), 'utf8')

    expect(client).toContain('immediate: true')
    expect(client).toContain('onRegisteredSW')
    expect(client).toContain("visibilitychange")
    expect(client).toContain("pageshow")
  })
})
