# PipeForge deployment — pipeforge.shariar.dev

PipeForge is a Next.js app served by a small Node server in Docker, behind Caddy
(automatic HTTPS). No database — all state lives in the user's browser.

## One-time DNS

Add an **A record**: `pipeforge.shariar.dev` → your VPS IP (same place where
`price.shariar.dev` is registered). Caddy then issues the TLS cert automatically
on first request.

## First deploy on the VPS

```bash
cd /opt
git clone <your-github-repo-url> pipeforge
cd pipeforge
```

### Scenario A — this VPS already runs price.shariar.dev's Caddy (most likely)

Only one process may bind ports 80/443, so reuse the existing Caddy:

1. Start just the app: `docker compose up -d --build web`
2. Find the shared network: `docker network ls | grep caddy` (or check the
   price-shariar compose network, e.g. `price-shariar_default`)
3. Attach pipeforge-web to it:
   ```bash
   docker network connect <shared-network> pipeforge-web-1
   ```
4. Add to the **existing** Caddyfile (the one price.shariar.dev uses):
   ```
   pipeforge.shariar.dev {
       reverse_proxy pipeforge-web-1:3000
       encode zstd gzip
   }
   ```
5. Reload Caddy: `docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile`

To make the attach permanent, add to this repo's `docker-compose.yml` under `web`:

```yaml
    networks:
      - default
      - shared_proxy
networks:
  shared_proxy:
    external: true
    name: <shared-network>
```

### Scenario B — PipeForge is alone on the server

```bash
docker compose --profile proxy up -d --build
```

## Auto-deploy on git push (optional)

The repo includes `.github/workflows/deploy.yml`. Add these repo secrets on
GitHub (Settings → Secrets and variables → Actions):

- `VPS_HOST` — VPS IP
- `VPS_USER` — ssh user
- `VPS_SSH_KEY` — private key with access

Every push to `main` then pulls + rebuilds on the VPS. (If using Scenario A,
reload Caddy only when the Caddyfile changes — normally not needed.)

## CAD export formats (DXF / PDF / IFC / DWG)

All exporters run **client-side** — the Docker image needs nothing extra.
DWG is the one exception by design: it is a closed Autodesk format with no
legitimate open-source writer, and the **ODA File Converter** (the standard
DXF→DWG bridge) cannot be bundled in the image (manual download + license
agreement, Windows/GUI-centric). The app therefore exports DXF and flags the
one-click conversion step to the user. If server-side DWG is ever required,
provision ODA File Converter on the host and add a small conversion endpoint —
do not silently stub it.

## Verify

```bash
docker compose ps
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000  # on the VPS
# then open https://pipeforge.shariar.dev
```
