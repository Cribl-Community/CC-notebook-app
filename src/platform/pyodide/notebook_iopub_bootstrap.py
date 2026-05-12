"""IOPub-style bridge for the notebook kernel.

Installed once at worker init. Exposes:

* ``display(*objs, ...)`` — a JupyterLab-like ``display`` function that emits
  ``display_data`` IOPub messages with full mime bundles.
* ``clear_output(wait=False)`` — emits a ``clear_output`` IOPub message.
* ``async def _nb_run(code: str, exec_count: int)`` — runs ``code`` while routing the
  trailing expression result through ``sys.displayhook`` so we emit a proper
  ``execute_result`` (with mime bundle) instead of a stringified value.

Call site (JS) installs ``_NB_IOPUB`` on the Python globals — a one-arg
callable that receives a plain ``dict`` IOPub message.

Hooks ``IPython.display.display`` if IPython is importable so ``ipywidgets``
and other IPython-based libraries forward through the same channel.
"""

from __future__ import annotations

import ast
import shlex

# IPython + `stack-data` (ultratb) are installed in the worker before this module runs.
import IPython  # noqa: F401 — top-level so Pyodide loadPackagesFromImports stays aligned if preload changes.
import base64
import json
import sys
import traceback as _tb_mod
from typing import Any


_DEFAULT_INCLUDE = (
    "application/vnd.jupyter.widget-view+json",
    "application/vnd.jupyter.widget-state+json",
    "application/vnd.cribl.notebook.cribl-search+json",
    "application/vnd.plotly.v1+json",
    "application/vnd.vegalite.v5+json",
    "application/vnd.vegalite.v6+json",
    "application/vnd.vegalite.v6.json",
    "application/vnd.vega.v5+json",
    "application/vnd.vega.v6+json",
    "application/vnd.vega.v6.json",
    "application/json",
    "text/html",
    "image/svg+xml",
    "image/png",
    "image/jpeg",
    "text/markdown",
    "text/latex",
    "text/plain",
)


def _emit(msg: dict) -> None:
    """Send a single IOPub message to the host through the JS shim."""
    pub = globals().get("_NB_IOPUB")
    if pub is None:
        return
    try:
        pub(msg)
    except Exception:
        # Never let the IOPub bridge raise into user code.
        pass


def _normalize_mime_value(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, bytes):
        return base64.b64encode(v).decode("ascii")
    if isinstance(v, str):
        return v
    if isinstance(v, (dict, list)):
        try:
            return json.dumps(v, default=str)
        except Exception:
            return None
    try:
        return str(v)
    except Exception:
        return None


def _ensure_altair_mimetype_renderer() -> None:
    """Prefer Altair's MIME renderers over HTML (script stripped) or JupyterChart widgets.

    The default renderer emits ``text/html`` with embedded ``<script>`` tags.
    Our output sanitizer strips scripts, so those charts would render as blank.

    Altair wheels may name the same MIME path ``jupyterlab``, ``mimetype``, or
    ``nteract`` depending on version — try them in order.

    Additionally, ``TopLevelMixin.show()`` (the method called by ``chart.show()``)
    is patched to route through ``display()`` so that explicit ``.show()`` calls
    emit the correct vega-lite MIME bundle rather than silently doing nothing
    (``altair_viewer`` is not available in Pyodide).
    """
    try:
        alt = sys.modules.get("altair")
        if alt is None:
            return
        for name in ("jupyterlab", "mimetype", "nteract"):
            try:
                alt.renderers.enable(name)
                break
            except Exception:
                continue

        # Patch TopLevelMixin.show() so chart.show() emits the MIME bundle.
        TopLevelMixin = getattr(alt, "TopLevelMixin", None)
        if TopLevelMixin is not None and not getattr(TopLevelMixin, "_nb_show_patched", False):
            def _nb_alt_show(self, *_args: Any, **_kwargs: Any) -> None:  # noqa: ANN001
                display(self)

            TopLevelMixin.show = _nb_alt_show  # type: ignore[method-assign]
            TopLevelMixin._nb_show_patched = True  # type: ignore[attr-defined]
    except Exception:
        pass


def _configure_plotly_renderer() -> None:
    """Patch Plotly's BaseFigure so that both IPython display and fig.show() work.

    Plotly's default ``_ipython_display_`` calls ``pio.show()`` which requires
    ``nbformat>=4.2.0``.  That package is not installed in Pyodide, so IPython's
    ``IPythonDisplayFormatter`` catches the resulting ``ValueError``, prints a
    multi-line traceback to stderr, and returns ``None`` — which lets the
    ``MimeBundleFormatter`` fall through and produce the correct
    ``application/vnd.plotly.v1+json`` data (so the chart still renders).

    Replacing ``_ipython_display_`` with a method that raises ``NotImplementedError``
    instead causes ``IPythonDisplayFormatter`` to silently return ``None`` (it special-
    cases ``NotImplementedError`` as "this object has no IPython display") without
    printing any traceback, while keeping the ``_repr_mimebundle_`` path intact.

    Additionally, ``BaseFigure.show()`` is patched to route through ``display()``
    so that ``fig.show()`` in user code emits the correct MIME bundle rather than
    raising ``ValueError: Mime type rendering requires nbformat>=4.2.0``.
    """
    try:
        basedatatypes = sys.modules.get("plotly.basedatatypes")
        if basedatatypes is None:
            return
        BaseFigure = getattr(basedatatypes, "BaseFigure", None)
        if BaseFigure is None or getattr(BaseFigure, "_nb_ipython_display_patched", False):
            return

        def _nb_ipython_display_(self) -> None:  # noqa: ANN001
            raise NotImplementedError

        def _nb_show(self, *_args: Any, **_kwargs: Any) -> None:  # noqa: ANN001
            display(self)

        BaseFigure._ipython_display_ = _nb_ipython_display_  # type: ignore[method-assign]
        BaseFigure.show = _nb_show  # type: ignore[method-assign]
        BaseFigure._nb_ipython_display_patched = True  # type: ignore[attr-defined]
    except Exception:
        pass


def _format_object(obj: Any) -> tuple[dict, dict]:
    """Return ``(data, metadata)`` for an object. Prefers IPython's formatter."""
    _ensure_altair_mimetype_renderer()
    _configure_plotly_renderer()
    try:
        formatter = _get_display_formatter()
        data, metadata = formatter.format(obj, include=_DEFAULT_INCLUDE)
    except Exception:
        data, metadata = _builtin_format_object(obj), {}

    out_data: dict = {}
    for mime, value in (data or {}).items():
        normalized = _normalize_mime_value(value)
        if normalized is not None:
            out_data[mime] = normalized
    if "text/plain" not in out_data:
        try:
            out_data["text/plain"] = repr(obj)
        except Exception:
            out_data["text/plain"] = "<unrepresentable>"
    return out_data, dict(metadata or {})


def _get_display_formatter():
    """Return the active IPython DisplayFormatter (shell-bound if possible).

    Using the InteractiveShell's formatter matters because side-effecting
    backend modules (e.g. ``matplotlib_inline.backend_inline``) register
    figure formatters on it via ``select_figure_formats``. A standalone
    ``DisplayFormatter()`` instance would miss those registrations and we'd
    fall back to ``text/plain`` for matplotlib figures.
    """
    cached = getattr(_get_display_formatter, "_cached", None)
    if cached is not None:
        return cached
    from IPython.core.formatters import DisplayFormatter  # type: ignore

    try:
        from IPython.core.interactiveshell import InteractiveShell  # type: ignore

        shell = InteractiveShell.instance()
        formatter = getattr(shell, "display_formatter", None)
        if formatter is None:
            formatter = DisplayFormatter()
            shell.display_formatter = formatter
    except Exception:
        formatter = DisplayFormatter()
    _get_display_formatter._cached = formatter  # type: ignore[attr-defined]
    return formatter


def _builtin_format_object(obj: Any) -> dict:
    """Fallback when IPython is not importable.

    Inspects ``_repr_*_`` methods directly in priority order.
    """
    bundle: dict = {}
    repr_mimebundle = getattr(obj, "_repr_mimebundle_", None)
    if callable(repr_mimebundle):
        try:
            res = repr_mimebundle(include=_DEFAULT_INCLUDE)
            if isinstance(res, tuple):
                res = res[0]
            if isinstance(res, dict):
                for k, v in res.items():
                    nv = _normalize_mime_value(v)
                    if nv is not None:
                        bundle[k] = nv
        except Exception:
            pass
    for attr, mime in (
        ("_repr_html_", "text/html"),
        ("_repr_svg_", "image/svg+xml"),
        ("_repr_png_", "image/png"),
        ("_repr_jpeg_", "image/jpeg"),
        ("_repr_latex_", "text/latex"),
        ("_repr_json_", "application/json"),
        ("_repr_markdown_", "text/markdown"),
    ):
        if mime in bundle:
            continue
        m = getattr(obj, attr, None)
        if callable(m):
            try:
                v = m()
                nv = _normalize_mime_value(v)
                if nv is not None:
                    bundle[mime] = nv
            except Exception:
                pass
    return bundle


def display(
    *objs: Any,
    include: tuple[str, ...] | list[str] | None = None,  # noqa: ARG001
    exclude: tuple[str, ...] | list[str] | None = None,  # noqa: ARG001
    metadata: dict | None = None,
    transient: dict | None = None,
    display_id: Any = None,
    raw: bool = False,
    clear: bool = False,
    update: bool = False,
    **_kw: Any,
) -> None:
    """Emit a ``display_data`` (or ``update_display_data``) IOPub message."""
    if clear:
        clear_output(wait=True)

    if display_id is True:
        # IPython convention: True asks for a fresh id; we mint one ourselves.
        import uuid

        display_id = uuid.uuid4().hex

    extra_metadata = dict(metadata or {})
    transient_dict = dict(transient or {})
    if display_id and "display_id" not in transient_dict:
        transient_dict["display_id"] = str(display_id)

    msg_type = "update_display_data" if update else "display_data"

    for obj in objs:
        if raw and isinstance(obj, dict):
            data: dict = {}
            for mime, value in obj.items():
                nv = _normalize_mime_value(value)
                if nv is not None:
                    data[mime] = nv
            obj_metadata = extra_metadata
        else:
            data, obj_metadata = _format_object(obj)
            if extra_metadata:
                obj_metadata = {**obj_metadata, **extra_metadata}

        msg = {
            "msg_type": msg_type,
            "data": data,
            "metadata": obj_metadata,
        }
        if transient_dict:
            msg["transient"] = dict(transient_dict)
        _emit(msg)


def clear_output(wait: bool = False) -> None:
    """Emit a ``clear_output`` IOPub message."""
    _emit({"msg_type": "clear_output", "wait": bool(wait)})


def _displayhook_factory(execution_count: int):
    def _hook(value: Any) -> None:
        if value is None:
            return
        try:
            __builtins__["_"] = value  # type: ignore[index]
        except Exception:
            pass
        data, metadata = _format_object(value)
        _emit(
            {
                "msg_type": "execute_result",
                "execution_count": execution_count,
                "data": data,
                "metadata": metadata,
            }
        )

    return _hook


def _install_ipython_publisher() -> None:
    """Route ``IPython.display.display`` through our IOPub bridge."""
    try:
        from IPython.core.displaypub import DisplayPublisher  # type: ignore
    except Exception:
        return

    class _NotebookDisplayPublisher(DisplayPublisher):  # type: ignore[misc]
        def publish(
            self,
            data,
            metadata=None,
            source=None,  # noqa: ARG002
            *,
            transient=None,
            update=False,
            **_kw,
        ):
            payload = {}
            for mime, value in (data or {}).items():
                nv = _normalize_mime_value(value)
                if nv is not None:
                    payload[mime] = nv
            msg = {
                "msg_type": "update_display_data" if update else "display_data",
                "data": payload,
                "metadata": dict(metadata or {}),
            }
            if transient:
                msg["transient"] = dict(transient)
            _emit(msg)

        def clear_output(self, wait=False):
            _emit({"msg_type": "clear_output", "wait": bool(wait)})

    try:
        from IPython.core.interactiveshell import InteractiveShell  # type: ignore

        shell = InteractiveShell.instance()
        shell.display_pub = _NotebookDisplayPublisher()
    except Exception:
        # No active shell — fall back to monkey-patching IPython.display.display.
        try:
            import IPython.display as _ipd  # type: ignore

            _ipd.display = display  # type: ignore[assignment]
        except Exception:
            pass


def _configure_matplotlib_default_backend() -> None:
    """Force matplotlib to a Pyodide-compatible backend before the first plot.

    Pyodide ships matplotlib with the ``matplotlib_pyodide`` backend bridge,
    but matplotlib's own backend selection still defaults to whatever it
    finds first — frequently ``webagg``, which then fails with
    ``ImportError: cannot import name 'document' from 'js'``. Setting
    ``MPLBACKEND`` early (before any ``import matplotlib`` from user code)
    ensures the right backend is picked. We also call ``matplotlib.use(...)``
    defensively if matplotlib is already imported.
    """
    import os

    if os.environ.get("MPLBACKEND"):
        return
    backend = "module://matplotlib_inline.backend_inline"
    os.environ["MPLBACKEND"] = backend
    try:
        mpl = sys.modules.get("matplotlib")
        if mpl is not None:
            try:
                mpl.use(backend, force=True)
            except Exception:
                pass
    except Exception:
        pass


_configure_matplotlib_default_backend()
_install_ipython_publisher()


def _nb_preprocess_pip_shell_lines(code: str) -> str:
    """Rewrite Jupyter-style ``%pip`` / ``!pip`` line magics to ``await micropip.install(...)``.

    Only physical lines are considered (like IPython). ``%%`` cell magics are left
    untouched. Supports ``pip install`` with optional ``-q`` / ``--quiet``,
    ``--no-deps``, ``-y`` / ``--yes`` (ignored except ``--no-deps``).
    """
    lines = code.split("\n")
    out: list[str] = []
    for line in lines:
        stripped = line.lstrip()
        ws = line[: len(line) - len(stripped)]
        if stripped.startswith("%%"):
            out.append(line)
            continue
        rest: str | None = None
        if stripped.startswith("%pip") and (len(stripped) == 4 or stripped[4] in " \t"):
            rest = stripped[4:].lstrip()
        elif stripped.startswith("!pip") and (len(stripped) == 4 or stripped[4] in " \t"):
            rest = stripped[4:].lstrip()
        if rest is None:
            out.append(line)
            continue
        try:
            parts = shlex.split(rest)
        except ValueError as exc:
            out.append(f"{ws}raise SyntaxError({str(exc)!r}) from None")
            continue
        if not parts:
            out.append(f'{ws}raise SyntaxError("empty %pip / !pip command")')
            continue
        if parts[0] != "install":
            out.append(
                f"{ws}import sys\n"
                f"{ws}print({repr('Only `pip install` is supported in this kernel (got ' + parts[0] + ').')}, file=sys.stderr)"
            )
            continue
        reqs: list[str] = []
        deps = True
        i = 1
        unknown_flag = False
        while i < len(parts):
            p = parts[i]
            if p in ("-q", "--quiet"):
                i += 1
                continue
            if p == "--no-deps":
                deps = False
                i += 1
                continue
            if p in ("-y", "--yes"):
                i += 1
                continue
            if p.startswith("-"):
                unknown_flag = True
                i += 1
                continue
            reqs.append(p)
            i += 1
        if unknown_flag:
            out.append(
                f"{ws}import sys\n"
                f"{ws}print('[kernel] Some pip flags were ignored; only install flags matching Jupyter/micropip are supported.', file=sys.stderr)"
            )
        if not reqs:
            out.append(f'{ws}raise SyntaxError("pip install requires at least one requirement")')
            continue
        rs = ", ".join(repr(r) for r in reqs)
        out.append(f"{ws}await __import__('micropip').install([{rs}], deps={deps!r})")
    return "\n".join(out)


def _install_nb_auto_micropip_import_hook() -> None:
    """On ``ModuleNotFoundError``, try ``micropip.install(top-level)`` once, then retry import.

    Uses :func:`pyodide.ffi.run_sync` so asynchronous ``micropip.install`` can run from
    synchronous import. No-op outside Pyodide or when ``run_sync`` is unavailable.
    """
    if getattr(_install_nb_auto_micropip_import_hook, "_done", False):
        return
    try:
        from pyodide.ffi import run_sync  # type: ignore[import-not-found]
    except Exception:
        _install_nb_auto_micropip_import_hook._done = True  # type: ignore[attr-defined]
        return

    import builtins

    _orig = builtins.__import__
    _attempted: set[str] = set()
    _busy = False
    stdlib = frozenset(sys.stdlib_module_names)
    # ``scikits`` is a legacy namespace, not a PyPI distribution — micropip cannot install it.
    skip = frozenset({"micropip", "js", "pyodide", "pyodide_js", "scikits"})

    def _wrapped(name: str, globals=None, locals=None, fromlist=(), level=0):  # noqa: ANN001
        nonlocal _busy
        try:
            return _orig(name, globals, locals, fromlist, level)
        except ModuleNotFoundError as first_missing:
            if level != 0 or _busy:
                raise
            base = name.partition(".")[0]
            if not base or base in stdlib or base in skip or base in _attempted:
                raise
            _busy = True
            try:
                import micropip  # type: ignore[import-untyped]

                run_sync(micropip.install(base))
            except BaseException:
                # Surfaces as ValueError/network errors from micropip; optional-import ``try: import …``
                # chains (e.g. plotly → xarray) expect ImportError/ModuleNotFoundError only.
                raise first_missing from None
            finally:
                _busy = False
            _attempted.add(base)
            return _orig(name, globals, locals, fromlist, level)

    builtins.__import__ = _wrapped
    _install_nb_auto_micropip_import_hook._done = True  # type: ignore[attr-defined]


def _suppress_micropip_pypi_simple_api_minor_warnings() -> None:
    """Silence ``APIVersionWarning: Unsupported API minor version`` from micropip / mousebender.

    PyPI's Simple HTML responses can advertise a newer API minor than the vendored
    ``mousebender`` bundled with ``micropip``; parsing still works. Filtering avoids
    scaring users on every ``await micropip.install(...)``.
    """
    import warnings

    # Message match works even before ``micropip`` is importable.
    warnings.filterwarnings("ignore", message=r"Unsupported API minor version")
    try:
        from micropip._vendored.mousebender.simple import APIVersionWarning

        warnings.filterwarnings("ignore", category=APIVersionWarning)
    except Exception:
        try:
            from mousebender.simple import APIVersionWarning

            warnings.filterwarnings("ignore", category=APIVersionWarning)
        except Exception:
            pass


_suppress_micropip_pypi_simple_api_minor_warnings()
_install_nb_auto_micropip_import_hook()


def _has_top_level_await(tree: ast.Module) -> bool:
    """True if ``await`` appears outside nested def/class bodies (needs async exec)."""
    for stmt in tree.body:
        if isinstance(stmt, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        for node in ast.walk(stmt):
            if isinstance(node, ast.Await):
                return True
    return False


def _cell_needs_eval_code_async(tree: ast.Module) -> bool:
    """True when the cell must run via :func:`eval_code_async` (top-level await).

    Includes a trailing ``await ...`` line written as an expression statement.
    Without this, the last-expr path compiles that line with ``mode='eval'``,
    which raises ``SyntaxError: 'await' outside function``.
    """
    if _has_top_level_await(tree):
        return True
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        return isinstance(tree.body[-1].value, ast.Await)
    return False


def _displayhook_last_expr_after_async(
    tree: ast.Module, user_ns: dict[str, Any], displayhook: Any
) -> None:
    """Apply ``sys.displayhook`` to the cell's last expression after ``eval_code_async``.

    Pyodide's ``eval_code_async`` executes the full cell but, unlike Jupyter's REPL
    split for sync cells, does not emit the value of a trailing expression (e.g.
    ``chart`` after ``await micropip.install(...)``). Without this, there is no
    ``execute_result`` / Altair MIME output—only ``[*]`` and empty output area.

    Only **simple names** (``chart`` / ``fig``) are re-evaluated for display. Other
    trailing expressions (e.g. ``make()`` calls) already ran once as statements;
    re-``eval`` would execute them a second time.
    """
    if not tree.body or not isinstance(tree.body[-1], ast.Expr):
        return
    expr_node = tree.body[-1].value
    if isinstance(expr_node, ast.Await):
        return
    if not isinstance(expr_node, ast.Name):
        return
    expr_mod = ast.Expression(body=expr_node)
    ast.fix_missing_locations(expr_mod)
    value = eval(compile(expr_mod, "<cell>", "eval"), user_ns, user_ns)
    try:
        displayhook(value)
    except Exception:
        pass


async def _nb_run(code: str, execution_count: int) -> None:
    """Execute ``code`` in the user namespace, emitting IOPub for the trailing expr.

    Supports top-level ``await`` (e.g. ``await micropip.install(...)``) by compiling
    with :data:`ast.PyCF_ALLOW_TOP_LEVEL_AWAIT` and awaiting the coroutine ``exec`` returns.
    """
    import asyncio
    import builtins
    import inspect

    code = _nb_preprocess_pip_shell_lines(code)
    user_ns = globals()
    prev_hook = sys.displayhook
    hook = _displayhook_factory(execution_count)
    sys.displayhook = hook
    try:
        try:
            tree = ast.parse(code, mode="exec")
        except SyntaxError:
            raise

        if _cell_needs_eval_code_async(tree):
            # Prefer Pyodide's async runner (handles TL-await reliably in WASM; exec() return varies).
            try:
                from pyodide.code import eval_code_async

                # Best-effort early patch: if plotly/altair were imported in a
                # prior cell they are already in sys.modules and will be patched
                # before this cell's body runs.  If they are being imported for
                # the first time inside this cell the patch is a no-op here but
                # will be applied when _format_object() is called later.
                _configure_plotly_renderer()
                _ensure_altair_mimetype_renderer()
                await eval_code_async(code, user_ns)
                _displayhook_last_expr_after_async(tree, user_ns, hook)
            except ImportError:
                co = compile(code, "<cell>", "exec", ast.PyCF_ALLOW_TOP_LEVEL_AWAIT)
                result = exec(co, user_ns, user_ns)
                if result is not None and (
                    inspect.isawaitable(result) or asyncio.iscoroutine(result)
                ):
                    await result
                _displayhook_last_expr_after_async(tree, user_ns, hook)
        elif tree.body and isinstance(tree.body[-1], ast.Expr):
            exec_part = ast.Module(body=tree.body[:-1], type_ignores=[])
            expr_part = ast.Expression(body=tree.body[-1].value)  # type: ignore[arg-type]
            ast.fix_missing_locations(exec_part)
            ast.fix_missing_locations(expr_part)
            if exec_part.body:
                exec(compile(exec_part, "<cell>", "exec"), user_ns, user_ns)
            # Patch display hooks after imports have run but before the trailing
            # expression is evaluated.  This ensures fig.show() / chart.show()
            # work even when the import and the show() call are in the same cell.
            _configure_plotly_renderer()
            _ensure_altair_mimetype_renderer()
            value = eval(compile(expr_part, "<cell>", "eval"), user_ns, user_ns)
            sys.displayhook(value)
        else:
            exec(compile(tree, "<cell>", "exec"), user_ns, user_ns)
    finally:
        sys.displayhook = prev_hook
        try:
            builtins  # appease linters
        except Exception:
            pass


# Make the helpers reachable as bare globals so user code can call them.


_NB_COMM_HANDLERS: dict[str, object] = {}


def _nb_deliver_comm_msg(comm_id: str, data: object) -> None:
    """Receive a ``comm_msg`` from the browser host (ipywidgets / tests).

    Real ipywidgets integration registers per-comm handlers here; the demo
    slider is static unless ``ipywidgets`` is installed and patched.
    """
    try:
        h = _NB_COMM_HANDLERS.get(comm_id)
        if h is not None and callable(h):
            h(data)
    except Exception:
        pass


def _nb_demo_int_slider() -> None:
    """Emit IOPub ``comm_open`` + a raw ``display_data`` bundle for an ``IntSlider``.

    Call from a notebook cell (e.g. ``_nb_demo_int_slider()``) to exercise the
    widget bridge without ``micropip`` when the stock Pyodide stack lacks ``ipywidgets``.
    """
    import json
    import uuid

    cid = uuid.uuid4().hex
    state: dict = {
        "_model_name": "IntSliderModel",
        "_model_module": "@jupyter-widgets/controls",
        "_model_module_version": "2.0.0",
        "_view_name": "IntSliderView",
        "_view_module": "@jupyter-widgets/controls",
        "_view_module_version": "2.0.0",
        "layout": None,
        "style": None,
        "value": 7,
        "min": 0,
        "max": 100,
        "step": 1,
        "description": "Demo",
        "disabled": False,
        "orientation": "horizontal",
        "readout": True,
        "readout_format": "d",
        "continuous_update": True,
    }
    _emit(
        {
            "msg_type": "comm_open",
            "content": {
                "comm_id": cid,
                "target_name": "jupyter.widget",
                "data": {"state": state, "buffer_paths": []},
            },
        }
    )
    view = json.dumps({"version_major": 2, "version_minor": 1, "model_id": cid})
    display(
        {
            "application/vnd.jupyter.widget-view+json": view,
            "text/plain": "IntSlider()",
        },
        raw=True,
    )


__all__ = ["display", "clear_output", "_nb_run", "_nb_deliver_comm_msg", "_nb_demo_int_slider"]
