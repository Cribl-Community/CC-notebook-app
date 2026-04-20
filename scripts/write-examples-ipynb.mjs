import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const cribl = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    title: 'Cribl Search Example',
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.11' },
  },
  cells: [
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '# Cribl Search (%%cribl_search)\n',
        '\n',
        'This notebook demonstrates the **%%cribl_search** cell magic. Put the magic on the **first line** of a code cell; everything below is **KQL** (Cribl Search query language).\n',
        '\n',
        'After the job finishes, rows are loaded into a **pandas** DataFrame in the kernel (default name `results_df`, or `var=`).\n',
      ].join(''),
    },
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '## Parameters (first line)\n',
        '\n',
        '- **`var=name`** — Python variable for the DataFrame (default `results_df`).\n',
        '- **`preview=true|false`** — Show the interactive result table in the cell output (default `true`).\n',
        '- **`limit=N`** — Max rows to load into the DataFrame (`0` = all rows returned).\n',
        '- **`earliest=` / `latest=`** — Time window passed to the Search API (defaults apply if omitted).\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        '%%cribl_search var=results_df preview=true limit=0\n',
        'dataset-cribl_search_sample | sort by _time desc | limit 1000\n',
      ].join(''),
    },
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '## Follow-up on `results_df`\n',
        '\n',
        'Run the cells below after the search cell succeeds. Adjust plots to match your schema.\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'import pandas as pd\n',
        '\n',
        'results_df.head(10)\n',
        'results_df.describe(include="all")\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'import matplotlib.pyplot as plt\n',
        '\n',
        '# Pick a numeric column if present\n',
        'if len(results_df) > 0:\n',
        '    num = results_df.select_dtypes(include=["number"]).columns\n',
        '    if len(num) > 0:\n',
        '        c = num[0]\n',
        '        results_df[c].head(200).plot(kind="line", title=f"Sample: {c}")\n',
        '        plt.tight_layout()\n',
        '        plt.show()\n',
        '    else:\n',
        '        print("No numeric columns — columns:", list(results_df.columns))\n',
        'else:\n',
        '    print("Empty DataFrame")\n',
      ].join(''),
    },
  ],
}

const mpl = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {
    title: 'Matplotlib Examples',
    kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
    language_info: { name: 'python', version: '3.11' },
  },
  cells: [
    {
      cell_type: 'markdown',
      metadata: {},
      source: [
        '# Matplotlib from JSON and pandas\n',
        '\n',
        '**Matplotlib** is preloaded with Pyodide. Use pyplot and `plt.show()` to render figures in the output area.\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'import io\n',
        'import pandas as pd\n',
        'import matplotlib.pyplot as plt\n',
        '\n',
        'raw = """[\n',
        '  {"region": "us-west", "events": 120, "latency_ms": 42},\n',
        '  {"region": "us-east", "events": 95, "latency_ms": 55},\n',
        '  {"region": "eu", "events": 210, "latency_ms": 38}\n',
        ']"""\n',
        '\n',
        'df_json = pd.read_json(io.StringIO(raw))\n',
        'df_json\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'fig, ax = plt.subplots(figsize=(6, 3))\n',
        'ax.bar(df_json["region"], df_json["events"], color="#2196f3")\n',
        'ax.set_title("Events by region (from JSON)")\n',
        'plt.tight_layout()\n',
        'plt.show()\n',
      ].join(''),
    },
    {
      cell_type: 'code',
      metadata: {},
      execution_count: null,
      outputs: [],
      source: [
        'import numpy as np\n',
        '\n',
        'df = pd.DataFrame({\n',
        '    "day": pd.date_range("2026-01-01", periods=14, freq="D"),\n',
        '    "value": np.random.default_rng(7).integers(10, 100, size=14),\n',
        '})\n',
        '\n',
        'fig, ax = plt.subplots(figsize=(7, 3))\n',
        'ax.plot(df["day"], df["value"], marker="o")\n',
        'ax.set_title("Synthetic series from DataFrame")\n',
        'plt.xticks(rotation=35, ha="right")\n',
        'plt.tight_layout()\n',
        'plt.show()\n',
      ].join(''),
    },
  ],
}

const outDir = join(root, 'public', 'Examples')
await mkdir(outDir, { recursive: true })
await writeFile(join(outDir, 'Cribl_Search_Example.ipynb'), JSON.stringify(cribl, null, 1) + '\n')
await writeFile(join(outDir, 'Matplotlib_Examples.ipynb'), JSON.stringify(mpl, null, 1) + '\n')
console.log('Wrote Examples notebooks')
