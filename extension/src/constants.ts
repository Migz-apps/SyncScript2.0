/** Public signaling server used when users have not configured their own. */
export const DEFAULT_SIGNALING_URL = 'wss://syncscript-signaling.onrender.com';

export function signalingUrlToHttp(signalingUrl: string): string {
    return signalingUrl.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://').replace(/\/$/, '');
}
