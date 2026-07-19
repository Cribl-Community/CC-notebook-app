import type { CriblAgentToolDef } from '@ports/AiAgentChatService'

/** System preamble describing notebook cell formats for open_investigator. */
export const AI_CHAT_SYSTEM_PREAMBLE = `You are an assistant that builds Cribl notebook-app notebooks by calling tools.
Prefer tools over dumping code in chat. Create cells in a sensible order (intro markdown, then search/api, then Python analysis).
Insert each new cell after the currently selected cell in the open notebook (cells appear as you call tools).

Magic cell formats (code cells):
- Search: first line \`%%cribl_search var=df lang=kql dataset=cribl_search_sample earliest=-1h latest=now\` then KQL body (e.g. \`dataset=cribl_search_sample | limit 100\`).
- English→KQL: \`%%cribl_search lang=english dataset=cribl_search_sample\` then natural language.
- REST API: first line \`%%cribl_api GET /system/info var=info\` then optional YAML (\`headers:\` / \`json:\` / \`body:\`).
- Lookup save: \`%%cribl_save_search_lookup my_table.csv var=df\` (no body).
- Lookup load: \`%%cribl_load_search_lookup my_table.csv var=df\` (no body).
- Lookup delete: \`%%cribl_delete_search_lookup my_table.csv\` (no body).

Plain Python cells have no magic header. Markdown cells are for explanations.`

export const NOTEBOOK_CELL_TOOLS: CriblAgentToolDef[] = [
  {
    id: 'set_notebook_title',
    description: 'Set the title of the open notebook (creates a notebook if none is open).',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Notebook title' },
      },
      required: ['title'],
    },
  },
  {
    id: 'create_markdown_cell',
    description: 'Insert a markdown cell after the selected cell in the open notebook.',
    schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Markdown source' },
      },
      required: ['source'],
    },
  },
  {
    id: 'create_python_cell',
    description: 'Insert a plain Python code cell after the selected cell (no cell magics).',
    schema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Python source code' },
      },
      required: ['source'],
    },
  },
  {
    id: 'create_search_cell',
    description:
      'Insert a %%cribl_search magic code cell after the selected cell. Provide headerParams (space-separated key=value after %%cribl_search) and the query body.',
    schema: {
      type: 'object',
      properties: {
        headerParams: {
          type: 'string',
          description: 'Optional params after %%cribl_search, e.g. "var=df lang=kql dataset=cribl_search_sample"',
        },
        query: { type: 'string', description: 'KQL or English query body' },
      },
      required: ['query'],
    },
  },
  {
    id: 'create_api_cell',
    description: 'Insert a %%cribl_api magic code cell after the selected cell.',
    schema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'HTTP method, e.g. GET' },
        path: { type: 'string', description: 'API path starting with /' },
        headerParams: {
          type: 'string',
          description: 'Optional key=value params after METHOD path, e.g. "var=info preview=true"',
        },
        yamlBody: {
          type: 'string',
          description: 'Optional YAML body (headers/json/body mappings)',
        },
      },
      required: ['method', 'path'],
    },
  },
  {
    id: 'create_lookup_cell',
    description: 'Insert a Cribl Search lookup magic cell (save, load, or delete) after the selected cell.',
    schema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['save', 'load', 'delete'],
          description: 'Which lookup magic to emit',
        },
        lookupFilename: {
          type: 'string',
          description: 'Lookup file name, e.g. my_table.csv',
        },
        headerParams: {
          type: 'string',
          description: 'Optional params after the filename, e.g. "var=df replace=true"',
        },
      },
      required: ['operation', 'lookupFilename'],
    },
  },
]
