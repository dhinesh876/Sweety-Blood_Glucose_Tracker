import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ReadingForm from './ReadingForm';
import { api } from '../api';
import { todayLocal } from '../constants';

vi.mock('../api', () => ({ api: { createReading: vi.fn(), updateReading: vi.fn() } }));

const saveButton = () => screen.getByRole('button', { name: /save reading/i });
const valueInput = () => screen.getByLabelText(/glucose value/i);

beforeEach(() => vi.clearAllMocks());

test('shows an error when the value is empty and does not call the API', async () => {
  render(<ReadingForm />);
  await userEvent.click(saveButton());
  expect(screen.getByText('Please enter a glucose value.')).toBeInTheDocument();
  expect(api.createReading).not.toHaveBeenCalled();
});

test.each(['30', '601'])('shows a range error for %s', async (v) => {
  render(<ReadingForm />);
  await userEvent.type(valueInput(), v);
  await userEvent.click(saveButton());
  expect(screen.getByText('Value must be between 40 and 600 mg/dl.')).toBeInTheDocument();
  expect(api.createReading).not.toHaveBeenCalled();
});

test('rejects a future date', async () => {
  render(<ReadingForm />);
  const date = screen.getByLabelText(/date/i);
  await userEvent.clear(date);
  await userEvent.type(date, '2999-01-01');
  await userEvent.type(valueInput(), '120');
  await userEvent.click(saveButton());
  expect(screen.getByText('Date cannot be in the future.')).toBeInTheDocument();
});

test('submits a valid reading and clears the value', async () => {
  api.createReading.mockResolvedValue({ id: 1 });
  const onSaved = vi.fn();
  render(<ReadingForm onSaved={onSaved} />);
  await userEvent.type(valueInput(), '120');
  await userEvent.click(saveButton());
  expect(api.createReading).toHaveBeenCalledWith({ date: todayLocal(), slot: 'morning', value: 120 });
  expect(onSaved).toHaveBeenCalled();
  expect(valueInput()).toHaveValue(null);
});

test('displays the server error message (e.g. duplicate slot)', async () => {
  api.createReading.mockRejectedValue(new Error('You already have a Morning reading for this date.'));
  render(<ReadingForm />);
  await userEvent.type(valueInput(), '120');
  await userEvent.click(saveButton());
  expect(await screen.findByText('You already have a Morning reading for this date.')).toBeInTheDocument();
});
