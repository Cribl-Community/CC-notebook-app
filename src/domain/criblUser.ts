/**
 * Current user shape injected at runtime by the Cribl App Platform
 * (`window.getCriblUser()`).
 */
export interface CriblUser {
  id: string
  username: string
  email?: string
  firstName?: string
  lastName?: string
  initials?: string
}
