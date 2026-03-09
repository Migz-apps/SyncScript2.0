const WebSocket = require('ws');
const readline = require('readline'); // Added for terminal input

// Connect to your signaling server running on port 4444
const ws = new WebSocket('ws://localhost:4444');

// Setup the terminal interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'MIGUEL-SYNC> '
});

ws.on('open', () => {
    console.log('✅ Connected to Signaling Server');
    
    // 1. Subscribe to the 'general' topic to match Window A
    ws.send(JSON.stringify({ 
        type: 'subscribe', 
        topic: 'general',
        sender: 'Headless-Peer'
    }));

    console.log('\n--- INTERACTIVE MODE ---');
    console.log('Type a line of code and press ENTER to sync it to Window A.');
    console.log('This will prevent the "auto-deleting" glitch.\n');
    rl.prompt();
});

// 2. This triggers ONLY when you press the Enter key in your terminal
rl.on('line', (line) => {
    if (line.trim()) {
        const testMessage = {
            type: "code-update", 
            topic: "general",
            content: line, 
            sender: "External-Peer" // Match this with the filter in ws.on('message')
        };
        
        ws.send(JSON.stringify(testMessage));
        console.log(`📤 Synced: "${line}"`);
    }
    rl.prompt();
});

// Handle incoming messages (what you type in Window A)
ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data.toString());
        
        // Only log if the message is from Window A (not our own echoes)
        if (msg.type === 'code-update' && msg.sender !== "External-Peer") {
            // Clear current prompt to print the incoming message cleanly
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            
            console.log(`\n📥 Received from Window A (${msg.sender}):`);
            console.log(`> ${msg.content}\n`);
            
            rl.prompt();
        }
    } catch (err) {
        console.error("❌ Parse error:", err);
    }
});

ws.on('error', (err) => {
    console.error("❌ Connection Error:", err.message);
    console.log("Make sure your Signaling Server is running (F5) before starting this script.");
});

ws.on('close', () => {
    console.log('\n🔌 Peer B disconnected from server.');
    process.exit();
});