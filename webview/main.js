import * as Y from 'yjs';
import { WebRtcProvider } from 'y-webrtc';

// UI Elements
const statusText = document.getElementById('status-text');
const peerCount = document.getElementById('peer-count');
const signalIcon = document.getElementById('signal-icon');

// 1. Initialize the Shared Document
const doc = new Y.Doc();

// 2. Connect to the Campfire (Signaling Server)
// Use a hardcoded room name for now; we'll make it dynamic later.
const roomName = 'syncscript-default-room';
const provider = new WebRtcProvider(roomName, doc, { 
    signaling: ['ws://localhost:4444'] 
});

// 3. UI/UX: Update Status Based on Connection
provider.on('status', (event) => {
    console.log('Connection Status:', event.status);
    
    if (event.status === 'connected') {
        statusText.innerText = 'Campfire Active';
        signalIcon.className = 'signal-connected';
    } else {
        statusText.innerText = 'Searching for Peers...';
        signalIcon.className = 'signal-searching';
    }
});

// 4. UI/UX: Update Peer Counter
provider.on('peers', (params) => {
    // webrtcConns are the other people. Add 1 for "You".
    const totalPeers = params.webrtcConns.size + 1;
    peerCount.innerText = `${totalPeers} User(s) Nearby`;
    
    console.log('Current Peers:', params.webrtcConns);
});

// 5. Shared Data (The "Code" itself)
const yText = doc.getText('codemirror');

yText.observe(event => {
    // This will eventually trigger when someone else types!
    console.log('Document updated via P2P');
});