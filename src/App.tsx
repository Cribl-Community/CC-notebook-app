import { NotebookPage } from '@features/notebook/ui/NotebookPage'
import {
  AiChatProvider,
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
          <AiChatProvider>
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
          </AiChatProvider>
        </AiCodeProvider>
      </ThemeProvider>
    </EnvProvider>
  )
}
