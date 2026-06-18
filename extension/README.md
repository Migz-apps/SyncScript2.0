# SyncScript Extension

Real-time, self-hosted collaborative coding for Visual Studio Code.

## Requirements

- VS Code 1.85.0+
- A running SyncScript signaling server

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `syncscript.signalingUrl` | `ws://localhost:4444` | Signaling server WebSocket URL |
| `syncscript.displayName` | (git user.name) | Name shown to collaborators |
| `syncscript.syncPaths` | `[]` | Limit sync to specific subdirectories |

## Usage

1. Open a workspace folder
2. Open the SyncScript sidebar (activity bar broadcast icon)
3. Create or join a room
4. Share the invite link or room ID + password
5. Edit files together in real time

## Development

```bash
npm install
npm run compile
npm run watch
```

Press F5 in VS Code to launch the Extension Development Host.

## Testing

```bash
npm test
```
