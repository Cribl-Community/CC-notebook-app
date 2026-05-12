import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { RELEASE_NOTES } from '@features/welcome/releaseNotes'
import { markdownForReleaseVersion } from '@features/welcome/releaseGithubMarkdown'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('markdownForReleaseVersion', () => {
  it('formats the current package version using the matching release entry', () => {
    const pkgText = readFileSync(join(repoRoot, 'package.json'), 'utf8')
    const pkg = JSON.parse(pkgText) as { version?: unknown }
    const version = typeof pkg.version === 'string' ? pkg.version.trim() : ''
    expect(version.length).toBeGreaterThan(0)

    const md = markdownForReleaseVersion(version)
    expect(md).toContain(`## ${version}`)
    const latest = RELEASE_NOTES[0]
    expect(latest?.version).toBe(version)
    for (const h of latest?.highlights ?? []) {
      expect(md).toContain(h)
    }
  })

  it('throws when the version is missing from RELEASE_NOTES', () => {
    expect(() => markdownForReleaseVersion('0.0.0-nonexistent')).toThrow(/No RELEASE_NOTES entry/)
  })
})
