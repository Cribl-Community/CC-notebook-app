const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

const CELL_LINE_RE = /File\s+"(?:<string>|<ipython-input-[^>]+>)",\s+line\s+(\d+)/i

export function extractCellLineRefs(traceback: string[]): number[] {
  const seen = new Set<number>()
  for (const line of traceback) {
    const match = stripAnsi(line).match(CELL_LINE_RE)
    if (!match) continue
    const parsed = Number.parseInt(match[1] ?? '', 10)
    if (Number.isFinite(parsed) && parsed > 0) seen.add(parsed)
  }
  return Array.from(seen.values()).sort((a, b) => a - b)
}
