# SyncScript P2P

SyncScript is a VS Code extension for real-time, room-based workspace collaboration. It pairs a lightweight signaling server with a peer-to-peer sync model so teammates can coordinate changes without relying on a heavy hosted editor.

## Features

- Create or join collaboration rooms directly from the SyncScript sidebar
- Sync file changes in real time between connected peers
- Compare workspace structure with peer manifests
- Manage room shutdown with admin-only deactivation controls
- Point the extension at a local, staging, or production signaling server

## Requirements

- Visual Studio Code `1.85.0` or newer
- A reachable SyncScript signaling server

## Extension Settings

This extension contributes the following setting:

- `syncscript.signalingUrl`: WebSocket endpoint used by the extension to connect to the SyncScript signaling server

Example:

```json
{
  "syncscript.signalingUrl": "wss://syncscript.example.com"
}
```

For local development, the default remains:

```json
{
  "syncscript.signalingUrl": "ws://localhost:4444"
}
```

## Usage

1. Open a workspace folder in VS Code.
2. Open the SyncScript view from the activity bar.
3. Create a room or join an existing room.
4. Share the room ID and security key with collaborators.
5. Start editing files and use the sync tools in the sidebar when needed.

## Production Notes

- Use `wss://` for production deployments behind TLS.
- The signaling server can be deployed with Docker, Kubernetes, Redis-backed state, and GitHub Actions CI/CD.
- Prometheus metrics, health checks, and structured logs are supported by the server runtime.

## Support

- Repository: https://github.com/Migz-apps/SyncScript2.0
- Issues: https://github.com/Migz-apps/SyncScript2.0/issues
