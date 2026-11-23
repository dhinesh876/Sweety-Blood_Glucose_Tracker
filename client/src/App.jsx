import { useEffect, useState } from 'react';
import { api, setSessionExpiredHandler, setToken } from './api';
import AuthForm from './components/AuthForm';
import ReadingForm from './components/ReadingForm';
import ReadingsList from './components/ReadingsList';
import Reports from './components/Reports';

export default function App() {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState('readings');
  const [editing, setEditing] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  useEffect(() => {
    // If the refresh token expires mid-session, send the user back to the login screen.
    setSessionExpiredHandler(() => { setUser(null); setEditing(null); });

    // A password-reset link must always show the reset form, even if a session cookie exists.
    if (new URLSearchParams(window.location.search).has('reset')) {
      setBooting(false);
      return;
    }
    // Restore the session from the httpOnly refresh cookie (the access token only lives in memory).
    api.refresh()
      .then((res) => setUser(res.user))
      .catch(() => { })
      .finally(() => setBooting(false));
  }, []);

  async function logout() {
    try { await api.logout(); } catch { /* cookie is cleared best-effort */ }
    setToken(null);
    setUser(null);
    setEditing(null);
  }

  if (booting) return <p className="center muted">Loading…</p>;
  if (!user) return <main><AuthForm onAuth={setUser} /></main>;

  return (
    <main>
      <header>
        <h1>🩸 Sweety</h1>
        <div>
          <span className="muted">Hi, {user.name}</span>{' '}
          <button className="secondary small" onClick={logout}>Log out</button>
        </div>
      </header>

      <nav>
        <button className={tab === 'readings' ? 'tab active' : 'tab'} onClick={() => setTab('readings')}>Readings</button>
        <button className={tab === 'reports' ? 'tab active' : 'tab'} onClick={() => setTab('reports')}>Reports</button>
      </nav>

      {tab === 'readings' ? (
        <>
          <ReadingForm
            key={editing ? `edit-${editing.id}` : 'new'}
            initial={editing}
            onSaved={() => { setEditing(null); bump(); }}
            onCancel={() => setEditing(null)}
          />
          <ReadingsList
            refreshKey={refreshKey}
            onEdit={(r) => { setEditing(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            onChanged={() => { setEditing(null); bump(); }}
          />
        </>
      ) : (
        <Reports refreshKey={refreshKey} />
      )}
    </main>
  );
}