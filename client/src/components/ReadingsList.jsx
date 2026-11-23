import { useEffect, useState } from 'react';
import { api } from '../api';
import { formatDate } from '../constants';

const LIMIT = 10;

export default function ReadingsList({ refreshKey, onEdit, onChanged }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listReadings({ page, limit: LIMIT })
      .then((res) => {
        if (cancelled) return;
        // If the last item on the last page was deleted, step back one page.
        if (res.data.length === 0 && page > 1) setPage(page - 1);
        else { setState(res); setError(''); }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [page, refreshKey]);

  async function remove(r) {
    if (!window.confirm(`Delete the ${r.slotLabel} reading (${r.value} mg/dl) on ${formatDate(r.date)}?`)) return;
    try {
      await api.deleteReading(r.id);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  }

  const { data, pagination } = state;
  return (
    <div className="card">
      <h2>Your readings</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!loading && data.length === 0 && !error && (
        <p className="empty">No readings yet. Add your first one above 👆</p>
      )}
      {data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Slot</th><th>mg/dl</th><th /></tr></thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.slotLabel}</td>
                  <td><strong>{r.value}</strong></td>
                  <td className="actions">
                    <button className="secondary small" onClick={() => onEdit(r)}>Edit</button>
                    <button className="danger small" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pagination.totalPages > 1 && (
        <div className="pager">
          <button className="secondary small" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
          <span>Page {pagination.page} of {pagination.totalPages}</span>
          <button className="secondary small" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}
