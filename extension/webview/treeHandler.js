/**
 * Renders the Visual Architecture Tree
 * Green = Exists locally
 * Red = Exists on peer but missing locally
 */
function renderArchitectureTree(peerManifest, localManifest) {
    const container = document.getElementById('member-list'); // Reusing container or create new one
    const treeTitle = document.createElement('p');
    treeTitle.className = "text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold mt-4 mb-2";
    treeTitle.innerText = "Sync Map (Peer vs You)";
    
    const treeContainer = document.createElement('div');
    treeContainer.className = "space-y-1 font-mono text-[11px]";

    // Combine and unique all paths
    const allPaths = Array.from(new Set([...peerManifest, ...localManifest])).sort();

    allPaths.forEach(path => {
        const item = document.createElement('div');
        const hasLocal = localManifest.includes(path);
        const hasPeer = peerManifest.includes(path);

        if (hasLocal && hasPeer) {
            item.className = "flex items-center space-x-2 text-emerald-400 opacity-80";
            item.innerHTML = `<span>✔</span> <span>${path}</span>`;
        } else if (hasPeer && !hasLocal) {
            item.className = "flex items-center space-x-2 text-red-400 glow-red";
            item.innerHTML = `<span>+</span> <span class="italic">${path} (Missing)</span>`;
        } else {
            // Local only
            item.className = "flex items-center space-x-2 text-slate-500";
            item.innerHTML = `<span>?</span> <span>${path} (Local Only)</span>`;
        }
        
        treeContainer.appendChild(item);
    });

    container.appendChild(treeTitle);
    container.appendChild(treeContainer);
}