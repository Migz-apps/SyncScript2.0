const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 4444;

// Create a standard HTTP server to "anchor" the process
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('SyncScript Signaling is Online');
});

const wss = new WebSocket.Server({ server });

const topics = new Map();

wss.on('connection', (ws) => {
    console.log('📡 New peer joined the lobby');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, topic } = data;

            if (type === 'subscribe' && topic) {
                if (!topics.has(topic)) topics.set(topic, new Set());
                topics.get(topic).add(ws);
            }

            const subscribers = topics.get(topic);
            if (subscribers) {
                subscribers.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message);
                    }
                });
            }
        } catch (e) { /* Ignore sync noise */ }
    });

    ws.on('close', () => {
        console.log('🔌 Peer disconnected');
        topics.forEach(clients => clients.delete(ws));
    });
});

// Start the server
server.listen(port, () => {
    console.log('------------------------------------------');
    console.log(`🚀 SyncScript Signaling: ACTIVE`);
    console.log(`📡 URL: ws://localhost:${port}`);
    console.log(`📅 Started at: ${new Date().toLocaleTimeString()}`);
    console.log('------------------------------------------');
});

// Keep the process from exiting
process.stdin.resume();