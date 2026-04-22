import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import { DialogProvider, EnvProvider, ThemeProvider } from '@app/providers'

export default function App() {
  return (
    <EnvProvider>
      <ThemeProvider>
        <DialogProvider>
          <NotebookPage />
        </DialogProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
