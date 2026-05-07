import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'

/**
 * Smoke test for the App root. Ensures every provider wires up without
 * throwing ("useX must be used inside <XProvider>") and that the first
 * render makes it past the "Loading…" shell. We stub network-ish calls
 * (KV manifest + Examples manifest) so the test is deterministic.
 */

vi.mock('@features/library/notebookLibrary', async () => {
  const actual = await vi.importActual<typeof import('@features/library/notebookLibrary')>(
    '@features/library/notebookLibrary',
  )
  return {
    ...actual,
    fetchManifest: vi.fn().mockResolvedValue({ version: 1, items: [] }),
  }
})

vi.mock('@platform/pyodide/PyodideKernelAdapter', () => ({
  pyodideKernelFactory: () => ({
    ready: new Promise<void>(() => {}),
    execute: vi.fn(),
    complete: vi.fn(),
    interrupt: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }),
}))

const originalFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = vi.fn().mockImplementation(async (url: RequestInfo | URL) => {
    const s = typeof url === 'string' ? url : url.toString()
    if (s.endsWith('Examples/manifest.json')) {
      return new Response(JSON.stringify({ version: 1, notebooks: [] }), { status: 200 })
    }
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch
})
afterAll(() => {
  globalThis.fetch = originalFetch
})

import { beforeAll, afterAll } from 'vitest'
import App from '@/App'

describe('App smoke', () => {
  it('renders the shell without crashing', async () => {
    const { container } = render(<App />)
    // Shell is always present; wait for library async load so the tree stabilises.
    await waitFor(() => {
      expect(container.querySelector('.nb-app-frame')).not.toBeNull()
    })
  })
})
