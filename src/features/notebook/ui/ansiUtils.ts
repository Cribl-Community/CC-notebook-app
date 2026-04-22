const ESC = String.fromCharCode(27)
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;?]*[ -/]*[@-~]`, 'g')

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '')
}

/** `compile(..., "<cell>", "exec")` and similar use angle-bracket “filenames”. */
const FILE_LINE_RE = /File\s+"([^"]+)",\s+line\s+(\d+)/i

/** IPython 8+ style: `Input In [3], line 5` */
const INPUT_IN_LINE_RE = /Input\s+In\s+\[\d+\],\s+line\s+(\d+)/i

/** Alternate friendly form seen in some front-ends. */
const CELL_IN_LINE_RE = /Cell\s+In\s*\[\d+\],\s*line\s+(\d+)/i

function isNotebookCellPseudoFile(name: string): boolean {
  const f = name.trim()
  if (
    f === '<string>' ||
    f === '<cell>' ||
    f === '<exec>' ||
    f === '<stdin>' ||
    f === '<unknown>' ||
    f === '<console>'
  ) {
    return true
  }
  return /^<ipython-input-[^>]+>$/i.test(f)
}

/**
 * Line numbers for frames that map to the notebook cell source.
 *
 * Tracebacks list **outer** frames first and the **innermost** (where the
 * exception was raised) last. We only keep the **last** matching notebook
 * frame so outer wrappers (often still `File "<cell>", line 1`) do not
 * incorrectly highlight line 1 when the fault is deeper in the cell.
 */
export function extractCellLineRefs(traceback: string[]): number[] {
  let lastRef: number | null = null
  for (const raw of traceback) {
    const line = stripAnsi(raw)
    let parsed: number | null = null

    const mInput = line.match(INPUT_IN_LINE_RE)
    if (mInput) {
      const n = Number.parseInt(mInput[1] ?? '', 10)
      if (Number.isFinite(n) && n > 0) parsed = n
    }
    if (parsed === null) {
      const mCellIn = line.match(CELL_IN_LINE_RE)
      if (mCellIn) {
        const n = Number.parseInt(mCellIn[1] ?? '', 10)
        if (Number.isFinite(n) && n > 0) parsed = n
      }
    }
    if (parsed === null) {
      const mFile = line.match(FILE_LINE_RE)
      if (mFile) {
        const file = mFile[1] ?? ''
        const n = Number.parseInt(mFile[2] ?? '', 10)
        if (Number.isFinite(n) && n > 0 && isNotebookCellPseudoFile(file)) parsed = n
      }
    }
    if (parsed !== null) lastRef = parsed
  }
  return lastRef !== null ? [lastRef] : []
}
