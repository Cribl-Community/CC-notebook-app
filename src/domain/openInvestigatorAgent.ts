/**
 * Shared Cribl AI agent path for notebook one-shot codegen and multi-turn chat.
 * Both clients POST to the same registered `open_investigator` agent.
 */
export const OPEN_INVESTIGATOR_AGENT_PATH = '/ai/q/agents/open_investigator' as const
