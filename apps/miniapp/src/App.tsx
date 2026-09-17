import { parseLaunchParam } from '@caravan/protocol';
import { useEffect, useState } from 'react';
import { ApiError, bootstrapAccount, type AccountProfile } from './api.js';
import { Play } from './Play.js';
import { platform } from './platform.js';

type BootstrapState =
  | { status: 'loading' }
  | { status: 'ready'; account: AccountProfile }
  | { status: 'telegram-required' }
  | { status: 'error' };

export function App() {
  const [state, setState] = useState<BootstrapState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  const retryBootstrap = (): void => {
    setState({ status: 'loading' });
    setAttempt((value) => value + 1);
  };

  useEffect(
    () =>
      platform.subscribeLayout(({ stableViewportHeight, safeArea, contentSafeArea }) => {
        const root = document.documentElement.style;
        root.setProperty('--app-viewport-stable-height', `${stableViewportHeight}px`);
        for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
          const environmentInset = `env(safe-area-inset-${edge}, 0px)`;
          root.setProperty(`--app-safe-${edge}`, `max(${safeArea[edge]}px, ${environmentInset})`);
          root.setProperty(
            `--app-content-safe-${edge}`,
            `max(${contentSafeArea[edge]}px, ${environmentInset})`,
          );
        }
      }),
    [],
  );

  useEffect(() => {
    platform.ready();
    platform.expand();
    const initData = platform.initData();
    let active = true;

    void bootstrapAccount(initData)
      .then((account) => {
        if (active) setState({ status: 'ready', account });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setState({ status: 'telegram-required' });
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  if (state.status === 'ready') {
    return (
      <Play
        launchContext={parseLaunchParam(platform.launchParam())}
        onSessionExpired={retryBootstrap}
      />
    );
  }

  const status =
    state.status === 'loading'
      ? 'Connecting to CARAVAN…'
      : state.status === 'telegram-required'
        ? 'Open or reopen CARAVAN from Telegram to refresh your sign-in.'
        : 'Could not establish a CARAVAN session.';

  return (
    <main className="shell shell--centered">
      <section className="panel hero-panel" aria-labelledby="caravan-title">
        <p className="eyebrow">Trade routes. Real opponents.</p>
        <h1 id="caravan-title">CARAVAN</h1>
        <p className="status">{status}</p>
        {state.status === 'error' && (
          <button className="button" type="button" onClick={retryBootstrap}>
            Retry connection
          </button>
        )}
      </section>
    </main>
  );
}
