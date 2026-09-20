# The whole thing in one image: the site, the server, and nothing else. There
# is no install step, because there is nothing to install — the server uses
# only what Node already has.
FROM node:22-alpine

# su-exec is here for one job: a mounted volume arrives owned by root, so the
# container starts as root, hands /data to the unprivileged user, and drops to
# it before running anything.
RUN apk add --no-cache su-exec

WORKDIR /app
COPY . .

ENV PORT=8090
ENV UNC_DB=/data/unc.db
VOLUME /data
EXPOSE 8090

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1

ENTRYPOINT ["/app/server/start.sh"]
