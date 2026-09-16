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
        if (error instanceof ApiError && error.status === 401 && initData.length === 0) {
          setState({ status: 'telegram-required' });
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.status === 'ready') {
    return (
      <Play account={state.account} launchContext={parseLaunchParam(platform.launchParam())} />
    );
  }

  const status =
    state.status === 'loading'
      ? 'Connecting to CARAVAN…'
      : state.status === 'telegram-required'
        ? 'Open CARAVAN from Telegram to sign in.'
        : 'Could not establish a CARAVAN session.';

  return (
    <main className="shell shell--centered">
      <section className="panel hero-panel" aria-labelledby="caravan-title">
        <p className="eyebrow">Trade routes. Real opponents.</p>
        <h1 id="caravan-title">CARAVAN</h1>
        <p className="status">{status}</p>
      </section>
    </main>
  );
}
