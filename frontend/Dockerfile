FROM node:22-alpine
ARG NEXT_PUBLIC_APP_URL
WORKDIR /app
COPY package.json .
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY . .
RUN yarn build
EXPOSE 80
CMD ["npx", "next", "start", "-p", "80"]
