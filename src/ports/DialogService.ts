/**
 * Port for imperative dialogs (alert/confirm/prompt). The React DialogProvider
 * is the only production adapter; tests provide a synchronous stub.
 */
export interface DialogService {
  alert(message: string): void
  confirm(message: string): Promise<boolean>
  prompt(title: string, label: string, defaultValue?: string): Promise<string | null>
}
