(function() {
    // Acquire VS Code API safely
    let vscode;
    try {
        vscode = acquireVsCodeApi(); 
    } catch (e) {
        console.warn("VS Code API already acquired or running outside VS Code context."); 
        vscode = window.vscodeApi; 
    }

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
        const btnCopyRoomId = document.getElementById('btn-copy-room-id');
        const memberList = document.getElementById('member-list'); 
        
        // ELEMENT REFERENCES
        const btnSyncCheck = document.getElementById('btn-sync-check');
        const archContainer = document.getElementById('arch-sync-tree');
        const workspacePopup = document.getElementById('workspace-error-popup');
        const errorText = workspacePopup?.querySelector('span'); // Reference to the text inside popup
        
        /**
         * Dynamic Routing: Switches views based on ID
         */
        const showView = (id) => {
            console.log(`[UI] Routing to: ${id}`); 
            Object.keys(views).forEach(v => {
                if (views[v]) views[v].classList.add('hidden'); 
            });
            if (views[id]) views[id].classList.remove('hidden'); 
        };

        /**
         * State Update Handler: Logic for UI Feedback and Automatic Routing
         */
        const handleStateUpdate = (data) => {
            const { state, status } = data;

            // 1. Handle Workspace Feedback
            if (!status.hasFolder) {
                if (workspacePopup) {
                    workspacePopup.classList.remove('hidden');
                    if (errorText) {
                        errorText.innerText = status.errorReason === 'NO_FOLDER' 
                            ? "Please open a folder to use SyncScript." 
                            : "Sync unavailable: Check workspace.";
                    }
                }
            } else {
                if (workspacePopup) workspacePopup.classList.add('hidden');
            }

            // 2. Dynamic Routing based on Connection State
            switch (state) {
                case 'DISCONNECTED':
                    statusDot.className = "w-2 h-2 rounded-full bg-red-500";
                    showView('selection');
                    break;
                case 'CONNECTED_NO_ROOM':
                    statusDot.className = "w-2 h-2 rounded-full bg-yellow-500";
                    // Only go back to selection if we aren't currently in create/join menus
                    const currentView = Object.keys(views).find(key => !views[key].classList.contains('hidden'));
                    if (currentView === 'active') showView('selection');
                    break;
                case 'IN_ROOM':
                    statusDot.className = "w-2 h-2 rounded-full bg-green-500";
                    showView('active');
                    break;
            }
        };

        const startUIInterval = (seconds) => {
            clearInterval(countdownInterval); 
            let remaining = seconds; 
            
            const updateDisplay = () => {
                const mins = Math.floor(remaining / 60); 
                const secs = remaining % 60; 
                if (countdownTimer) {
                    countdownTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; 
                }
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

        // Initialize view
        showView('selection'); 

        // Navigation Actions
        document.getElementById('nav-to-create').addEventListener('click', () => showView('create')); 
        document.getElementById('nav-to-join').addEventListener('click', () => showView('join')); 
        
        document.querySelectorAll('.nav-back').forEach(btn => {
            btn.addEventListener('click', () => showView('selection')); 
        });

        // Room Creation Trigger
        document.getElementById('btn-create').addEventListener('click', () => {
            const roomName = document.getElementById('create-name').value.trim(); 
            const key = document.getElementById('create-key').value; 
            
            if (!roomName || !key) {
                alert("Room Name and Password are required."); 
                return; 
            }
            vscode.postMessage({ command: 'createRoom', roomName, key }); 
        });

        // Room Joining Trigger
        document.getElementById('btn-join').addEventListener('click', () => {
            const roomId = document.getElementById('join-id').value.trim(); 
            const name = document.getElementById('join-name').value.trim(); 
            const key = document.getElementById('join-key').value; 

            if (!roomId || !name || !key) {
                alert("Please fill in all joining fields."); 
                return; 
            }
            vscode.postMessage({ command: 'joinRoom', roomId, name, key }); 
        });

        // Leave Room
        document.getElementById('btn-leave').addEventListener('click', () => {
            vscode.postMessage({ command: 'leaveRoom' }); 
            showView('selection'); 
        });

        if (btnCopyRoomId) {
            btnCopyRoomId.addEventListener('click', async () => {
                const roomId = roomIdDisplay?.innerText?.trim();
                if (!roomId || roomId === '---') {
                    return;
                }

                try {
                    await navigator.clipboard.writeText(roomId);
                    const originalText = btnCopyRoomId.innerText;
                    btnCopyRoomId.innerText = 'Copied!';
                    setTimeout(() => {
                        btnCopyRoomId.innerText = originalText;
                    }, 2000);
                } catch (error) {
                    console.warn('Failed to copy room id', error);
                }
            });
        }

        // Deactivation (Admin Only)
        btnDeactivate.addEventListener('click', () => {
            if (confirm("Deactivate Room? This deletes everything in 2 minutes.")) { 
                vscode.postMessage({ command: 'deactivateRoom' }); 
            }
        });

        btnStopDeactivation.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelDeactivation' }); 
        });

        // Folder Sync Button Listener
        if (btnSyncCheck) {
            btnSyncCheck.addEventListener('click', () => {
                if (archContainer) {
                    archContainer.classList.remove('hidden');
                    archContainer.innerHTML = '<p class="text-gray-500 animate-pulse">Comparing workspace with peers...</p>';
                }
                vscode.postMessage({ command: 'checkSync' });
            });
        }

        // Inbound Message Handler
        window.addEventListener('message', event => {
            const msg = event.data; 
            console.log("[Extension -> UI]:", msg.type); 

            switch(msg.type) {
                case 'STATE_UPDATE':
                    handleStateUpdate(msg);
                    break;

                case 'WORKSPACE_ERROR':
                    // Keep existing fallback if STATE_UPDATE isn't used
                    if (workspacePopup) {
                        workspacePopup.classList.remove('hidden');
                        setTimeout(() => workspacePopup.classList.add('hidden'), 3000);
                    }
                    break;

                case 'ROOM_READY': 
                case 'ROOM_CREATED': 
                    showView('active'); 
                    const roomData = msg.room || msg; 
                    roomIdDisplay.innerText = roomData.roomId || roomData.id; 
                    roomNameDisplay.innerText = roomData.roomName || 'Active Room'; 
                    
                    if (msg.isAdmin) {
                        btnDeactivate?.classList.remove('hidden'); 
                        btnStopDeactivation?.classList.remove('hidden'); 
                    } else {
                        btnDeactivate?.classList.add('hidden'); 
                        btnStopDeactivation?.classList.add('hidden'); 
                    }
                    break;
                
                case 'ARCH_UPDATE':
                    if (window.TreeViewRenderer && archContainer && msg.localManifest) {
                        archContainer.classList.remove('hidden');
                        // Combine manifests to show differences
                        const allPaths = Array.from(new Set([...(msg.manifest || []), ...msg.localManifest])).sort();
                        const diff = allPaths.map(p => ({
                            path: p,
                            status: (msg.localManifest.includes(p) && msg.manifest?.includes(p)) ? 'match' :
                                    (msg.manifest?.includes(p)) ? 'missing-locally' : 'extra-locally'
                        }));
                        window.TreeViewRenderer.render(archContainer, diff);
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
                    alert("The room has been deactivated by the administrator."); 
                    break;

                case 'JOIN_RESULT': 
                    if (!msg.success) alert(msg.error || "Failed to join room."); 
                    break;

                case 'USER_JOINED': 
                case 'USER_LEFT': 
                    if (msg.users && memberList) {
                        memberList.innerHTML = msg.users.map(u => 
                            `<div class="flex items-center gap-2">
                                <div class="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                <span>${u.username}</span>
                            </div>`
                        ).join(''); 
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
