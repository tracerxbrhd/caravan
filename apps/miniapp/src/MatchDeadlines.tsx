import type { MatchSnapshot } from '@caravan/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  estimatedServerNow,
  matchDeadlineNotices,
  remainingDeadlineSeconds,
  type ServerClockAnchor,
} from './deadlines.js';

export function MatchDeadlines({
  snapshot,
  clockAnchor,
}: {
  readonly snapshot: MatchSnapshot;
  readonly clockAnchor: ServerClockAnchor | null;
}) {
  const notices = useMemo(() => matchDeadlineNotices(snapshot), [snapshot]);
  const [clientNowMs, setClientNowMs] = useState(Date.now);

  useEffect(() => {
    if (notices.length === 0 || clockAnchor === null) return;
    setClientNowMs(Date.now());
    const timer = setInterval(() => setClientNowMs(Date.now()), 250);
    return () => clearInterval(timer);
  }, [clockAnchor, notices.length]);

  if (notices.length === 0 || clockAnchor === null) return null;
  const serverNowMs = estimatedServerNow(clockAnchor, clientNowMs);

  return (
    <section className="match-deadlines" aria-label="Authoritative match deadlines" aria-live="polite">
      {notices.map((notice) => {
        const seconds = remainingDeadlineSeconds(notice.deadlineAtMs, serverNowMs);
        const urgent = seconds <= 10;
        return (
          <div
            className={`match-deadline match-deadline--${notice.kind.toLowerCase()}${urgent ? ' match-deadline--urgent' : ''}`}
            key={notice.key}
          >
            <span>{notice.label}</span>
            <strong>{seconds === 0 ? 'due now' : `${seconds}s`}</strong>
          </div>
        );
      })}
    </section>
  );
}
