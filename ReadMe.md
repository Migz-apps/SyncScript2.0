# SyncScript

Self-hosted real-time collaborative coding for **Cursor** and VS Code — a Live Share alternative.

## Install the extension (Cursor)

Search **SyncScript** in Cursor Extensions, or install from Open VSX:

**[https://open-vsx.org/extension/migz-apps/syncscript](https://open-vsx.org/extension/migz-apps/syncscript)**

Hosted signaling server (default for the extension):

**[https://syncscript-signaling.onrender.com](https://syncscript-signaling.onrender.com)** · WebSocket: `wss://syncscript-signaling.onrender.com`

## Feature Complete (v2.0.0)

### Collaboration
- Real-time text sync with workspace-relative paths (cross-machine)
- Operational Transform (OT) conflict merging via diff-match-patch
- File create, delete, rename synchronization
- Lazy file hydration on first edit
- Initial workspace bootstrap + manifest comparison
- End-to-end encryption (`syncscript.encryptionKey`)

### Presence
- Remote cursors, selections, and typing indicators
- Follow user mode
- Per-line edit attribution in gutter
- Open file for all participants
- Presenter mode role

### Security
- `.syncignore` + automatic secret/binary blocking
- Join approval waiting room
- Role-based permissions: host, co-host, editor, viewer, presenter
- Room key rotation
- API key + GitHub OAuth auth on server
- IP allowlisting (`ALLOWED_IPS`)
- Rate limiting + 512KB message cap

### Developer Workflow
- Git branch mismatch warnings
- Shared diagnostics relay
- Shared task/test output relay
- Port forwarding with HTTP tunnel proxy
- Terminal output relay
- Format-on-save coordination
- Dev Container detection
- Extension compatibility warnings
- Multi-root workspace support
- Selective sync paths

### Session Management
- Auto-rejoin after disconnect
- Session history + invite deep links
- Session recording + export
- Scheduled sessions
- Organization namespaces (`syncscript.orgId`)
- Session summary on exit

### Server & DevOps
- Redis-backed multi-pod signaling
- Admin dashboard (`/admin`)
- Browser read-only viewer (`/viewer`)
- Audit log (`/audit`) + webhook endpoint
- Redis backup export (`/admin/backup`)
- Prometheus metrics + Grafana dashboard
- Docker Compose + Kubernetes + Helm + Terraform
- CLI for headless room creation
- GitHub Actions CI/CD

## Quick Start (No Docker)

```bash
npm install
npm run build
npm run start:signaling    # Terminal 1 — signaling server
npm run package:vsix       # Terminal 2 — build extension
npm test
```

Install in **Cursor**: Extensions → search **SyncScript**, or **Install from VSIX** (`artifacts/syncscript.vsix`).

**Documentation:**
- **[docs/TESTING-WITHOUT-DOCKER.md](docs/TESTING-WITHOUT-DOCKER.md)** — local, Render, CI (no Docker on your PC)
- **[docs/GITHUB-CODESPACES.md](docs/GITHUB-CODESPACES.md)** — full Codespaces guide with Redis + intended results per step
- **[docs/DECENTRALIZED-OPERATION.md](docs/DECENTRALIZED-OPERATION.md)** — run without managing a permanent server

```bash
npm run start:stack   # Redis + signaling (when Redis is available)
```

## v2.0.0 Features

- **WebRTC P2P mesh** — multi-peer data channels; falls back to WebSocket
- **Shared debugging** — auto-follow debug location, mirrored breakpoints
- **Room chat** — in-sidebar chat panel
- **Code annotations** — non-destructive review comments on lines
- **Session recording playback** — replay file changes, chat, cursors, annotations
- **Shared terminal** — relay output to **SyncScript Shared** terminal
- **GitHub SSO** — `SyncScript: Sign In with GitHub`
- **Peer-hosted signaling** — `SyncScript: Start Local Signaling (Peer Host)`

## Quick Start (Docker — optional)

```bash
docker compose up --build redis signaling
```

## Browser Viewer

Open `https://syncscript-signaling.onrender.com/viewer` (cloud) or `http://localhost:4444/viewer` (local).

## Admin Dashboard

Open `https://syncscript-signaling.onrender.com/admin` (cloud) or `http://localhost:4444/admin` (local).

## Configuration

```json
{
  "syncscript.signalingUrl": "wss://syncscript-signaling.onrender.com",
  "syncscript.displayName": "Your Name",
  "syncscript.encryptionKey": "shared-secret",
  "syncscript.orgId": "acme",
  "syncscript.authToken": "your-api-key",
  "syncscript.syncPaths": ["src"]
}
```

## Server Environment

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection |
| `API_KEYS` | Comma-separated API keys |
| `GITHUB_OAUTH_ENABLED` | Enable GitHub token auth |
| `ALLOWED_IPS` | IP allowlist |

## Tests

```bash
npm test                    # unit tests
docker compose --profile test up --build   # Smoke test
SIGNALING_URL=ws://localhost:4444 npm test --workspace signaling  # Live integration
```

## License

See [LICENSE](LICENSE).
