import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { api, setToken } from '../api';
import AuthForm from './AuthForm';

vi.mock('../api', () => ({
    api: { login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() },
    setToken: vi.fn(),
}));

beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
});

const type = (label, text) => userEvent.type(screen.getByLabelText(label), text);

async function openRegister() {
    render(<AuthForm onAuth={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }));
}

test('signup rejects a weak password', async () => {
    await openRegister();
    await type('Name', 'Asha');
    await type('Email', 'a@test.com');
    await type('Password', 'abcdefgh');
    await type('Confirm password', 'abcdefgh');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/letter and a number/);
    expect(api.register).not.toHaveBeenCalled();
});

test('signup rejects mismatched passwords', async () => {
    await openRegister();
    await type('Name', 'Asha');
    await type('Email', 'a@test.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password124');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
});

test('successful signup goes to the login screen without logging in', async () => {
    api.register.mockResolvedValue({ token: 't', user: {} });
    const onAuth = vi.fn();
    render(<AuthForm onAuth={onAuth} />);
    await userEvent.click(screen.getByRole('button', { name: /create an account/i }));
    await type('Name', 'Asha');
    await type('Email', 'a@test.com');
    await type('Password', 'password123');
    await type('Confirm password', 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign up' }));

    expect(api.register).toHaveBeenCalledWith({ name: 'Asha', email: 'a@test.com', password: 'password123' });
    expect(await screen.findByText('Account created. Please log in.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('a@test.com');
    expect(onAuth).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
});

test('forgot password sends the email and shows the generic message', async () => {
    api.forgotPassword.mockResolvedValue({ message: 'If an account exists for this email, a password reset link has been sent.' });
    render(<AuthForm onAuth={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /forgot password/i }));
    await type('Email', 'a@test.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(api.forgotPassword).toHaveBeenCalledWith('a@test.com');
    expect(await screen.findByText(/password reset link has been sent/i)).toBeInTheDocument();
});

test('reset link in the URL opens the new-password form and submits the token', async () => {
    window.history.replaceState({}, '', '/?reset=abc123');
    api.resetPassword.mockResolvedValue({ message: 'ok' });
    render(<AuthForm onAuth={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Set a new password' })).toBeInTheDocument();
    await type('New password', 'newpassword9');
    await type('Confirm password', 'newpassword9');
    await userEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(api.resetPassword).toHaveBeenCalledWith('abc123', 'newpassword9');
    expect(await screen.findByText('Password updated. Please log in.')).toBeInTheDocument();
    expect(window.location.search).toBe('');
});

test('login success stores the token and calls onAuth', async () => {
    api.login.mockResolvedValue({ token: 'tok', user: { id: 1, name: 'Asha' } });
    const onAuth = vi.fn();
    render(<AuthForm onAuth={onAuth} />);
    await type('Email', 'a@test.com');
    await type('Password', 'password123');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(setToken).toHaveBeenCalledWith('tok');
    expect(onAuth).toHaveBeenCalledWith({ id: 1, name: 'Asha' });
});