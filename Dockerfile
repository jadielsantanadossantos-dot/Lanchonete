# Imagem para VPS/Docker ou Custom Docker Image no Shard Cloud.
FROM node:20-alpine

# dumb-init, timezone, wget (healthcheck) e setcap (porta 80 sem root)
RUN apk add --no-cache dumb-init tzdata wget libcap && \
    setcap 'cap_net_bind_service=+ep' /usr/local/bin/node
ENV TZ=America/Sao_Paulo \
    NODE_ENV=production \
    PORT=80

WORKDIR /app

# Usuário sem privilégios
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

COPY --chown=nodejs:nodejs . .

# Uploads locais (volume persistente em /app/public/uploads)
RUN mkdir -p /app/public/uploads && \
    chown -R nodejs:nodejs /app/public/uploads

USER nodejs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD-SHELL wget --no-verbose --tries=1 --spider "http://127.0.0.1:${PORT:-80}/health" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
