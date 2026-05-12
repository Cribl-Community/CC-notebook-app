/**
 * Prints GitHub Release markdown for a semver, from `RELEASE_NOTES` in the welcome feature.
 * Used by CI (Node --experimental-strip-types) and locally.
 *
 * Usage: node --experimental-strip-types scripts/emit-github-release-notes.ts <version>
 *    or: RELEASE_VERSION=x.y.z node --experimental-strip-types scripts/emit-github-release-notes.ts
 */
import { markdownForReleaseVersion } from '../src/features/welcome/releaseGithubMarkdown.ts'

const raw = process.argv[2]?.trim() || process.env.RELEASE_VERSION?.trim()
if (!raw) {
  console.error('Usage: emit-github-release-notes.ts <version>\n   or: RELEASE_VERSION=x.y.z')
  process.exit(1)
}

process.stdout.write(markdownForReleaseVersion(raw))
