const WebSocket = require('ws');
const http = require('http');

const port = process.env.PORT || 4444;

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('SyncScript Signaling Server is Online');
});

const wss = new WebSocket.Server({ server });
const topics = new Map();

wss.on('connection', (ws) => {
    console.log('📡 New peer joined the lobby');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, topic, content, sender } = data;

            // 1. Subscription Logic
            if (type === 'subscribe' && topic) {
                if (!topics.has(topic)) topics.set(topic, new Set());
                topics.get(topic).add(ws);
                console.log(`✅ Peer [${sender || 'Unknown'}] subscribed to: ${topic}`);
                return; // End here for subscription messages
            }

            // 2. Logging Code Updates to Terminal
            if (type === 'code-update') {
                console.log(`------------------------------------------`);
                console.log(`✍️  Incoming sync from: ${sender || 'Anonymous'}`);
                console.log(`📄 Code Content:\n${content}`);
                console.log(`------------------------------------------`);
            }

            // 3. Broadcast to all other subscribers in the topic
            const targetTopic = topic || 'general';
            const subscribers = topics.get(targetTopic);
            
            if (subscribers) {
                subscribers.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(message.toString());
                    }
                });
            }
        } catch (e) {
            console.error("❌ Broadcast error or invalid JSON:", e.message);
        }
    });

    ws.on('close', () => {
        console.log('🔌 Peer disconnected');
        // Clean up the disconnected socket from all topics
        topics.forEach(clients => clients.delete(ws));
    });
});

server.listen(port, () => {
    console.log('------------------------------------------');
    console.log(`🚀 SyncScript Signaling: ACTIVE`);
    console.log(`📡 URL: ws://localhost:${port}`);
    console.log(`👨‍💻 Engineer: MAZIMPAKA Miguel`);
    console.log('------------------------------------------');
});