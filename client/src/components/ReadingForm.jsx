import { useState } from 'react';
import { api } from '../api';
import { SLOTS, MIN_VALUE, MAX_VALUE, todayLocal } from '../constants';
import { validateReading } from '../validate';

export default function ReadingForm({ initial, onSaved, onCancel }) {
  const [form, setForm] = useState({
    date: initial?.date || todayLocal(),
    slot: initial?.slot || SLOTS[0].value,
    value: initial?.value ?? '',
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setServerError('');
    const errs = validateReading(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const payload = { date: form.date, slot: form.slot, value: Number(form.value) };
      const saved = initial ? await api.updateReading(initial.id, payload) : await api.createReading(payload);
      if (!initial) setForm((f) => ({ ...f, value: '' }));
      onSaved?.(saved);
    } catch (err) {
      setServerError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <h2>{initial ? 'Edit reading' : 'Add reading'}</h2>
      <div className="row">
        <label>Date
          <input type="date" value={form.date} max={todayLocal()} onChange={set('date')} />
          {errors.date && <span className="error" role="alert">{errors.date}</span>}
        </label>
        <label>Time slot
          <select value={form.slot} onChange={set('slot')}>
            {SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {errors.slot && <span className="error" role="alert">{errors.slot}</span>}
        </label>
        <label>Glucose value (mg/dl)
          <input type="number" inputMode="numeric" min={MIN_VALUE} max={MAX_VALUE}
            value={form.value} onChange={set('value')} />
          {errors.value && <span className="error" role="alert">{errors.value}</span>}
        </label>
      </div>
      {serverError && <p className="error" role="alert">{serverError}</p>}
      <div className="actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save reading'}</button>
        {initial && <button type="button" className="secondary" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
