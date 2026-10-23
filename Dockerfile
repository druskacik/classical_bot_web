FROM node:24.18.0-alpine AS build

WORKDIR /usr/src/nuxt-app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:24.18.0-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /usr/src/nuxt-app

COPY --from=build --chown=node:node /usr/src/nuxt-app/.output ./.output

USER node
EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=2s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.NITRO_PORT || process.env.PORT || 3000) + '/api/health', { signal: AbortSignal.timeout(1500), redirect: 'error' }).then(r => process.exit(r.status === 200 ? 0 : 1)).catch(() => process.exit(1))"]

CMD ["node", ".output/server/index.mjs"]
