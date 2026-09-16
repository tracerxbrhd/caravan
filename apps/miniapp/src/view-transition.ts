import { flushSync } from 'react-dom';
import { shouldReduceMotion } from './presentation.js';

interface BrowserViewTransition {
  readonly finished: Promise<void>;
  skipTransition(): void;
}

interface ViewTransitionDocument extends Document {
  startViewTransition?(update: () => void): BrowserViewTransition;
}

let activeTransition: BrowserViewTransition | null = null;

export function commitPresentationUpdate(update: () => void): void {
  if (typeof document === 'undefined' || shouldReduceMotion()) {
    flushSync(update);
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;
  const startViewTransition = transitionDocument.startViewTransition;
  if (startViewTransition === undefined) {
    flushSync(update);
    return;
  }

  activeTransition?.skipTransition();

  try {
    const transition = startViewTransition.call(transitionDocument, () => flushSync(update));
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
