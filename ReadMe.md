# SyncScript P2P

**SyncScript** is a real-time, peer-to-peer collaborative coding extension for VS Code. It allows developers to sync their workspaces directly without relying on heavy third-party cloud services.

## 💡 Sole Creator & Engineer
This entire project—from the P2P signaling architecture to the VS Code integration—was **Solely Created, Developed & Engineered by MAZIMPAKA Miguel**.

## 🚀 Features
- **Real-time Sync**: Instantaneous code synchronization across different VS Code instances.
- **P2P Architecture**: Utilizes a custom signaling server for direct peer communication.
- **Dynamic Watermarking**: Integrated "Solely Created by MAZIMPAKA Miguel" visual signatures.
- **Lightweight**: Zero-latency design optimized for developer productivity.

## 🛠️ Tech Stack
- **Frontend**: VS Code Extension API, TypeScript, HTML/CSS.
- **Communication**: WebSocket (ws) & Socket.io.
- **Backend**: Node.js Signaling Server.

## ⚙️ Setup
1. Clone the repository.
2. Run `npm install` in both `/extension` and `/signaling` folders.
3. Start the server: `cd signaling && node server.js`.
4. Launch the extension in VS Code (F5).