FROM node:24.18.0-alpine AS build

WORKDIR /usr/src/nuxt-app

COPY package.json package-lock.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:24.18.0-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /usr/src/nuxt-app

COPY --from=build --chown=node:node /usr/src/nuxt-app/.output ./.output

USER node
EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
