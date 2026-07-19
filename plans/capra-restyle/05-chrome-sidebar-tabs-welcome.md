# Task: Chrome: sidebar, tabs, welcome\n\n## Goal
Capra-align library sidebar, notebook tabs, and welcome page chrome.

## Affected
- `NotebookSidebar.tsx`, `NotebookTabs.tsx`, `WelcomePage.tsx`, `TagMultiFilter.tsx`
- related `index.css` sections

## Work
1. Tags/filters → Capra `Tag` / `Pill` / `Menu` as appropriate.
2. Empty library states → `EmptyState` where it fits.
3. Tabs: Capra-tokenized custom tab bar (avoid forcing URL `TabNav` unless routing changes).
4. Welcome hero/sections: Capra `Text`, `Card` sparingly, `Button` CTAs; keep content structure.

## Acceptance
- [ ] Sidebar CRUD + tag filter usable in light/dark
- [ ] Tab switch/close/dirty indicators still clear
- [ ] Welcome page matches Capra typography/spacing feel
\n