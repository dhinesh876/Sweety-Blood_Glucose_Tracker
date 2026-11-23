import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../api';
import { SLOTS, formatRange, todayLocal } from '../constants';

function StatCard({ title, period }) {
  return (
    <div className="card stat">
      <h3>{title}</h3>
      <p className="muted">{formatRange(period.range.from, period.range.to)}</p>
      {period.empty ? (
        <p className="empty">No readings for this period yet.</p>
      ) : (
        <dl>
          <div><dt>Highest</dt><dd>{period.highest}</dd></div>
          <div><dt>Lowest</dt><dd>{period.lowest}</dd></div>
          <div><dt>Average</dt><dd>{period.average.toFixed(1)}</dd></div>
          <div><dt>Readings</dt><dd>{period.count}</dd></div>
        </dl>
      )}
    </div>
  );
}

export default function Reports({ refreshKey }) {
  const [date, setDate] = useState(todayLocal());
  const [report, setReport] = useState(null);
  const [points, setPoints] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!date) return undefined;
    setError('');
    (async () => {
      try {
        const rep = await api.report(date);
        const chart = await api.listReadings({ from: rep.monthToDate.range.from, to: date, order: 'asc', limit: 200 });
        if (cancelled) return;
        setReport(rep);
        setPoints(chart.data.map((r) => ({
          label: `${r.date.slice(5)} ${SLOTS.find((s) => s.value === r.slot)?.short}`,
          value: r.value,
        })));
      } catch (err) {
        if (!cancelled) { setError(err.message); setReport(null); setPoints([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [date, refreshKey]);

  return (
    <div>
      <div className="card">
        <label>Report date
          <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      {report && (
        <>
          <div className="grid">
            <StatCard title="Daily" period={report.daily} />
            <StatCard title="Month to date" period={report.monthToDate} />
            <StatCard title="Previous month" period={report.monthly} />
          </div>

          <div className="card">
            <h3>Daily readings</h3>
            {report.daily.readings.length === 0 ? (
              <p className="empty">No readings recorded on this date.</p>
            ) : (
              <table>
                <thead><tr><th>Slot</th><th>mg/dl</th></tr></thead>
                <tbody>
                  {report.daily.readings.map((r) => (
                    <tr key={r.id}><td>{r.slotLabel}</td><td><strong>{r.value}</strong></td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <h3>Month to date trend</h3>
            {points.length === 0 ? (
              <p className="empty">Nothing to chart yet.</p>
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <LineChart data={points} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={40} tick={{ fontSize: 11 }} />
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name="mg/dl" stroke="#d6336c" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
