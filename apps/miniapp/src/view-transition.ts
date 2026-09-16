import { flushSync } from 'react-dom';
import { shouldReduceMotion } from './presentation.js';

let activeTransition: ViewTransition | null = null;

export function commitPresentationUpdate(update: () => void): void {
  if (typeof document === 'undefined' || shouldReduceMotion()) {
    flushSync(update);
    return;
  }

  if (typeof document.startViewTransition !== 'function') {
    flushSync(update);
    return;
  }

  activeTransition?.skipTransition();

  try {
    const transition = document.startViewTransition(() => flushSync(update));
    activeTransition = transition;
    void transition.finished
      .catch(() => undefined)
      .finally(() => {
        if (activeTransition === transition) activeTransition = null;
      });
  } catch {
    flushSync(update);
  }
}
