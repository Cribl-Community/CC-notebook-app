/**
 * Port for AI-driven code generation and error-fix suggestions. The default
 * adapter calls the Cribl Riptide agent; tests substitute a stub.
 */
export interface AiCodeService {
  /** True when the concrete backend is configured (e.g. running inside Cribl). */
  isAvailable(): boolean
  generatePythonFromPrompt(userText: string, options?: { signal?: AbortSignal }): Promise<string>
  suggestErrorFix(
    cellSource: string,
    ename: string,
    evalue: string,
    traceback: string[],
    options?: { signal?: AbortSignal },
  ): Promise<string>
}
