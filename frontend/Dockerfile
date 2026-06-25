FROM node:22-alpine AS build
WORKDIR /app
COPY package.json .
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install
COPY . .
RUN yarn build

FROM nginx:1.25-alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
