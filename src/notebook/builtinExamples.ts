/**
 * Bundled example notebooks shipped under `public/examples/`. Listed here
 * (rather than discovered at runtime) because static builds cannot enumerate
 * directory contents from the browser.
 */
export const BUILTIN_EXAMPLES: { filename: string; label: string; description: string }[] = [
  {
    filename: 'iopub-rich-outputs.ipynb',
    label: 'IOPub rich outputs',
    description:
      'display(), HTML/Markdown/JSON, matplotlib, errors, clear_output, update_display_data',
  },
  {
    filename: 'ipywidgets-demo.ipynb',
    label: 'ipywidgets demo',
    description: 'IntSlider, Button, Text, IntProgress (static fallback rendering)',
  },
  {
    filename: 'itables-demo.ipynb',
    label: 'itables demo',
    description: 'Interactive DataTables.net rendering of a pandas DataFrame',
  },
]
