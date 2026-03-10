const vscode = acquireVsCodeApi();

function showView(viewId) {
    const views = ['selection', 'create', 'join', 'active'];
    views.forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
}

// Button Events
document.getElementById('btn-create').onclick = () => {
    const key = document.getElementById('create-key').value;
    vscode.postMessage({ command: 'createRoom', key });
};

document.getElementById('btn-join').onclick = () => {
    const roomId = document.getElementById('join-id').value;
    const name = document.getElementById('join-name').value;
    const key = document.getElementById('join-key').value;
    vscode.postMessage({ command: 'joinRoom', roomId, name, key });
};

// Listen for messages from extension
window.addEventListener('message', event => {
    const msg = event.data;
    switch(msg.type) {
        case 'CONNECTED':
            document.getElementById('status-dot').className = 'w-3 h-3 bg-green-500 rounded-full';
            break;
        case 'ROOM_READY':
            showView('active');
            document.getElementById('active-room-id').innerText = msg.roomId;
            break;
    }
});