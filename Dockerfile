FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global --allow-scripts=pnpm pnpm@12.4.1
COPY . .
ARG VITE_TELEGRAM_BOT_USERNAME=""
ENV VITE_TELEGRAM_BOT_USERNAME=${VITE_TELEGRAM_BOT_USERNAME}
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @caravan/server deploy --prod --legacy /out/server \
  && pnpm --filter @caravan/bot deploy --prod --legacy /out/bot

FROM node:24-bookworm-slim AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/server ./
COPY --from=build --chown=node:node /app/apps/server/migrations ./migrations
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

FROM node:24-bookworm-slim AS bot
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/bot ./
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/miniapp/dist /srv
COPY infra/caddy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
