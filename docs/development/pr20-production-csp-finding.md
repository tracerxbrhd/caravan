# PR20 production finding: Telegram bridge CSP

The first production Telegram acceptance pass after PR19 confirmed that the Mini App HTML now loads Telegram's official `telegram-web-app.js` before application bootstrap, but the production Content Security Policy still allowed scripts only from the CARAVAN origin.

That policy blocked `https://telegram.org/js/telegram-web-app.js` in the real Telegram WebView, leaving `window.Telegram.WebApp.initData` unavailable to the application and keeping bootstrap in the Telegram-required state.

The production CSP therefore explicitly allows scripts from `https://telegram.org` while retaining the existing self-only policy for all other script origins.

A regression test reads the production Caddy configuration together with the Mini App shell so future changes cannot reintroduce the mismatch between the required Telegram bridge and the deployed CSP.
