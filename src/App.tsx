import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import {
  AiCodeProvider,
  DialogProvider,
  EnvProvider,
  KernelProvider,
  SearchProvider,
  ThemeProvider,
} from '@app/providers'

export default function App() {
  return (
    <EnvProvider>
      <ThemeProvider>
        <AiCodeProvider>
          <DialogProvider>
            <SearchProvider>
              <KernelProvider>
                <NotebookPage />
              </KernelProvider>
            </SearchProvider>
          </DialogProvider>
        </AiCodeProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
