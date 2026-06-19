import { createRequire } from 'module';
import * as path from 'path';

const requireFrom = createRequire(__filename);

function loadModule<T>(runtimeName: string, packageName: string): T {
    try {
        return requireFrom(path.join(__dirname, '..', 'runtime', runtimeName)) as T;
    } catch {
        return requireFrom(packageName) as T;
    }
}

const dmp = loadModule<{ diff_match_patch: typeof import('diff-match-patch').diff_match_patch }>(
    'diff-match-patch',
    'diff-match-patch'
);
export const diff_match_patch = dmp.diff_match_patch;

// Constructor for the Node `ws` package (not the browser WebSocket API).
export const WsWebSocket = loadModule<new (url: string) => import('ws')>('ws', 'ws');
