# Testing SyncScript Without Docker

You do **not** need Docker. These methods are free and work on low-resource machines.

---

## Method 1: Local Node.js only (recommended — zero cloud setup)

The signaling server runs in **memory mode** without Redis when `REDIS_URL` is unset.

### Step 1 — Install dependencies

```bash
git clone https://github.com/Migz-apps/SyncScript2.0.git
cd SyncScript2.0
npm install
```

### Step 2 — Build

```bash
npm run build
```

### Step 3 — Start the signaling server (Terminal 1)

**With Redis (recommended if Docker is available):**

```bash
npm run start:stack
```

**Intended result:** Redis starts (if Docker/redis-cli available), then signaling on port **4444** with `health/ready` = `ready`.

**Without Redis (lowest resource use):**

```bash
npm run start:signaling
```

**Intended result:** `signaling_server_started` on port **4444** (in-memory mode).

### Step 4 — Package & install the extension (Terminal 2)

```bash
npm run package:vsix
```

In VS Code: **Extensions** → **...** → **Install from VSIX** → select `artifacts/syncscript.vsix`.

### Step 5 — Configure VS Code

Open Settings (`Ctrl+,`) and set:

```json
{
  "syncscript.signalingUrl": "ws://localhost:4444"
}
```

### Step 6 — Test with two windows

1. Open a folder in VS Code (Window A)
2. **File → New Window** (Window B) → open the same or another folder
3. In both windows: open **SyncScript** sidebar → **Create Room** (A) / **Join Room** (B)
4. Edit a file in one window — changes appear in the other

### Step 7 — Run automated tests

```bash
npm test
```

### Optional — Browser viewer (no VS Code needed for guest)

Open: `http://localhost:4444/viewer`

### Optional — Admin dashboard

Open: `http://localhost:4444/admin`

---

## Method 2: GitHub Codespaces (free cloud VM, Redis included)

Use this if your PC is too slow to run the server locally. **Full step-by-step guide with intended results for every step:**

**[docs/GITHUB-CODESPACES.md](GITHUB-CODESPACES.md)**

Quick summary:

1. Push repo → Create Codespace on `main`
2. **Intended result:** Redis running (`redis-cli ping` → `PONG`), project built
3. `npm run start:stack` — **Intended result:** signaling on 4444 with Redis persistence
4. `npm run package:vsix` → install VSIX
5. Two windows or remote friend joins via `wss://YOUR-CODESPACE-4444.app.github.dev`

**No permanent server to manage** — delete the Codespace when done. See also **[DECENTRALIZED-OPERATION.md](DECENTRALIZED-OPERATION.md)**.

---

## Method 3: Render.com free hosting (always-on public server)

Host the signaling server in the cloud for free (spins down after 15 min idle on free tier).

### Step 1 — Push repo to GitHub

(Same as Method 2, Step 1)

### Step 2 — Create Render account

1. Go to [https://render.com](https://render.com) → sign up with GitHub (free)

### Step 3 — Deploy from `render.yaml`

1. In Render dashboard: **New** → **Blueprint**
2. Connect your GitHub repo
3. Render reads `render.yaml` at the repo root and deploys automatically

### Step 4 — Copy your public URL

After deploy, Render gives you a URL like:

```
https://syncscript-signaling.onrender.com
```

### Step 5 — Configure VS Code extension on your PC

```json
{
  "syncscript.signalingUrl": "wss://syncscript-signaling.onrender.com"
}
```

> Render supports WebSockets on free web services.

### Step 6 — Test

- Window A creates a room on your PC
- Window B (or a friend's PC) joins using the room ID + password
- Browser viewer: `https://syncscript-signaling.onrender.com/viewer`

---

## Method 4: GitHub Actions (automated smoke test, no local run)

Every push/PR already runs:

```bash
npm run lint
npm run typecheck
npm test
npm run package:vsix
```

To also run the live WebSocket integration test in CI, set `SIGNALING_URL` in the workflow (already configured to skip gracefully if server is offline).

View results: **GitHub repo → Actions tab**.

---

## Quick comparison

| Method | Cost | Local CPU | Best for |
|--------|------|-----------|----------|
| Local Node.js | Free | Low | Daily dev on your machine |
| GitHub Codespaces | Free tier | None | Weak PC, quick demos |
| Render.com | Free tier | None | Sharing with remote teammates |
| GitHub Actions | Free | None | Automated CI only |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on connect | Start server: `npm run start:signaling` |
| Extension not loading | Reinstall VSIX after `npm run package:vsix` |
| WSS vs WS mismatch | Local = `ws://`, cloud HTTPS = `wss://` |
| Port 4444 in use | Set `PORT=4445` env var and update `syncscript.signalingUrl` |
| No folder open error | **File → Open Folder** before creating a room |

---

## v2 features to verify manually

| Feature | How to test |
|---------|-------------|
| WebRTC P2P mesh | Join room with 2+ users → "P2P mesh active (N peer channels)" |
| Shared debugging | F5 in Window A → Window B auto-follows; breakpoints mirror |
| Shared terminal | `Open Shared Terminal` + run commands → output in collaborator's shared terminal |
| Room chat | Type in chat box in sidebar when in room |
| Annotations | Command: `SyncScript: Add Annotation` |
| Recording playback | Record → export → replay (files, chat, cursors, annotations) |
| Browser viewer | Open `/viewer` on server URL |
| GitHub SSO | `SyncScript: Sign In with GitHub` (server: `GITHUB_OAUTH_ENABLED=true`) |
| Peer-hosted signaling | `SyncScript: Start Local Signaling` — no cloud server needed |
