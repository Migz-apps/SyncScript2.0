/**
 * Utility to render a file tree into the archContainer
 */
const TreeViewRenderer = {
    render(container, diffData) {
        // Clear current content and add header
        container.innerHTML = '<p class="text-[10px] text-slate-500 mb-2 uppercase tracking-widest">Workspace Sync Tree</p>';
        
        if (!diffData || diffData.length === 0) {
            container.innerHTML += '<p class="text-gray-500 italic">No files detected.</p>';
            return;
        }

        diffData.forEach(item => {
            const div = document.createElement('div');
            div.className = "flex items-center gap-2 py-1 px-2 hover:bg-white/5 rounded transition-colors";
            
            let icon = '';
            let textClass = 'text-slate-300';
            
            if (item.status === 'match') {
                icon = '<span class="text-emerald-500 text-[10px]">✔</span>';
            } else if (item.status === 'missing-locally') {
                icon = '<span class="text-red-500 font-bold">+</span>';
                textClass = 'text-red-400 italic';
            } else {
                icon = '<span class="text-slate-500">?</span>';
                textClass = 'text-slate-500';
            }

            div.innerHTML = `
                ${icon}
                <span class="${textClass} font-mono text-[11px] truncate" title="${item.path}">${item.path}</span>
            `;
            container.appendChild(div);
        });
    }
};

// Export to window so main.js can access it
window.TreeViewRenderer = TreeViewRenderer;