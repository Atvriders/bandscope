# --- build the web/PWA tier ---
# glibc (not alpine): the TypeScript 7 compiler ships native optional deps that
# may lack a musl build.
FROM node:20 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- serve static assets ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
