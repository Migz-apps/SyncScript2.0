(function() {
    let vscode;
    try { vscode = acquireVsCodeApi(); } catch { vscode = window.vscodeApi; }

    let countdownInterval = null;
    let toastTimer = null;

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
        const actionToast = document.getElementById('action-toast');

        const showView = (id) => {
            Object.keys(views).forEach(v => views[v]?.classList.add('hidden'));
            views[id]?.classList.remove('hidden');
        };

        const showToast = (message, level = 'info') => {
            if (!actionToast || !message) return;
            actionToast.textContent = message;
            actionToast.className = `visible ${level}`;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                actionToast.className = 'hidden';
            }, 3200);
        };

        const flashButton = (btn) => {
            if (!btn) return;
            btn.classList.add('is-flashing');
            setTimeout(() => btn.classList.remove('is-flashing'), 650);
        };

        const withAction = (btn, run, confirmMessage) => {
            flashButton(btn);
            run();
            if (confirmMessage) {
                showToast(confirmMessage, 'success');
            }
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
                case 'CONNECTING':
                    statusDot.className = 'w-3 h-3 bg-yellow-400 rounded-full animate-pulse';
                    break;
                case 'IN_ROOM':
                    statusDot.className = 'w-3 h-3 bg-green-500 rounded-full';
                    showView('active');
                    document.getElementById('chat-section')?.classList.remove('hidden');
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
                `<button class="history-rejoin btn-action w-full text-left text-xs bg-gray-800 hover:bg-gray-700 p-2 rounded" data-room="${h.roomId}" data-key="${h.key}" data-name="${h.username}">
                    ${h.roomName} <span class="text-gray-500">(${h.roomId})</span>
                </button>`
            ).join('');
            document.querySelectorAll('.history-rejoin').forEach(btn => {
                btn.addEventListener('click', () => {
                    withAction(btn, () => {
                        vscode.postMessage({
                            command: 'rejoinHistory',
                            record: { roomId: btn.dataset.room, key: btn.dataset.key, username: btn.dataset.name }
                        });
                    }, 'Rejoining room…');
                });
            });
        };

        showView('selection');
        vscode.postMessage({ command: 'getInitialState' });

        document.getElementById('nav-to-create')?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => showView('create'));
        });
        document.getElementById('nav-to-join')?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => showView('join'));
        });
        document.querySelectorAll('.nav-back').forEach(btn => btn.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => showView('selection'));
        }));

        document.getElementById('btn-create')?.addEventListener('click', (e) => {
            const displayName = document.getElementById('create-display-name').value.trim();
            const roomName = document.getElementById('create-name').value.trim();
            const key = document.getElementById('create-key').value;
            const requireApproval = document.getElementById('create-approval')?.checked;
            if (!displayName || !roomName || !key) {
                showToast('Your name, room name, and password are required.', 'error');
                return;
            }
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'createRoom', displayName, roomName, key, requireApproval });
            }, 'Creating room…');
        });

        document.getElementById('btn-join')?.addEventListener('click', (e) => {
            const roomId = document.getElementById('join-id').value.trim();
            const name = document.getElementById('join-name').value.trim();
            const key = document.getElementById('join-key').value;
            if (!roomId || !name || !key) {
                showToast('Please fill in all fields.', 'error');
                return;
            }
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'joinRoom', roomId, name, key });
            }, 'Connecting to room…');
        });

        document.getElementById('btn-leave')?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'leaveRoom' });
                showView('selection');
            }, 'Left the room.');
        });

        document.getElementById('btn-copy-room-id')?.addEventListener('click', async (e) => {
            const id = roomIdDisplay?.textContent?.trim();
            if (id && id !== '---') {
                await navigator.clipboard.writeText(id);
                withAction(e.currentTarget, () => {}, 'Room ID copied.');
            }
        });

        document.getElementById('btn-copy-invite')?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'copyInvite' });
            });
        });

        btnDeactivate?.addEventListener('click', (e) => {
            if (confirm('Deactivate room? All participants will be disconnected in 2 minutes.')) {
                withAction(e.currentTarget, () => {
                    vscode.postMessage({ command: 'deactivateRoom' });
                }, 'Room deactivation started.');
            }
        });

        btnStopDeactivation?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'cancelDeactivation' });
            }, 'Deactivation cancelled.');
        });

        document.getElementById('btn-pull-sync')?.addEventListener('click', (e) => {
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'pullSync' });
            });
        });

        document.getElementById('btn-sync-check')?.addEventListener('click', (e) => {
            archContainer?.classList.remove('hidden');
            archContainer.innerHTML = '<p class="text-gray-500 animate-pulse">Comparing workspace...</p>';
            withAction(e.currentTarget, () => {
                vscode.postMessage({ command: 'checkSync' });
            });
        });

        const chatInput = document.getElementById('chat-input');
        const btnSendChat = document.getElementById('btn-send-chat');
        const sendChat = () => {
            const text = chatInput?.value?.trim();
            if (text) {
                withAction(btnSendChat, () => {
                    vscode.postMessage({ command: 'sendChat', text });
                    if (chatInput) chatInput.value = '';
                }, 'Message sent.');
            }
        };
        btnSendChat?.addEventListener('click', sendChat);
        chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

        const renderChat = (messages) => {
            const box = document.getElementById('chat-messages');
            if (!box) return;
            const list = Array.isArray(messages) ? messages : [messages];
            box.innerHTML = list.map(m =>
                `<div><span class="text-blue-400 font-medium">${escapeHtml(m.username)}:</span> <span class="text-gray-300">${escapeHtml(m.text)}</span></div>`
            ).join('');
            box.scrollTop = box.scrollHeight;
        };

        const escapeHtml = (value) => String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

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
                    showToast(`Joined ${msg.roomName || 'room'} successfully.`, 'success');
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
                        showToast('Folder comparison updated.', 'info');
                    }
                    break;

                case 'JOIN_PENDING':
                    pendingJoins?.classList.remove('hidden');
                    showToast('Waiting for host approval…', 'info');
                    const pending = msg.pending || [{ socketId: msg.socketId, username: msg.userName }];
                    pendingList.innerHTML = pending.map(p =>
                        `<div class="flex gap-2 items-center text-xs">
                            <span>${p.username}</span>
                            <button class="approve-join btn-action bg-green-700 px-2 py-0.5 rounded" data-id="${p.socketId}">Approve</button>
                            <button class="deny-join btn-action bg-red-800 px-2 py-0.5 rounded" data-id="${p.socketId}">Deny</button>
                        </div>`
                    ).join('');
                    pendingList.querySelectorAll('.approve-join').forEach(b => b.addEventListener('click', () => {
                        withAction(b, () => {
                            vscode.postMessage({ command: 'approveJoin', targetSocketId: b.dataset.id, role: 'editor' });
                        }, 'Join request approved.');
                    }));
                    pendingList.querySelectorAll('.deny-join').forEach(b => b.addEventListener('click', () => {
                        withAction(b, () => {
                            vscode.postMessage({ command: 'denyJoin', targetSocketId: b.dataset.id });
                        }, 'Join request denied.');
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
                    showToast('Room deactivation countdown started.', 'info');
                    break;

                case 'DEACTIVATION_CANCELLED':
                    deactivationOverlay?.classList.add('hidden');
                    clearInterval(countdownInterval);
                    showToast('Deactivation cancelled.', 'success');
                    break;

                case 'ROOM_TERMINATED':
                    deactivationOverlay?.classList.add('hidden');
                    clearInterval(countdownInterval);
                    showView('selection');
                    showToast('Room deactivated.', 'info');
                    break;

                case 'JOIN_RESULT':
                    if (!msg.success) showToast(msg.error || 'Failed to join room.', 'error');
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

                case 'TOAST':
                    showToast(msg.message, msg.level || 'info');
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
