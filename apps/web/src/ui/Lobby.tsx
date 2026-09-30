import { useEffect } from 'react';
import { controller, useApp } from '../runtime';
import { formatChips } from '../lib/format';

export function Lobby() {
  const tables = useApp((s) => s.tables);
  const session = useApp((s) => s.session);
  const balance = useApp((s) => s.balance);

  useEffect(() => {
    void controller.refreshTables();
    void controller.refreshBalance();
    const id = setInterval(() => {
      void controller.refreshTables();
      void controller.refreshBalance(); // chips come back when a hand we left mid-play finishes
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <main className="lobby">
      <header className="topbar">
        <h1>Hold'em</h1>
        <div className="topbar-right">
          <span className="muted">
            {session?.username} · <strong>{balance === null ? '…' : formatChips(balance)}</strong> chips
          </span>
          <button onClick={() => controller.logout()}>Sign out</button>
        </div>
      </header>

      <h2>Tables</h2>
      {tables.length === 0 && <p className="muted">No tables yet.</p>}
      <ul className="table-list">
        {tables.map((t) => (
          <li key={t.id} className="card table-row">
            <div>
              <strong>{t.name}</strong>
              <div className="muted">
                Blinds {formatChips(BigInt(t.config.smallBlind))}/{formatChips(BigInt(t.config.bigBlind))} · Buy-in {formatChips(BigInt(t.config.minBuyIn))}–
                {formatChips(BigInt(t.config.maxBuyIn))}
              </div>
            </div>
            <div className="table-row-right">
              <span>
                {t.seated}/{t.config.maxSeats} seated
              </span>
              <button className="primary" onClick={() => controller.openTable(t.id)}>
                Open
              </button>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
