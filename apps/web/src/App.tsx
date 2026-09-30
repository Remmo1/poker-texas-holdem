import { useEffect, useState } from 'react';
import { controller, useApp } from './runtime';
import { AuthPage } from './ui/AuthPage';
import { Lobby } from './ui/Lobby';
import { TablePage } from './ui/TablePage';
import { Toast } from './ui/Toast';

const TABLE_HASH = /^#\/table\/([\w-]+)$/;

/** Keeps the URL hash and the open table in sync so a refresh or the back button works. */
function useHashRoute(signedIn: boolean, tableId: string | null): void {
  useEffect(() => {
    if (!signedIn) return;
    const apply = () => {
      const wanted = TABLE_HASH.exec(location.hash)?.[1] ?? null;
      const current = controller.currentTableId();
      if (wanted && wanted !== current) controller.openTable(wanted);
      else if (!wanted && current) controller.closeTable();
    };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, [signedIn]);

  useEffect(() => {
    // Read live state: the effect above may have just opened a table that this render has not seen yet.
    const open = controller.currentTableId();
    const hash = open ? `#/table/${open}` : '';
    if (signedIn && location.hash !== hash) location.hash = hash;
  }, [signedIn, tableId]);
}

export function App() {
  const session = useApp((s) => s.session);
  const tableId = useApp((s) => s.tableId);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    void controller.restoreSession().finally(() => setBooting(false));
  }, []);
  useHashRoute(session !== null, tableId);

  if (booting) return null;
  return (
    <>
      {!session ? <AuthPage /> : tableId ? <TablePage /> : <Lobby />}
      <Toast />
    </>
  );
}
