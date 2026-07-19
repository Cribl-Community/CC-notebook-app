# App styles

Capra CSS is loaded in `src/main.tsx` (`@capra/theme/base.css`, icons, core).

**Token DX:** Capra’s preferred `token()` PostCSS/LightningCSS plugins are not wired in Vite yet.
Notebook surfaces use `capra-nb-bridge.css`, which maps `--nb-*` onto Capra’s `--cds2-*` variables.
Keep raw Capra var names confined to that bridge file.

Theme mode is Capra light/dark only (`ThemeProvider` toggles `.dark` on `document.documentElement`).
