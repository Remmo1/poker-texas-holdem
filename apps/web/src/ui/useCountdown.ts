import { useEffect, useState } from 'react';
import { controller } from '../runtime';

/** Seconds left until a server-time deadline, refreshed a few times a second. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(() => controller.serverNow());
  useEffect(() => {
    if (deadline === null) return;
    setNow(controller.serverNow());
    const id = setInterval(() => setNow(controller.serverNow()), 250);
    return () => clearInterval(id);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}
