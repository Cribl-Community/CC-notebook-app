import { RELEASE_NOTES } from './releaseNotes.ts'

/**
 * Markdown body for a GitHub Release, sourced from the same `RELEASE_NOTES`
 * array as the in-app welcome screen.
 */
export function markdownForReleaseVersion(version: string): string {
  const entry = RELEASE_NOTES.find((e) => e.version === version)
  if (!entry) {
    throw new Error(
      `No RELEASE_NOTES entry for version "${version}". Add a block in releaseNotes.ts (newest first) before tagging.`,
    )
  }
  const lines = [`## ${version}`, '', `**Date:** ${entry.date}`, '', ...entry.highlights.map((h) => `- ${h}`), '']
  return lines.join('\n')
}
