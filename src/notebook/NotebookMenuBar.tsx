const MENU_LABELS = ['File', 'Edit', 'View', 'Run', 'Kernel', 'Tabs', 'Settings', 'Help'] as const

/** JupyterLab-style top menu strip (placeholders until wired to actions). */
export function NotebookMenuBar() {
  return (
    <div className="nb-menubar" role="navigation" aria-label="Application menu">
      {MENU_LABELS.map((label) => (
        <button
          key={label}
          type="button"
          className="nb-menubar-item"
          tabIndex={-1}
          aria-disabled="true"
          title="Not available in this build"
        >
          {label}
        </button>
      ))}
    </div>
  )
}
