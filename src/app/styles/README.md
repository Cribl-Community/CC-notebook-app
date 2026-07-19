# App styles

Capra CSS is loaded in `src/main.tsx` (`@capra/theme/base.css`, icons, core).

**Token DX:** Capra’s preferred `token()` PostCSS/LightningCSS plugins are not wired in Vite yet.
Notebook surfaces use a single adapter bridge (`capra-nb-bridge.css`, introduced when palettes are removed) that maps `--nb-*` onto Capra’s `--cds2-*` variables. Keep raw Capra var names confined to that bridge file.
