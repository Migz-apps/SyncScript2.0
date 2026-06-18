# Devcontainer profiles

## Fast (default) — `devcontainer.json`

- Single Node 20 image
- `postCreateCommand`: `npm install` only (~3 min)
- **No Redis** — use `npm run start:signaling` (memory mode)
- **Best for:** first-time testing, weak patience, quick demos

**Typical first Codespace time: 5–10 minutes**

## Full (Redis) — `devcontainer.redis.json`

To use this profile:

1. Copy `devcontainer.redis.json` over `devcontainer.json`
2. Rebuild the Codespace

- Docker Compose: Node app + Redis image pull
- `postCreateCommand`: `npm install` only
- Use `npm run start:stack` for Redis-backed signaling

**Typical first Codespace time: 10–20 minutes** (Docker image pulls)

## Enable prebuilds (repeat visits in ~30s)

GitHub → your repo → **Settings** → **Codespaces** → **Set up prebuild** → branch `main`.

Prebuild runs `npm install` ahead of time so you skip it on every new Codespace.
