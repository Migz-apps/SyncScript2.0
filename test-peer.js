const WebSocket = require('ws');
// Connect to your signaling server
const ws = new WebSocket('ws://localhost:4444');

ws.on('open', () => {
    console.log("✅ Peer B (Simulation) Connected!");
    // Send an initial message to Peer A (VS Code)
    const initialMessage = { 
        type: 'sync', 
        data: '// Connection Established: Peer B is watching...' 
    };
    ws.send(JSON.stringify(initialMessage));
});

ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'sync') {
        console.log("📥 Received from VS Code:", message.data);
    }
});

ws.on('error', (err) => console.error("❌ Connection Error:", err));