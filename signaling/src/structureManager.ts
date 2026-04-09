export interface FileNode {
    path: string;
    name: string;
    type: 'file' | 'directory';
}

export class StructureManager {
    /**
     * Compares local manifest with a peer's manifest.
     */
    public static compareStructures(local: string[], peer: string[]) {
        const allPaths = Array.from(new Set([...local, ...peer])).sort();
        
        return allPaths.map(p => ({
            path: p,
            isLocal: local.includes(p),
            isPeer: peer.includes(p),
            status: local.includes(p) && peer.includes(p) ? 'match' : 
                    peer.includes(p) ? 'missing-locally' : 'extra-locally'
        }));
    }
}