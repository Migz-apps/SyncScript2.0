# SyncScript Extension

Real-time collaborative coding for Visual Studio Code and Cursor — a self-hosted Live Share alternative.

## Requirements

- VS Code **1.85.0+** (or Cursor with VS Code extension support)
- **Open a workspace folder** before creating or joining a room
- Internet access (peers connect through a signaling server; file sync is peer-to-peer when possible)

## Quick start

1. Install the extension from the Marketplace.
2. Open the **SyncScript** sidebar (broadcast icon in the activity bar).
3. **Create Room** or **Join Room** with a room ID and password.
4. Share the invite link or credentials with your collaborator.

By default the extension connects to the public signaling server at `wss://syncscript-signaling.onrender.com`. No extra setup is required for remote collaboration.

> **Note:** The free hosted server may sleep after ~15 minutes of inactivity. The first connection after sleep can take up to a minute.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `syncscript.signalingUrl` | `wss://syncscript-signaling.onrender.com` | Signaling server WebSocket URL (`wss://` for cloud, `ws://localhost:4444` for local) |
| `syncscript.displayName` | (git user.name) | Name shown to collaborators |
| `syncscript.syncPaths` | `[]` | Limit sync to specific subdirectories |
| `syncscript.encryptionKey` | `""` | Optional end-to-end encryption passphrase |
| `syncscript.iceServers` | `""` | JSON array of STUN/TURN servers for strict firewalls |

## Self-hosted signaling

To run your own server instead of the default cloud host:

1. Deploy the `signaling` package (see the [main repository](https://github.com/Migz-apps/SyncScript2.0)).
2. Set `syncscript.signalingUrl` to your server, e.g. `wss://your-server.onrender.com`.

Or use **SyncScript: Start Local Signaling (Peer Host)** for local development.

## Features

- Real-time file sync and collaborative editing
- Room chat and presence
- Invite links with room ID + password
- Pull missing files from peers (Sync button)
- WebRTC peer-to-peer when NAT allows; WebSocket relay fallback

## Support

Report issues: [GitHub Issues](https://github.com/Migz-apps/SyncScript2.0/issues)

## Development

```bash
npm install
npm run compile
npm test
npm run package:vsix
```

Press **F5** in VS Code to launch the Extension Development Host.
