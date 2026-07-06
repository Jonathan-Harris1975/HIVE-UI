import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AuthProvider, useAuth } from '../context/AuthContext'
import { LoginScreen } from '../components/LoginScreen'

// Vitest runs with import.meta.env.DEV === false by default (mode "test"),
// so AuthProvider already takes the real-backend branch (loginUi/authFetch
// against fetch) rather than the short-circuited dev-session path.

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers })
}

function Harness() {
  const { status, error } = useAuth()
  return (
    <div>
      <p data-testid="status">{status}</p>
      {error && <p data-testid="auth-error">{error}</p>}
      <LoginScreen />
    </div>
  )
}

describe('Login / session flow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.sessionStorage.clear()
  })

  it('renders the login form when signed out', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ detail: 'unauthorised' }, { status: 401 })),
    )
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    expect(await screen.findByRole('heading', { name: /enter the hive/i })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter access key/i)).toBeInTheDocument()
  })

  it('submits the access key and signs in on success', async () => {
    const fetchMock = vi
      .fn()
      // initial restoreSession() session check -> unauthenticated
      .mockResolvedValueOnce(jsonResponse({ detail: 'no session' }, { status: 401 }))
      // login submit -> success
      .mockResolvedValueOnce(jsonResponse({ ok: true, authenticated: true }))
      // refreshHealth() after login
      .mockResolvedValueOnce(jsonResponse({ ok: true, status: 'healthy' }))
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    const input = await screen.findByPlaceholderText(/enter access key/i)
    await user.type(input, 'a-valid-key')
    await user.click(screen.getByRole('button', { name: /unlock console/i }))

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-in'))
    expect(screen.queryByTestId('auth-error')).not.toBeInTheDocument()
  })

  it('surfaces a 429 rate-limit response as a visible, human-readable error without signing in', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'no session' }, { status: 401 }))
      .mockResolvedValueOnce(
        jsonResponse(
          { detail: 'Too many authentication attempts. Try again in a few minutes.' },
          { status: 429 },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    const input = await screen.findByPlaceholderText(/enter access key/i)
    await user.type(input, 'guessed-key')
    await user.click(screen.getByRole('button', { name: /unlock console/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/too many authentication attempts/i),
    )
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out')
  })

  it('disables the submit button while a login request is in flight', async () => {
    let resolveLogin: (value: Response) => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'no session' }, { status: 401 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveLogin = resolve
          }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      <AuthProvider>
        <Harness />
      </AuthProvider>,
    )

    const input = await screen.findByPlaceholderText(/enter access key/i)
    await user.type(input, 'a-valid-key')
    const submitButton = screen.getByRole('button', { name: /unlock console/i })
    await user.click(submitButton)

    await waitFor(() => expect(submitButton).toBeDisabled())
    resolveLogin(jsonResponse({ ok: true, authenticated: true }))
  })
})
