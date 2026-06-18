# GitHub Codespaces — Full Test Guide (Redis + Signaling + Extension)

This guide runs **everything** in a free GitHub Codespace: Redis persistence, signaling server, VS Code extension, and manual collaboration tests. No Docker required on your PC.

---

## Prerequisites

| Requirement | Intended result |
|-------------|-----------------|
| GitHub account | You can create Codespaces (free tier ~60 h/month) |
| Repo pushed to GitHub | Codespace can clone your code |
| Browser + GitHub login | You can open the Codespace web editor |

---

## Phase 1 — Create the Codespace

### Step 1 — Push the repository to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/SyncScript2.0.git
git push -u origin main
```

**Intended result:** Your repo appears on GitHub with the `.devcontainer/` folder visible.

### Step 2 — Open a Codespace

1. Go to your repo on GitHub
2. Click **Code** → **Codespaces** → **Create codespace on main**
3. Wait 2–5 minutes for the VM to build

**Intended result:**
- A VS Code web editor opens in your browser
- Terminal shows `postCreateCommand` running `npm install && npm run build`
- When finished, you see compiled `signaling/dist/` and `extension/out/` folders

### Step 3 — Verify the dev environment

In the Codespace terminal:

```bash
redis-cli ping
```

**Intended result:** `PONG` — Redis is running (started by `.devcontainer/docker-compose.yml`).

```bash
curl -s http://localhost:4444/health/live
```

**Intended result:** May fail with connection refused — signaling is not started yet (expected).

---

## Phase 2 — Start Redis + Signaling Stack

### Step 4 — Start the full stack

```bash
npm run start:stack
```

Or manually:

```bash
export REDIS_URL=redis://localhost:6379
npm run build --workspace signaling
npm run start:prod --workspace signaling
```

**Intended result:**
- Terminal logs `signaling_server_started` on port **4444**
- `curl http://localhost:4444/health/ready` returns `{"status":"ready"}` (Redis connected)
- Codespaces shows a notification: **Port 4444 forwarded** — click it

### Step 5 — Confirm public URLs

In the **PORTS** tab (bottom panel), find port **4444**.

| URL type | Example | Use for |
|----------|---------|---------|
| Local | `http://localhost:4444` | Inside Codespace only |
| Forwarded HTTPS | `https://xxxx-4444.app.github.dev` | Remote collaborators, WSS |

**Intended result:** You can open `https://YOUR-CODESPACE-4444.app.github.dev/health/live` in a browser tab and see `{"status":"ok"}`.

---

## Phase 3 — Install the Extension

### Step 6 — Package the VSIX (new terminal tab)

Keep signaling running in terminal 1. Open a **second** terminal:

```bash
npm run package:vsix
```

**Intended result:** File created at `artifacts/syncscript.vsix`.

### Step 7 — Install the VSIX in Codespace VS Code

1. Extensions sidebar → `...` menu → **Install from VSIX**
2. Select `artifacts/syncscript.vsix`

**Intended result:** SyncScript appears in the Extensions list (version 2.0.0). Activity bar shows the **SyncScript** broadcast icon.

### Step 8 — Configure signaling URL

Open Settings (`Ctrl+,`) → search `syncscript.signalingUrl`:

```json
{
  "syncscript.signalingUrl": "ws://localhost:4444"
}
```

For a **remote collaborator** on another machine, they use the forwarded WSS URL:

```json
{
  "syncscript.signalingUrl": "wss://YOUR-CODESPACE-4444.app.github.dev"
}
```

**Intended result:** Status bar shows connection to signaling (or connects after opening sidebar).

---

## Phase 4 — Collaboration Test (Two Users)

### Step 9 — Open a workspace folder

**File → Open Folder** → select `/workspaces/SyncScript` (or any project folder).

**Intended result:** No warning about missing folder. Sidebar is active.

### Step 10 — Create a room (Host)

1. Open **SyncScript** sidebar
2. Click **Create Room**
3. Enter room name + password

**Intended result:**
- Sidebar shows room ID and invite link
- Status bar: `In room: <name>`
- Notification: workspace bootstrap started

### Step 11 — Join from second client

**Option A — Second VS Code window in same Codespace:**
- **File → New Window** → install same VSIX → Join Room with same ID/password

**Option B — Remote friend:**
- They install VSIX on their PC
- Set `syncscript.signalingUrl` to your `wss://...app.github.dev` URL
- Join with room ID + password

**Intended result:**
- Both sides show 2 participants
- Notification: **P2P mesh active** — file sync goes peer-to-peer after handshake
- Editing a file in Window A appears in Window B within ~1 second

### Step 12 — Test v2 features

| Feature | Action | Intended result |
|---------|--------|-----------------|
| **Chat** | Type in sidebar chat box | Message appears for all participants |
| **Annotations** | `SyncScript: Add Annotation` | Yellow gutter comment visible to all |
| **Shared terminal** | `SyncScript: Open Shared Terminal` + run commands in a normal terminal | Output appears in collaborator's **SyncScript Shared** terminal |
| **Debug sync** | Start debugger (F5) in host window | Collaborator auto-navigates to debug line; breakpoints mirror |
| **Recording** | `Start Recording` → edit → `Export Recording` → `Replay Recording` | File changes, chat, cursors replay |
| **Browser viewer** | Open `https://YOUR-CODESPACE-4444.app.github.dev/viewer` | Read-only view of room activity |
| **Admin** | Open `/admin` | Room list, metrics, audit log |
| **GitHub SSO** | `SyncScript: Sign In with GitHub` (if `GITHUB_OAUTH_ENABLED=true` on server) | Token stored; authenticated join |

### Step 13 — Run automated tests

```bash
npm test
```

**Intended result:** 20 tests pass (10 signaling + 10 extension).

---

## Phase 5 — Redis Verification

### Step 14 — Confirm Redis persistence

With signaling running and a room created:

```bash
redis-cli keys 'syncscript*'
```

**Intended result:** Keys exist for active rooms (room state persisted in Redis, not just memory).

### Step 15 — Health endpoints

```bash
curl http://localhost:4444/health/live    # always ok when server up
curl http://localhost:4444/health/ready   # ok when Redis connected
curl http://localhost:4444/metrics        # Prometheus metrics (if enabled)
```

**Intended result:** `live` = 200, `ready` = 200 with Redis, `metrics` = text/prometheus format.

---

## Drawbacks of GitHub Codespaces

| Drawback | Impact |
|----------|--------|
| **60 h/month free limit** | Long sessions consume quota; paid tier needed beyond that |
| **Codespace sleeps** | Stops after inactivity; signaling URL changes on new Codespace |
| **Cold start** | First `npm install` + build takes several minutes |
| **Public port URLs** | Forwarded URLs are guessable; use strong room passwords |
| **Not always-on** | Unlike a VPS, you must recreate/restart for each session |
| **Web VS Code limits** | Some debugger/terminal features differ from desktop VS Code |
| **NAT / WebRTC** | Strict corporate firewalls may block P2P; falls back to WebSocket relay |
| **Redis data ephemeral** | Codespace deletion wipes Redis volume |

---

## Troubleshooting

| Problem | Fix | Intended result after fix |
|---------|-----|---------------------------|
| `redis-cli: command not found` | Wait for devcontainer; Redis shares network with app container | `PONG` |
| `ECONNREFUSED` on 4444 | Run `npm run start:stack` | Server listening |
| Extension not loading | Re-run `npm run package:vsix` and reinstall | SyncScript active |
| WSS mismatch | Remote clients use `wss://`, local uses `ws://` | Connected status |
| No P2P notification | Normal behind strict NAT — sync still works via WebSocket | Edits still sync |
| Port 4444 not public | PORTS tab → right-click 4444 → **Port Visibility → Public** | Remote can connect |

---

## Cleanup

Stop signaling: `Ctrl+C` in the signaling terminal.

Delete Codespace: GitHub → Codespaces → `...` → **Delete** (frees resources, removes Redis data).

---

## Related docs

- [TESTING-WITHOUT-DOCKER.md](TESTING-WITHOUT-DOCKER.md) — all methods compared
- [DECENTRALIZED-OPERATION.md](DECENTRALIZED-OPERATION.md) — run without managing a permanent server
