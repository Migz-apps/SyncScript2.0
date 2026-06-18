# Running SyncScript Without a Managed Central Server

You do **not** need to run a permanent server 24/7. SyncScript is designed so **one participant hosts signaling for the session**, and **data sync goes peer-to-peer** after the room is joined.

---

## How it works (3 layers)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1 — Signaling (ephemeral, low bandwidth)             │
│  Room create/join, WebRTC handshake, chat metadata          │
│  Hosted by: session creator OR ephemeral Codespace          │
└──────────────────────────┬──────────────────────────────────┘
                           │ WebRTC handshake
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 2 — P2P data plane (WebRTC mesh)                     │
│  File edits, cursors, most sync traffic                     │
│  Goes directly between VS Code peers                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ fallback if NAT blocks P2P
┌──────────────────────────▼──────────────────────────────────┐
│  Layer 3 — WebSocket relay (signaling server)               │
│  Only when P2P cannot connect                               │
└─────────────────────────────────────────────────────────────┘
```

**User code is not stored on a central server** — the signaling server handles room membership and handshake messages. File content flows P2P when WebRTC connects.

---

## Option 1 — Peer-hosted signaling (recommended, zero cloud)

Any collaborator with the repo can host for the duration of a session.

### Steps

1. **Host** runs:
   ```bash
   npm run start:stack
   ```
   Or in VS Code: **SyncScript: Start Local Signaling (Peer Host)**

2. **Host** shares their signaling URL:
   - Same LAN: `ws://192.168.x.x:4444`
   - Over internet: port forwarding, ngrok, or Tailscale

3. **Guests** set `syncscript.signalingUrl` to that URL

4. **Host** creates room; guests join with room ID + password

5. When the session ends, host presses `Ctrl+C` — server stops. Nothing to maintain.

**Intended result:** Full collaboration with no third-party infrastructure.

### VS Code command path

| Step | Command | Intended result |
|------|---------|-----------------|
| 1 | `SyncScript: Start Local Signaling (Peer Host)` | Server on `ws://localhost:4444`; setting auto-updated |
| 2 | Share URL with team | Guests can connect |
| 3 | `SyncScript: Create Room` | Room active |
| 4 | Guests: `SyncScript: Join Room` | P2P mesh establishes |
| 5 | `SyncScript: Stop Local Signaling` | Server stops when done |

---

## Option 2 — Ephemeral GitHub Codespace (no PC resources)

Create a Codespace per session, start the stack, share the forwarded URL, delete when done.

**You don't manage a server** — GitHub provides the VM; you only create and delete the Codespace per session.

See **[GITHUB-CODESPACES.md](GITHUB-CODESPACES.md)** for step-by-step instructions with intended results for every step.

---

## Option 3 — Memory-only signaling (simplest, no Redis)

```bash
npm run start:signaling
```

Without `REDIS_URL`, the server uses in-memory state.

| Pros | Cons |
|------|------|
| Lowest resource use | Room state lost on restart |
| One command | No multi-pod scaling |
| Fine for 2–5 users | No persistence across crashes |

**Intended result:** Perfect for quick pair programming on a laptop.

---

## Option 4 — Redis without managing infrastructure

Redis is **optional**. Use it when you want room persistence across signaling restarts.

| Where | How | Who manages Redis |
|-------|-----|-------------------|
| Codespace | Included in `.devcontainer/docker-compose.yml` | GitHub (ephemeral) |
| Your PC | `docker compose up -d redis` then `npm run start:stack` | You, only during session |
| Skip Redis | `npm run start:signaling` | Nobody |

---

## Security without a central trust anchor

| Control | What it does |
|---------|--------------|
| **Room password** | Required to join |
| **Join approval** | Host approves guests (waiting room) |
| **E2E encryption** | Set `syncscript.encryptionKey` — server cannot read file content |
| **Roles** | host / editor / viewer permissions |
| **`.syncignore`** | Blocks secrets and binaries from sync |

---

## Drawbacks of decentralized / peer-hosted mode

| Drawback | Mitigation |
|----------|------------|
| Host must keep machine awake | Use ephemeral Codespace instead |
| Host IP may change | Use invite link with updated server param |
| NAT may block P2P | Automatic WebSocket fallback (still works, slightly higher latency) |
| No 24/7 room URLs | Create room per session (by design) |
| Guest needs reachable signaling URL | Codespace public port or ngrok/Tailscale |
| VSIX-only users need host with repo | Host runs signaling; guests only need VSIX + URL |

---

## What you do NOT need

- A paid VPS running forever
- Docker on your PC (optional)
- Redis in production (optional)
- JetBrains IDE (not supported — VS Code only)

---

## Quick decision guide

| Your situation | Use |
|----------------|-----|
| Weak PC, testing once | GitHub Codespaces ([guide](GITHUB-CODESPACES.md)) |
| Regular pair programming | Peer-hosted `npm run start:stack` on stronger machine |
| Solo dev, two VS Code windows | `npm run start:signaling` locally |
| Remote friend, no server admin | Codespace for 1 hour, share WSS URL, delete after |
| Maximum privacy | Peer host + `syncscript.encryptionKey` + LAN/Tailscale |
