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
        const memberList = document.getElementById('member-list'); 
        
        // ELEMENT REFERENCES
        const btnSyncCheck = document.getElementById('btn-sync-check');
        const archContainer = document.getElementById('arch-sync-tree');
        const workspacePopup = document.getElementById('workspace-error-popup');
        
        const showView = (id) => {
            console.log(`Switching to view: ${id}`); 
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

            console.log("Sending 'createRoom' command..."); 
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

            console.log("Sending 'joinRoom' command..."); 
            vscode.postMessage({ command: 'joinRoom', roomId, name, key }); 
        });

        // Leave Room
        document.getElementById('btn-leave').addEventListener('click', () => {
            vscode.postMessage({ command: 'leaveRoom' }); 
            showView('selection'); 
            statusDot.classList.replace('bg-green-500', 'bg-red-500'); 
        });

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
            console.log("Received message from Extension:", msg.type); 

            switch(msg.type) {
                case 'WORKSPACE_ERROR':
                    if (workspacePopup) {
                        workspacePopup.classList.remove('hidden');
                        setTimeout(() => {
                            workspacePopup.classList.add('hidden');
                        }, 3000);
                    }
                    break;

                case 'ROOM_READY': 
                case 'ROOM_CREATED': 
                    showView('active'); 
                    const roomData = msg.room || msg; 
                    roomIdDisplay.innerText = roomData.roomId; 
                    roomNameDisplay.innerText = roomData.roomName || 'Active Room'; 
                    statusDot.classList.replace('bg-red-500', 'bg-green-500'); 
                    
                    if (msg.isAdmin) {
                        btnDeactivate.classList.remove('hidden'); 
                        btnStopDeactivation.classList.remove('hidden'); 
                    } else {
                        btnDeactivate.classList.add('hidden'); 
                        btnStopDeactivation.classList.add('hidden'); 
                    }
                    break;
                
                case 'ARCH_UPDATE':
                    if (archContainer && msg.manifest && msg.localManifest) {
                        archContainer.classList.remove('hidden');
                        archContainer.innerHTML = '<p class="text-[10px] text-slate-500 mb-2 uppercase tracking-widest">Folder Sync Map</p>';

                        const allPaths = Array.from(new Set([...msg.manifest, ...msg.localManifest])).sort();

                        allPaths.forEach(path => {
                            const isLocal = msg.localManifest.includes(path); 
                            const isPeer = msg.manifest.includes(path); 
                            
                            const item = document.createElement('div'); 
                            item.className = "flex items-center gap-2 py-0.5"; 

                            if (isLocal && isPeer) {
                                item.innerHTML = `<span class="text-emerald-500">✔</span> <span class="text-slate-300">${path}</span>`; 
                            } else if (isPeer && !isLocal) {
                                item.innerHTML = `<span class="text-red-500 font-bold">+</span> <span class="text-red-400 italic">${path} (Missing)</span>`; 
                            } else {
                                item.innerHTML = `<span class="text-slate-500">?</span> <span class="text-slate-500">${path}</span>`; 
                            }
                            archContainer.appendChild(item); 
                        });
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
                    alert("The room has been deactivated by the administrator."); 
                    break;

                case 'JOIN_RESULT': 
                    if (!msg.success) alert(msg.error || "Failed to join room."); 
                    break;

                case 'USER_JOINED': 
                case 'USER_LEFT': 
                    if (msg.users) {
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