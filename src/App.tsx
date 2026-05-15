import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import {
  AiCodeProvider,
  DialogProvider,
  EnvProvider,
  KernelProvider,
  LookupProvider,
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
              <LookupProvider>
                <KernelProvider>
                  <NotebookPage />
                </KernelProvider>
              </LookupProvider>
            </SearchProvider>
          </DialogProvider>
        </AiCodeProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
