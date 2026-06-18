(function() {
    let vscode;
    try { vscode = acquireVsCodeApi(); } catch { vscode = window.vscodeApi; }

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
        const roleBadge = document.getElementById('role-badge');
        const latencyBadge = document.getElementById('latency-badge');
        const deactivationOverlay = document.getElementById('deactivation-overlay');
        const countdownTimer = document.getElementById('countdown-timer');
        const btnStopDeactivation = document.getElementById('btn-stop-deactivation');
        const btnDeactivate = document.getElementById('btn-deactivate');
        const memberList = document.getElementById('member-list');
        const archContainer = document.getElementById('arch-sync-tree');
        const pendingJoins = document.getElementById('pending-joins');
        const pendingList = document.getElementById('pending-list');
        const historySection = document.getElementById('history-section');
        const historyList = document.getElementById('history-list');
        const diagnosticsPanel = document.getElementById('diagnostics-panel');
        const diagnosticsList = document.getElementById('diagnostics-list');

        const showView = (id) => {
            Object.keys(views).forEach(v => views[v]?.classList.add('hidden'));
            views[id]?.classList.remove('hidden');
        };

        const handleStateUpdate = (data) => {
            const { state, status, latency, role, serverVersion } = data;
            if (!status?.hasFolder) {
                document.getElementById('workspace-error-popup')?.classList.remove('hidden');
            } else {
                document.getElementById('workspace-error-popup')?.classList.add('hidden');
            }

            if (latency) latencyBadge.textContent = `${latency}ms`;
            if (serverVersion) latencyBadge.textContent += ` · v${serverVersion}`;

            switch (state) {
                case 'DISCONNECTED':
                    statusDot.className = 'w-3 h-3 bg-red-500 rounded-full';
                    showView('selection');
                    break;
                case 'CONNECTED_NO_ROOM':
                    statusDot.className = 'w-3 h-3 bg-yellow-500 rounded-full';
                    break;
                case 'IN_ROOM':
                    statusDot.className = 'w-3 h-3 bg-green-500 rounded-full';
                    showView('active');
                    if (role) roleBadge.textContent = `Role: ${role}`;
                    break;
            }
        };

        const startUIInterval = (seconds) => {
            clearInterval(countdownInterval);
            let remaining = seconds;
            const tick = () => {
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                if (countdownTimer) countdownTimer.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
            };
            tick();
            countdownInterval = setInterval(() => { remaining--; if (remaining <= 0) clearInterval(countdownInterval); tick(); }, 1000);
        };

        const renderMembers = (users) => {
            if (!memberList || !users) return;
            memberList.innerHTML = users.map(u =>
                `<div class="flex items-center justify-between gap-2 py-0.5">
                    <div class="flex items-center gap-2">
                        <div class="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                        <span>${u.username}</span>
                        <span class="text-[9px] text-gray-500">${u.role || 'editor'}</span>
                    </div>
                </div>`
            ).join('');
        };

        const renderHistory = (history) => {
            if (!history?.length) return;
            historySection?.classList.remove('hidden');
            historyList.innerHTML = history.map(h =>
                `<button class="history-rejoin w-full text-left text-xs bg-gray-800 hover:bg-gray-700 p-2 rounded" data-room="${h.roomId}" data-key="${h.key}" data-name="${h.username}">
                    ${h.roomName} <span class="text-gray-500">(${h.roomId})</span>
                </button>`
            ).join('');
            document.querySelectorAll('.history-rejoin').forEach(btn => {
                btn.addEventListener('click', () => {
                    vscode.postMessage({
                        command: 'rejoinHistory',
                        record: { roomId: btn.dataset.room, key: btn.dataset.key, username: btn.dataset.name }
                    });
                });
            });
        };

        showView('selection');
        vscode.postMessage({ command: 'getInitialState' });

        document.getElementById('nav-to-create')?.addEventListener('click', () => showView('create'));
        document.getElementById('nav-to-join')?.addEventListener('click', () => showView('join'));
        document.querySelectorAll('.nav-back').forEach(btn => btn.addEventListener('click', () => showView('selection')));

        document.getElementById('btn-create')?.addEventListener('click', () => {
            const roomName = document.getElementById('create-name').value.trim();
            const key = document.getElementById('create-key').value;
            const requireApproval = document.getElementById('create-approval')?.checked;
            if (!roomName || !key) { alert('Room Name and Password are required.'); return; }
            vscode.postMessage({ command: 'createRoom', roomName, key, requireApproval });
        });

        document.getElementById('btn-join')?.addEventListener('click', () => {
            const roomId = document.getElementById('join-id').value.trim();
            const name = document.getElementById('join-name').value.trim();
            const key = document.getElementById('join-key').value;
            if (!roomId || !name || !key) { alert('Please fill in all fields.'); return; }
            vscode.postMessage({ command: 'joinRoom', roomId, name, key });
        });

        document.getElementById('btn-leave')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'leaveRoom' });
            showView('selection');
        });

        document.getElementById('btn-copy-room-id')?.addEventListener('click', async () => {
            const id = roomIdDisplay?.textContent?.trim();
            if (id && id !== '---') await navigator.clipboard.writeText(id);
        });

        document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
            vscode.postMessage({ command: 'copyInvite' });
        });

        btnDeactivate?.addEventListener('click', () => {
            if (confirm('Deactivate room? All participants will be disconnected in 2 minutes.')) {
                vscode.postMessage({ command: 'deactivateRoom' });
            }
        });

        btnStopDeactivation?.addEventListener('click', () => {
            vscode.postMessage({ command: 'cancelDeactivation' });
        });

        document.getElementById('btn-sync-check')?.addEventListener('click', () => {
            archContainer?.classList.remove('hidden');
            archContainer.innerHTML = '<p class="text-gray-500 animate-pulse">Comparing workspace...</p>';
            vscode.postMessage({ command: 'checkSync' });
        });

        const chatInput = document.getElementById('chat-input');
        const sendChat = () => {
            const text = chatInput?.value?.trim();
            if (text) {
                vscode.postMessage({ command: 'sendChat', text });
                if (chatInput) chatInput.value = '';
            }
        };
        document.getElementById('btn-send-chat')?.addEventListener('click', sendChat);
        chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

        const renderChat = (messages) => {
            const box = document.getElementById('chat-messages');
            if (!box) return;
            const list = Array.isArray(messages) ? messages : [messages];
            box.innerHTML = list.map(m =>
                `<div><span class="text-blue-400">${m.username}:</span> <span class="text-gray-300">${m.text}</span></div>`
            ).join('');
            box.scrollTop = box.scrollHeight;
        };

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'STATE_UPDATE': handleStateUpdate(msg); break;

                case 'SESSION_HISTORY': renderHistory(msg.history); break;

                case 'ROOM_READY':
                case 'ROOM_CREATED':
                    showView('active');
                    document.getElementById('chat-section')?.classList.remove('hidden');
                    roomIdDisplay.textContent = msg.roomId || '---';
                    roomNameDisplay.textContent = msg.roomName || 'Active Room';
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
                        const allPaths = Array.from(new Set([...(msg.manifest || []), ...msg.localManifest])).sort();
                        const diff = allPaths.map(p => ({
                            path: p,
                            status: (msg.localManifest.includes(p) && msg.manifest?.includes(p)) ? 'match' :
                                    (msg.manifest?.includes(p)) ? 'missing-locally' : 'extra-locally'
                        }));
                        window.TreeViewRenderer.render(archContainer, diff);
                    }
                    break;

                case 'JOIN_PENDING':
                    pendingJoins?.classList.remove('hidden');
                    const pending = msg.pending || [{ socketId: msg.socketId, username: msg.userName }];
                    pendingList.innerHTML = pending.map(p =>
                        `<div class="flex gap-2 items-center text-xs">
                            <span>${p.username}</span>
                            <button class="approve-join bg-green-700 px-2 py-0.5 rounded" data-id="${p.socketId}">Approve</button>
                            <button class="deny-join bg-red-800 px-2 py-0.5 rounded" data-id="${p.socketId}">Deny</button>
                        </div>`
                    ).join('');
                    pendingList.querySelectorAll('.approve-join').forEach(b => b.addEventListener('click', () => {
                        vscode.postMessage({ command: 'approveJoin', targetSocketId: b.dataset.id, role: 'editor' });
                    }));
                    pendingList.querySelectorAll('.deny-join').forEach(b => b.addEventListener('click', () => {
                        vscode.postMessage({ command: 'denyJoin', targetSocketId: b.dataset.id });
                    }));
                    break;

                case 'PEER_DIAGNOSTICS':
                    diagnosticsPanel?.classList.remove('hidden');
                    const diags = msg.diagnostics || [];
                    diagnosticsList.innerHTML = diags.slice(0, 10).map(d =>
                        `<div class="${d.severity === 'error' ? 'text-red-400' : 'text-yellow-400'}">${d.relativePath}:${d.line} ${d.message}</div>`
                    ).join('') || '<span class="text-gray-500">No issues</span>';
                    break;

                case 'DEACTIVATION_START':
                    deactivationOverlay?.classList.remove('hidden');
                    startUIInterval(msg.duration || 120);
                    break;

                case 'DEACTIVATION_CANCELLED':
                    deactivationOverlay?.classList.add('hidden');
                    clearInterval(countdownInterval);
                    break;

                case 'ROOM_TERMINATED':
                    deactivationOverlay?.classList.add('hidden');
                    clearInterval(countdownInterval);
                    showView('selection');
                    alert('Room deactivated.');
                    break;

                case 'JOIN_RESULT':
                    if (!msg.success) alert(msg.error || 'Failed to join.');
                    break;

                case 'USER_JOINED':
                case 'USER_LEFT':
                case 'USER_ROLE_CHANGED':
                    renderMembers(msg.users);
                    break;

                case 'CHAT_MESSAGE':
                case 'CHAT_HISTORY':
                    renderChat(msg.messages || [msg]);
                    break;

                case 'INVITE_COPIED':
                    alert('Invite link copied to clipboard!');
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
