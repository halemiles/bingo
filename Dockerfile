# Static site served by unprivileged nginx (runs as uid 101, listens on 8080).
# Pinned by digest for reproducible builds; bump tag and digest together.
FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chmod=755 docker/40-bingo-config.sh /docker-entrypoint.d/40-bingo-config.sh
COPY public/ /usr/share/nginx/html/

ENV AUTO_MIN_SECONDS=3 \
    AUTO_MAX_SECONDS=15 \
    AUTO_DEFAULT_SECONDS=5 \
    AUTO_STEP_SECONDS=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
