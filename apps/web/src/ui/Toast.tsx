import { useEffect } from 'react';
import { controller, useApp } from '../runtime';

export function Toast() {
  const notice = useApp((s) => s.notice);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => controller.dismissNotice(), 6000);
    return () => clearTimeout(id);
  }, [notice?.id]);

  if (!notice) return null;
  return (
    <div className={`toast toast-${notice.kind}`} role="alert" onClick={() => controller.dismissNotice()}>
      {notice.text}
    </div>
  );
}
