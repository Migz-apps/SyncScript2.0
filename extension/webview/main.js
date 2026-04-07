(function() {
    // Acquire VS Code API safely [cite: 75-76]
    let vscode;
    try {
        vscode = acquireVsCodeApi(); // [cite: 78]
    } catch (e) {
        console.warn("VS Code API already acquired or running outside VS Code context."); // [cite: 80]
        vscode = window.vscodeApi; // [cite: 81]
    }

    let countdownInterval = null; // [cite: 83]

    const startApp = () => {
        const views = {
            selection: document.getElementById('view-selection'), // [cite: 86]
            create: document.getElementById('view-create'), // [cite: 87]
            join: document.getElementById('view-join'), // [cite: 88]
            active: document.getElementById('view-active') // [cite: 89]
        };

        const statusDot = document.getElementById('status-dot'); // [cite: 91]
        const roomIdDisplay = document.getElementById('active-room-id'); // [cite: 92]
        const roomNameDisplay = document.getElementById('display-room-name'); // [cite: 93]
        const deactivationOverlay = document.getElementById('deactivation-overlay'); // [cite: 94]
        const countdownTimer = document.getElementById('countdown-timer'); // [cite: 95]
        const btnStopDeactivation = document.getElementById('btn-stop-deactivation'); // [cite: 96]
        const btnDeactivate = document.getElementById('btn-deactivate'); // [cite: 97]
        const memberList = document.getElementById('member-list'); // [cite: 98]
        
        // NEW ELEMENT REFERENCES
        const btnSyncCheck = document.getElementById('btn-sync-check');
        const archContainer = document.getElementById('arch-sync-tree');
        
        const showView = (id) => {
            console.log(`Switching to view: ${id}`); // [cite: 100]
            Object.keys(views).forEach(v => {
                if (views[v]) views[v].classList.add('hidden'); // [cite: 102]
            });
            if (views[id]) views[id].classList.remove('hidden'); // [cite: 104]
        };

        const startUIInterval = (seconds) => {
            clearInterval(countdownInterval); // [cite: 107]
            let remaining = seconds; // [cite: 108]
            
            const updateDisplay = () => {
                const mins = Math.floor(remaining / 60); // [cite: 110]
                const secs = remaining % 60; // [cite: 111]
                countdownTimer.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`; // [cite: 112]
            };

            updateDisplay(); // [cite: 114]
            countdownInterval = setInterval(() => {
                remaining--; // [cite: 116]
                if (remaining <= 0) {
                    clearInterval(countdownInterval); // [cite: 118]
                }
                updateDisplay(); // [cite: 120]
            }, 1000); // [cite: 121]
        };

        // Initialize view
        showView('selection'); // [cite: 124]

        // Navigation Actions
        document.getElementById('nav-to-create').addEventListener('click', () => showView('create')); // [cite: 126]
        document.getElementById('nav-to-join').addEventListener('click', () => showView('join')); // [cite: 127]
        
        document.querySelectorAll('.nav-back').forEach(btn => {
            btn.addEventListener('click', () => showView('selection')); // [cite: 129]
        });

        // Room Creation Trigger
        document.getElementById('btn-create').addEventListener('click', () => {
            const roomName = document.getElementById('create-name').value.trim(); // [cite: 133]
            const key = document.getElementById('create-key').value; // [cite: 134]
            
            if (!roomName || !key) {
                alert("Room Name and Password are required."); // [cite: 136]
                return; // [cite: 137]
            }

            console.log("Sending 'createRoom' command..."); // [cite: 139]
            vscode.postMessage({ command: 'createRoom', roomName, key }); // [cite: 140]
        });

        // Room Joining Trigger
        document.getElementById('btn-join').addEventListener('click', () => {
            const roomId = document.getElementById('join-id').value.trim(); // [cite: 144]
            const name = document.getElementById('join-name').value.trim(); // [cite: 145]
            const key = document.getElementById('join-key').value; // [cite: 146]

            if (!roomId || !name || !key) {
                alert("Please fill in all joining fields."); // [cite: 148]
                return; // [cite: 149]
            }

            console.log("Sending 'joinRoom' command..."); // [cite: 151]
            vscode.postMessage({ command: 'joinRoom', roomId, name, key }); // [cite: 152]
        });

        // Leave Room
        document.getElementById('btn-leave').addEventListener('click', () => {
            vscode.postMessage({ command: 'leaveRoom' }); // [cite: 156]
            showView('selection'); // [cite: 157]
            statusDot.classList.replace('bg-green-500', 'bg-red-500'); // [cite: 158]
        });

        // Deactivation (Admin Only)
        btnDeactivate.addEventListener('click', () => {
            if (confirm("Deactivate Room? This deletes everything in 2 minutes.")) { // [cite: 162]
                vscode.postMessage({ command: 'deactivateRoom' }); // [cite: 163]
            }
        });

        btnStopDeactivation.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelDeactivation' }); // [cite: 167]
        });

        // NEW: Folder Sync Button Listener
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
            const msg = event.data; // [cite: 171]
            console.log("Received message from Extension:", msg.type); // [cite: 172]

            switch(msg.type) {
                case 'ROOM_READY': // [cite: 174]
                case 'ROOM_CREATED': // [cite: 175]
                    showView('active'); // [cite: 176]
                    const roomData = msg.room || msg; // [cite: 177]
                    roomIdDisplay.innerText = roomData.roomId; // [cite: 178]
                    roomNameDisplay.innerText = roomData.roomName || 'Active Room'; // [cite: 179]
                    statusDot.classList.replace('bg-red-500', 'bg-green-500'); // [cite: 180]
                    
                    if (msg.isAdmin) {
                        btnDeactivate.classList.remove('hidden'); // [cite: 182]
                        btnStopDeactivation.classList.remove('hidden'); // [cite: 183]
                    } else {
                        btnDeactivate.classList.add('hidden'); // [cite: 185]
                        btnStopDeactivation.classList.add('hidden'); // [cite: 186]
                    }
                    break;
                
                // ARCHITECTURE SYNC UPDATE [cite: 189-192]
                case 'ARCH_UPDATE':
                    if (archContainer && msg.manifest && msg.localManifest) {
                        archContainer.classList.remove('hidden');
                        archContainer.innerHTML = '<p class="text-[10px] text-slate-500 mb-2 uppercase tracking-widest">Folder Sync Map</p>';

                        // Merge and sort unique paths [cite: 203-204]
                        const allPaths = Array.from(new Set([...msg.manifest, ...msg.localManifest])).sort();

                        allPaths.forEach(path => {
                            const isLocal = msg.localManifest.includes(path); // [cite: 206]
                            const isPeer = msg.manifest.includes(path); // [cite: 207]
                            
                            const item = document.createElement('div'); // [cite: 208]
                            item.className = "flex items-center gap-2 py-0.5"; // [cite: 209]

                            if (isLocal && isPeer) {
                                // Match: Both users have the file [cite: 211]
                                item.innerHTML = `<span class="text-emerald-500">✔</span> <span class="text-slate-300">${path}</span>`; // [cite: 212]
                            } else if (isPeer && !isLocal) {
                                // Missing locally: Highlight in Red [cite: 214]
                                item.innerHTML = `<span class="text-red-500 font-bold">+</span> <span class="text-red-400 italic">${path} (Missing)</span>`; // [cite: 215]
                            } else {
                                // Local only [cite: 217]
                                item.innerHTML = `<span class="text-slate-500">?</span> <span class="text-slate-500">${path}</span>`; // [cite: 218]
                            }
                            archContainer.appendChild(item); // [cite: 220]
                        });
                    }
                    break;

                case 'DEACTIVATION_START': // [cite: 224]
                    deactivationOverlay.classList.remove('hidden'); // [cite: 225]
                    startUIInterval(msg.duration || 120); // [cite: 226]
                    break;

                case 'DEACTIVATION_CANCELLED': // [cite: 228]
                    deactivationOverlay.classList.add('hidden'); // [cite: 229]
                    clearInterval(countdownInterval); // [cite: 230]
                    break;

                case 'ROOM_TERMINATED': // [cite: 232]
                    deactivationOverlay.classList.add('hidden'); // [cite: 233]
                    clearInterval(countdownInterval); // [cite: 234]
                    showView('selection'); // [cite: 235]
                    statusDot.classList.replace('bg-green-500', 'bg-red-500'); // [cite: 236]
                    alert("The room has been deactivated by the administrator."); // [cite: 237]
                    break;

                case 'JOIN_RESULT': // [cite: 239]
                    if (!msg.success) alert(msg.error || "Failed to join room."); // [cite: 240]
                    break;

                case 'USER_JOINED': // [cite: 242]
                case 'USER_LEFT': // [cite: 243]
                    if (msg.users) {
                        memberList.innerHTML = msg.users.map(u => 
                            `<div class="flex items-center gap-2">
                                <div class="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                <span>${u.username}</span>
                            </div>` // [cite: 246-249]
                        ).join(''); // [cite: 250]
                    }
                    break;
            }
        });
    };

    // Ensure DOM is ready [cite: 256]
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startApp); // [cite: 258]
    } else {
        startApp(); // [cite: 260]
    }
})();