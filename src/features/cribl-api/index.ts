/**
 * Public surface for %%cribl_api magic helpers.
 * Prefer `@features/cribl-api` over deep imports from other slices.
 */
export {
  parseCriblApiMagic,
  wantsCriblApiJinjaTemplating,
  type CriblApiMagicOk,
  type CriblApiMagicParse,
} from './criblApiMagic'
