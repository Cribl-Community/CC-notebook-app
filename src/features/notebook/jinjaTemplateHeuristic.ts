/**
 * Detects Jinja2-like syntax in a string. Used by `%%cribl_search`, Riptide prompts, etc.
 */
export function looksLikeJinjaTemplate(text: string): boolean {
  return text.includes('{{') || text.includes('{%') || text.includes('{#')
}
