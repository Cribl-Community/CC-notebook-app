import { describe, it, expect } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DialogProvider, useDialogs } from './DialogProvider'

function AlertTrigger({ message }: { message: string }) {
  const { alert } = useDialogs()
  return (
    <button type="button" onClick={() => alert(message)}>
      show-alert
    </button>
  )
}

function ConfirmTrigger({ onResult }: { onResult: (ok: boolean) => void }) {
  const { confirm } = useDialogs()
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await confirm('sure?')
        onResult(ok)
      }}
    >
      show-confirm
    </button>
  )
}

function PromptTrigger({ onResult }: { onResult: (value: string | null) => void }) {
  const { prompt } = useDialogs()
  return (
    <button
      type="button"
      onClick={async () => {
        const v = await prompt('Name', 'Enter name', 'seed')
        onResult(v)
      }}
    >
      show-prompt
    </button>
  )
}

describe('DialogProvider', () => {
  it('alert resolves when OK is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DialogProvider>
        <AlertTrigger message="hello" />
      </DialogProvider>,
    )
    await user.click(screen.getByText('show-alert'))
    expect(screen.getByText('hello')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByText('hello')).not.toBeInTheDocument()
  })

  it('confirm resolves true on OK and false on Cancel', async () => {
    const user = userEvent.setup()
    const results: boolean[] = []
    render(
      <DialogProvider>
        <ConfirmTrigger onResult={(ok) => results.push(ok)} />
      </DialogProvider>,
    )
    await user.click(screen.getByText('show-confirm'))
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(results).toEqual([true])
    await user.click(screen.getByText('show-confirm'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(results).toEqual([true, false])
  })

  it('prompt returns the entered value, or null on cancel', async () => {
    const user = userEvent.setup()
    const results: Array<string | null> = []
    render(
      <DialogProvider>
        <PromptTrigger onResult={(v) => results.push(v)} />
      </DialogProvider>,
    )
    await user.click(screen.getByText('show-prompt'))
    const input = screen.getByRole('textbox')
    await act(async () => {
      await user.clear(input)
      await user.type(input, 'hello')
    })
    await user.click(screen.getByRole('button', { name: 'OK' }))
    expect(results).toEqual(['hello'])

    await user.click(screen.getByText('show-prompt'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(results).toEqual(['hello', null])
  })
})
