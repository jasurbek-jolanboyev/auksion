FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev
COPY apps/api apps/api
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
WORKDIR /app/apps/api
USER node
EXPOSE 4100
CMD ["node", "src/server.js"]
