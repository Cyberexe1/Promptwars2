import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import App from '../App';
import { renderWithRouter } from '../test/render';
import { errorResponse, stubApi } from '../test/server';

const EMAIL = 'resident@example.com';
const PASSWORD = 'correct horse battery';

async function fillCredentials(
  user: ReturnType<typeof userEvent.setup>,
  password = PASSWORD,
) {
  await user.type(screen.getByLabelText(/email address/i), EMAIL);
  await user.type(screen.getByLabelText(/^password$/i), password);
}

describe('login page', () => {
  it('is reachable at /login', async () => {
    stubApi();
    renderWithRouter(<App />, '/login');

    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to smogwise/i }),
    ).toBeInTheDocument();
  });

  it('has no detectable accessibility violations', async () => {
    stubApi();
    const { container } = renderWithRouter(<App />, '/login');
    await screen.findByLabelText(/email address/i);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('labels both fields and marks them for password managers', async () => {
    stubApi();
    renderWithRouter(<App />, '/login');

    const email = await screen.findByLabelText(/email address/i);
    const password = screen.getByLabelText(/^password$/i);

    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(password).toHaveAttribute('type', 'password');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
  });

  it('signs in and lands on the dashboard', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('sends the credentials to the login endpoint', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/auth/login'),
      );
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]?.body))).toEqual({
        email: EMAIL,
        password: PASSWORD,
      });
    });
  });

  it('sends credentials so the session cookie is accepted', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/auth/login'),
      );
      // Without this the httpOnly cookie is never stored cross-origin.
      expect(call![1]?.credentials).toBe('include');
    });
  });

  it('shows the server message when the credentials are rejected', async () => {
    stubApi({
      login: () =>
        errorResponse(401, 'That email and password combination is not recognised.'),
    });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user, 'wrong password here');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /not recognised/i,
    );
  });

  it('stays on the login page after a failure', async () => {
    stubApi({ login: () => errorResponse(401, 'Not recognised.') });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
  });

  it('never puts the password in the URL', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      for (const [url] of fetchMock.mock.calls) {
        expect(String(url)).not.toContain(PASSWORD);
      }
    });
  });

  it('validates locally before calling the server', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await screen.findByLabelText(/email address/i);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/enter your email/i);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/api/auth/login'),
      ),
    ).toHaveLength(0);
  });
});

describe('creating an account', () => {
  async function switchToSignup(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: /create one/i }));
  }

  it('switches to signup without navigating away', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await switchToSignup(user);

    expect(
      screen.getByRole('heading', { level: 1, name: /create your smogwise account/i }),
    ).toBeInTheDocument();
  });

  it('states the password rule before it is needed', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await switchToSignup(user);

    expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute(
      'autocomplete',
      'new-password',
    );
  });

  it('rejects a short password without calling the server', async () => {
    const fetchMock = stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await switchToSignup(user);
    await fillCredentials(user, 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 12/i);
    expect(
      fetchMock.mock.calls.filter(([url]) =>
        String(url).includes('/api/auth/signup'),
      ),
    ).toHaveLength(0);
  });

  it('creates the account and lands on the dashboard', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await switchToSignup(user);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('reports a rejected signup without revealing whether the email exists', async () => {
    stubApi({
      signup: () =>
        errorResponse(409, 'That email cannot be used to register. Try signing in instead.'),
    });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/login');

    await switchToSignup(user);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /create account/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/cannot be used to register/i);
    expect(alert).not.toHaveTextContent(/already|taken|exists/i);
  });
});

describe('route protection', () => {
  it('sends a signed-out visitor from the dashboard to the login page', async () => {
    stubApi();
    renderWithRouter(<App />, '/dashboard');

    expect(
      await screen.findByRole('heading', { level: 1, name: /sign in to smogwise/i }),
    ).toBeInTheDocument();
  });

  it('lets a signed-in visitor straight into the dashboard', async () => {
    stubApi({ signedIn: true });
    renderWithRouter(<App />, '/dashboard');

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('returns the user to where they were going after signing in', async () => {
    stubApi();
    const user = userEvent.setup();
    renderWithRouter(<App />, '/dashboard');

    await screen.findByLabelText(/email address/i);
    await fillCredentials(user);
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /clean-air plan/i }),
    ).toBeInTheDocument();
  });

  it('waits for the session check instead of bouncing on refresh', async () => {
    // A redirect while the check is still in flight would throw a signed-in
    // user out on every page reload.
    stubApi({ signedIn: true });
    renderWithRouter(<App />, '/dashboard');

    expect(screen.getByRole('status')).toHaveTextContent(/checking your session/i);
  });
});

describe('header navigation by session', () => {
  it('offers a log-in action and hides the dashboard when signed out', async () => {
    stubApi();
    renderWithRouter(<App />, '/');

    const header = screen.getByRole('banner');
    expect(
      await within(header).findByRole('link', { name: /log in/i }),
    ).toBeInTheDocument();
    expect(
      within(header).queryByRole('link', { name: 'Dashboard' }),
    ).not.toBeInTheDocument();
  });

  it('shows the dashboard, the account, and a log-out control when signed in', async () => {
    stubApi({ signedIn: true });
    renderWithRouter(<App />, '/');

    const header = screen.getByRole('banner');
    expect(
      await within(header).findByRole('link', { name: 'Dashboard' }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole('button', { name: /log out/i }),
    ).toBeInTheDocument();
    expect(within(header).getByText(EMAIL)).toBeInTheDocument();
  });

  it('signs out and returns to the landing page', async () => {
    stubApi({ signedIn: true });
    const user = userEvent.setup();
    renderWithRouter(<App />, '/dashboard');

    const header = screen.getByRole('banner');
    await user.click(await within(header).findByRole('button', { name: /log out/i }));

    expect(
      await screen.findByRole('heading', { level: 1, name: /what today.s air means/i }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('link', { name: /log in/i }),
    ).toBeInTheDocument();
  });
});
