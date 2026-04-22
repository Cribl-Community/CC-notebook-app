import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import { AiCodeProvider, DialogProvider, EnvProvider, ThemeProvider } from '@app/providers'

export default function App() {
  return (
    <EnvProvider>
      <ThemeProvider>
        <AiCodeProvider>
          <DialogProvider>
            <NotebookPage />
          </DialogProvider>
        </AiCodeProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
