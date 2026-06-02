/// <reference types="vite/client" />

declare module '*.py?raw' {
  const src: string
  export default src
}

declare module '*.yml?raw' {
  const src: string
  export default src
}

declare global {
  interface Window {
    /** Cribl App Platform: base URL for API calls (e.g. https://host/api/v1). */
    CRIBL_API_URL?: string
    /** Cribl App Platform: app mount path for React Router basename. */
    CRIBL_BASE_PATH?: string
    /** Injected in dev by Vite for smoke tests. */
    CRIBL_APP_ID?: string
  }
}

export {}
