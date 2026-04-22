/**
 * Concrete adapter for the `KernelPort` backed by the Pyodide Web Worker.
 * Thin wrapper around `PyodideKernel` so the notebook feature can consume the
 * port type without knowing the concrete class exists.
 */
import type { KernelFactory, KernelPort } from '@ports/KernelPort'
import { PyodideKernel } from '@platform/pyodide/PyodideKernel'

export function createPyodideKernel(): KernelPort {
  return new PyodideKernel()
}

export const pyodideKernelFactory: KernelFactory = createPyodideKernel
