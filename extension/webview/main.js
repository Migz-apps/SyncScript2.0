(function() {
    const vscode = (typeof window.vscodeApi === 'undefined') 
        ? (window.vscodeApi = acquireVsCodeApi()) 
        : window.vscodeApi;

    let countdownInterval = null;

    const startApp = () => {
        const views = {
            selection: document.getElementById('view-selection'),
            create: document.getElementById('view-create'),
            join: document.getElementById('view-join'),
            active: document.getElementById('view-active')
        };

        const statusDot = document.getElementById('status-dot');
        const roomIdDisplay = document.getElementById('active-room-id');
        const roomNameDisplay = document.getElementById('display-room-name');
        const deactivationOverlay = document.getElementById('deactivation-overlay');
        const countdownTimer = document.getElementById('countdown-timer');
        const btnStopDeactivation = document.getElementById('btn-stop-deactivation');
        const btnDeactivate = document.getElementById('btn-deactivate');
        
        const showView = (id) => {
            Object.keys(views).forEach(v => {
                if (views[v]) views[v].classList.add('hidden');
            });
            if (views[id]) views[id].classList.remove('hidden');
        };

        const startUIInterval = (seconds) => {
            clearInterval(countdownInterval);
            let remaining = seconds;
            
            const updateDisplay = () => {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                countdownTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            };

            updateDisplay();
            countdownInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                }
                updateDisplay();
            }, 1000);
        };

        showView('selection');

        // Navigation
        document.getElementById('nav-to-create').onclick = () => showView('create');
        document.getElementById('nav-to-join').onclick = () => showView('join');
        document.querySelectorAll('.nav-back').forEach(btn => {
            btn.onclick = () => showView('selection');
        });

        // Room Creation
        document.getElementById('btn-create').onclick = () => {
            const roomName = document.getElementById('create-name').value.trim();
            const key = document.getElementById('create-key').value;
            
            if (!roomName || !key) {
                alert("Room Name and Password are required.");
                return;
            }
            vscode.postMessage({ command: 'createRoom', roomName, key });
        };

        // Room Joining
        document.getElementById('btn-join').onclick = () => {
            const roomId = document.getElementById('join-id').value.trim();
            const name = document.getElementById('join-name').value.trim();
            const key = document.getElementById('join-key').value;

            if (!roomId || !name || !key) {
                alert("Please fill in all joining fields.");
                return;
            }
            vscode.postMessage({ command: 'joinRoom', roomId, name, key });
        };

        // Leave Room
        document.getElementById('btn-leave').onclick = () => {
            vscode.postMessage({ command: 'leaveRoom' });
            showView('selection');
            statusDot.classList.replace('bg-green-500', 'bg-red-500');
        };

        // Deactivation Actions (Admin Only)
        btnDeactivate.onclick = () => {
            if (confirm("Are you sure? This will delete the room and all activity history after 2 minutes.")) {
                vscode.postMessage({ command: 'deactivateRoom' });
            }
        };

        btnStopDeactivation.onclick = () => {
            vscode.postMessage({ command: 'cancelDeactivation' });
        };

        // Message Listener
        window.addEventListener('message', event => {
            const msg = event.data;
            switch(msg.type) {
                case 'ROOM_READY':
                case 'ROOM_CREATED':
                    showView('active');
                    const roomData = msg.room || msg;
                    roomIdDisplay.innerText = roomData.roomId;
                    roomNameDisplay.innerText = roomData.roomName || 'Active Room';
                    statusDot.classList.replace('bg-red-500', 'bg-green-500');
                    
                    // Toggle Admin Button
                    if (msg.isAdmin) {
                        btnDeactivate.classList.remove('hidden');
                        btnStopDeactivation.classList.remove('hidden');
                    } else {
                        btnDeactivate.classList.add('hidden');
                        btnStopDeactivation.classList.add('hidden');
                    }
                    break;
                
                case 'DEACTIVATION_START':
                    deactivationOverlay.classList.remove('hidden');
                    startUIInterval(msg.duration || 120);
                    break;

                case 'DEACTIVATION_CANCELLED':
                    deactivationOverlay.classList.add('hidden');
                    clearInterval(countdownInterval);
                    break;

                case 'ROOM_TERMINATED':
                    deactivationOverlay.classList.add('hidden');
                    clearInterval(countdownInterval);
                    showView('selection');
                    statusDot.classList.replace('bg-green-500', 'bg-red-500');
                    alert("The room has been deactivated and deleted by the administrator.");
                    break;

                case 'JOIN_RESULT':
                    if (!msg.success) alert(msg.error || "Failed to join room.");
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