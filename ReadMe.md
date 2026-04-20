# SyncScript

SyncScript is a real-time collaborative VS Code extension backed by a lightweight WebSocket signaling server and a peer-to-peer collaboration model.

## What Changed

- The signaling server is now environment-driven instead of hardcoded to `ws://localhost:4444`.
- Redis-backed room and user state allows room recovery across server restarts and supports multi-pod signaling fan-out.
- Health, readiness, and Prometheus metrics endpoints are available at `/health/live`, `/health/ready`, and `/metrics`.
- Docker Compose can spin up the signaling server, Redis, and mock clients for local smoke tests.
- Kubernetes manifests now include Redis, a production deployment, health probes, ingress, and HPA.
- GitHub Actions now lint, type-check, package the extension as a `.vsix`, and build/publish the signaling image.

## Local Development

Install dependencies once from the repo root:

```bash
npm install
```

Build everything:

```bash
npm run build
```

Package the VS Code extension:

```bash
npm run package:vsix
```

## Docker Compose

Start the signaling stack:

```bash
docker compose up --build signaling redis
```

Run the local smoke test with mock clients:

```bash
docker compose --profile test up --build
```

Run Prometheus and Grafana alongside the signaling server:

```bash
docker compose --profile observability up --build
```

## VS Code Extension Configuration

Set the signaling endpoint from VS Code settings:

```json
"syncscript.signalingUrl": "wss://syncscript.example.com"
```

The default value remains `ws://localhost:4444` for local development.

## Kubernetes

Apply the manifests in order:

```bash
kubectl apply -f infra/k8s/namespace.yml
kubectl apply -f infra/k8s/redis.yml
kubectl apply -f infra/k8s/signaling.yml
```

Update the image in [infra/k8s/signaling.yml](/c:/Users/user/Downloads/github/SyncScript/infra/k8s/signaling.yml:38) before deploying.

## Observability

- Logs are emitted as structured JSON through Winston so they can flow into ELK-compatible collectors.
- Prometheus scrapes `/metrics`.
- Grafana is pre-provisioned with a Prometheus datasource for local dashboards.

## Repository Layout

- [extension/package.json](/c:/Users/user/Downloads/github/SyncScript/extension/package.json:1): extension build, VSIX packaging, and settings
- [signaling/src/server.ts](/c:/Users/user/Downloads/github/SyncScript/signaling/src/server.ts:1): signaling runtime, health, metrics, and distributed room events
- [docker-compose.yml](/c:/Users/user/Downloads/github/SyncScript/docker-compose.yml:1): local orchestration with Redis, mock clients, and observability profiles
- [infra/k8s/signaling.yml](/c:/Users/user/Downloads/github/SyncScript/infra/k8s/signaling.yml:1): production deployment, service, ingress, and HPA
- [.github/workflows/ci-cd.yml](/c:/Users/user/Downloads/github/SyncScript/.github/workflows/ci-cd.yml:1): CI/CD pipeline
