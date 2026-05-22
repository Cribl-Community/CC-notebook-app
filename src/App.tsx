import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import {
  AiCodeProvider,
  DialogProvider,
  EnvProvider,
  KernelProvider,
  LookupProvider,
  NotebookRepoProvider,
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
                <NotebookRepoProvider>
                  <KernelProvider>
                    <NotebookPage />
                  </KernelProvider>
                </NotebookRepoProvider>
              </LookupProvider>
            </SearchProvider>
          </DialogProvider>
        </AiCodeProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
