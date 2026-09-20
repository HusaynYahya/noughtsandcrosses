# The whole thing in one image: the site, the server, and nothing else. No
# install step, because there is nothing to install — the server uses only what
# Node already has.
FROM node:22-alpine

WORKDIR /app
COPY . .

# Where the database lives. Mount a volume here or the games go when the
# container does.
ENV UNC_DB=/data/unc.db
ENV PORT=8090
VOLUME /data
EXPOSE 8090

# Run as somebody other than root, and let that somebody write to /data.
RUN mkdir -p /data && chown -R node:node /data /app
USER node

HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://127.0.0.1:8090/api/health || exit 1

CMD ["node", "server/index.js"]
