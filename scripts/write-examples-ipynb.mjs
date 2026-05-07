console.error(
  [
    'This generator is deprecated and intentionally no-op.',
    'Edit notebooks directly under public/Examples/*.ipynb instead.',
    'The app now discovers files automatically and writes manifest metadata via vite.examplesManifestPlugin.ts.',
  ].join('\n'),
)
process.exitCode = 1
