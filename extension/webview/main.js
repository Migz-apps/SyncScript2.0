(function() {
    const vscode = (typeof window.vscodeApi === 'undefined') 
        ? (window.vscodeApi = acquireVsCodeApi()) 
        : window.vscodeApi;

    const startApp = () => {
        const views = {
            selection: document.getElementById('view-selection'),
            create: document.getElementById('view-create'),
            join: document.getElementById('view-join'),
            active: document.getElementById('view-active')
        };

        const statusDot = document.getElementById('status-dot');
        const roomIdDisplay = document.getElementById('active-room-id');

        const showView = (id) => {
            Object.keys(views).forEach(v => {
                if (views[v]) views[v].classList.add('hidden');
            });
            if (views[id]) views[id].classList.remove('hidden');
        };

        // Navigation
        document.getElementById('nav-to-create').onclick = () => showView('create');
        document.getElementById('nav-to-join').onclick = () => showView('join');
        document.querySelectorAll('.nav-back').forEach(btn => {
            btn.onclick = () => showView('selection');
        });

        // Form Submission
        document.getElementById('btn-create').onclick = () => {
            const key = document.getElementById('create-key').value;
            if(!key) return;
            vscode.postMessage({ command: 'createRoom', key });
        };

        document.getElementById('btn-join').onclick = () => {
            const roomId = document.getElementById('join-id').value;
            const name = document.getElementById('join-name').value;
            const key = document.getElementById('join-key').value;
            if(!roomId || !name || !key) return;
            vscode.postMessage({ command: 'joinRoom', roomId, name, key });
        };

        // New: Leave Room button
        document.getElementById('btn-leave').onclick = () => {
            vscode.postMessage({ command: 'leaveRoom' });
            showView('selection');
            if (statusDot) statusDot.classList.replace('bg-green-500', 'bg-red-500');
        };

        // Listeners for messages from Provider.ts
        window.addEventListener('message', event => {
            const msg = event.data;
            switch(msg.type) {
                case 'ROOM_READY':
                    showView('active');
                    if (roomIdDisplay) roomIdDisplay.innerText = msg.roomId;
                    if (statusDot) statusDot.classList.replace('bg-red-500', 'bg-green-500');
                    break;
                
                case 'USER_LEFT':
                case 'ROOM_TERMINATED':
                    // If the room is deleted or last person leaves
                    showView('selection');
                    if (statusDot) statusDot.classList.replace('bg-green-500', 'bg-red-500');
                    break;
                
                case 'JOIN_RESULT':
                    if (!msg.success) {
                        alert(msg.error || "Failed to join room");
                    }
                    break;
            }
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp);
    } else {
        startApp();
    }
})();