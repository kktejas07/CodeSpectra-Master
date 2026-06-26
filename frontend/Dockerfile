FROM node:22-alpine AS build
WORKDIR /app
COPY package.json .
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY . .
RUN yarn build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.next .next
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/public public
COPY --from=build /app/package.json .
COPY --from=build /app/next.config.mjs .
EXPOSE 80
CMD ["npx", "next", "start", "-p", "80"]
