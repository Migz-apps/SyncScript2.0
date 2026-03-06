SyncScript P2P 🏕️
SyncScript is a decentralized, peer-to-peer collaborative coding extension for VS Code. It creates a "Campfire" environment where developers can sync code in real-time without relying on a central data server.

🚀 The Vision
Unlike traditional collaboration tools that store your keystrokes on a cloud server, SyncScript uses WebRTC and Yjs to create a direct link between editors.

Privacy First: Your code stays between you and your peers.

Low Latency: P2P connections mean faster sync times.

Minimal Footprint: A tiny signaling server acts as a "matchmaker" to help peers find each other, then steps out of the way.

🛠️ Project Structure
The project is split into three clean modules to ensure stability and performance:

/extension: The VS Code Host "Brain" that manages the editor interface.

/webview: The P2P Engine and Sidebar UI (The "Campfire" interface).

/signaling: A lightweight Node.js server for P2P handshaking.

⚙️ Setup & Development
1. Initialize the project
PowerShell
# Install extension dependencies
cd extension
npm install
npm run compile

# Install signaling dependencies
cd ../signaling
npm install
2. Launch the Environment
Open the project in VS Code.

Press F5 and select "Full SyncScript Launch".

This will automatically:

Start the Signaling Server via nodemon.

Launch a new Extension Development Host window.

🛡️ Features
[x] Real-time Signaling: Stable connection via WebSocket matchmaker.

[x] Custom Branding: Integrated "Powered by" watermark in the editor.

[x] P2P Sidebar: Dedicated view for connection status and peer discovery.

[ ] CRDT Sync: (Coming Soon) Fully collaborative text editing.

👨‍💻 Author
Developed and Maintained by MAZIMPAKA Miguel Project Architecture: P2P-First Collaborative Environment

Why a README matters right now:
Documentation: When we come back tomorrow, you won't have to remember which folder to run npm install in.

Professionalism: If you ever push this to GitHub, this is the first thing people see. It proves you aren't just "coding," you are "engineering."

Would you like me to help you add a "How it Works" diagram or a specific "License" section to this file?