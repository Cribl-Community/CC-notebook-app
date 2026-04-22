import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from '@features/welcome/releaseNotes'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('RELEASE_NOTES', () => {
  it('keeps latest release note version aligned with package.json', () => {
    const pkgText = readFileSync(join(repoRoot, 'package.json'), 'utf8')
    const pkg = JSON.parse(pkgText) as { version?: unknown }
    const packageVersion = typeof pkg.version === 'string' ? pkg.version.trim() : ''

    expect(RELEASE_NOTES.length).toBeGreaterThan(0)
    expect(packageVersion.length).toBeGreaterThan(0)
    expect(RELEASE_NOTES[0]?.version).toBe(packageVersion)
  })
})
