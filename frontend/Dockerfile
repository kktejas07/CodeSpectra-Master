FROM node:22-alpine
WORKDIR /app
COPY package.json .
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY . .
RUN yarn build
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
