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
    ws.subscribedTopics = new Set();
    ws.username = 'Anonymous';
    
    console.log('📡 New peer connected');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const { type, topic, sender } = data;

            if (sender) ws.username = sender;

            if (type === 'subscribe' && topic) {
                if (!topics.has(topic)) topics.set(topic, new Set());
                topics.get(topic).add(ws);
                ws.subscribedTopics.add(topic);
                console.log(`✅ ${ws.username} joined: ${topic}`);
                return;
            }

            // Code Update Broadcasting
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
            // Error handled silently
        }
    });

    ws.on('close', () => {
        ws.subscribedTopics.forEach(topicName => {
            const subscribers = topics.get(topicName);
            if (subscribers) {
                subscribers.delete(ws);
                console.log(`🔌 ${ws.username} left: ${topicName}`);
                
                subscribers.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'peer-left',
                            sender: ws.username
                        }));
                    }
                });
            }
        });
    });
});

server.listen(port, () => {
    console.log('------------------------------------------');
    console.log(`🚀 SyncScript Signaling: ACTIVE`);
    console.log(`📡 URL: ws://localhost:${port}`);
    console.log(`👨‍💻 Engineer: MAZIMPAKA Miguel`);
    console.log('------------------------------------------');
});