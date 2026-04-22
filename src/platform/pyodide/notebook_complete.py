"""Injected once into the Pyodide worker for Tab completion (namespace-aware)."""

import json
import inspect


def _classify(obj: object) -> str:
    try:
        if inspect.ismodule(obj):
            return "module"
        if inspect.isclass(obj):
            return "class"
        if inspect.isroutine(obj):
            return "function"
    except Exception:
        pass
    return "instance"


def _attribute_complete(code: str, cursor: int) -> list:
    """Complete `expr.` members using live globals (fast path)."""
    if cursor < 0 or cursor > len(code):
        return []
    before = code[:cursor]
    last_nl = before.rfind("\n")
    line = before[last_nl + 1 :]
    j = len(line)
    i = j - 1
    while i >= 0 and (line[i].isalnum() or line[i] == "_"):
        i -= 1
    partial = line[i + 1 : j]
    rest = line[: i + 1]
    if not rest.endswith(".") or len(rest) < 2:
        return []
    expr = rest[:-1].strip()
    if not expr:
        return []
    g = globals()
    try:
        obj = eval(expr, g, g)
    except Exception:
        return []
    out = []
    try:
        names = [n for n in dir(obj) if not n.startswith("_")]
    except Exception:
        return []
    for n in names:
        if partial and not n.startswith(partial):
            continue
        try:
            attr = getattr(obj, n)
        except Exception:
            continue
        kind = _classify(attr)
        out.append({"name": n, "kind": kind})
    out.sort(key=lambda x: x["name"])
    return out


def _jedi_type_to_kind(t: str) -> str:
    if t == "module":
        return "module"
    if t == "function":
        return "function"
    if t == "class":
        return "class"
    return "instance"


def _jedi_complete(code: str, cursor: int) -> list:
    try:
        import jedi
    except ImportError:
        return []
    before = code[:cursor]
    line_n = before.count("\n") + 1
    col = len(before) - before.rfind("\n") - 1
    if col < 0:
        col = 0
    try:
        script = jedi.Script(code, path="<notebook>")
        completions = script.complete(line_n, col)
    except Exception:
        return []
    out = []
    for c in completions:
        name = c.name
        if not name:
            continue
        typ = getattr(c, "type", "") or ""
        kind = _jedi_type_to_kind(str(typ))
        out.append({"name": name, "kind": kind})
    out.sort(key=lambda x: x["name"])
    return out[:80]


def _notebook_complete(code: str, cursor: int) -> list:
    ac = _attribute_complete(code, cursor)
    if ac:
        return ac
    return _jedi_complete(code, cursor)


def _notebook_complete_json(code: str, cursor: int) -> str:
    return json.dumps(_notebook_complete(code, cursor))
