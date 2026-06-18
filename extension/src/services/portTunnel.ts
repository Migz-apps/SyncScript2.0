import * as http from 'http';

export interface TunnelRequest {
    requestId: string;
    port: number;
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
}

/**
 * Proxies HTTP requests to locally forwarded ports and relays responses through the signaling server.
 */
export class PortTunnelService {
    private forwardedPorts = new Set<number>();

    public announcePort(port: number): void {
        this.forwardedPorts.add(port);
    }

    public removePort(port: number): void {
        this.forwardedPorts.delete(port);
    }

    public getPorts(): number[] {
        return Array.from(this.forwardedPorts);
    }

    public async handleTunnelRequest(
        request: TunnelRequest,
        sendResponse: (payload: Record<string, unknown>) => void
    ): Promise<void> {
        if (!this.forwardedPorts.has(request.port)) {
            sendResponse({
                type: 'TUNNEL_RESPONSE',
                requestId: request.requestId,
                status: 403,
                body: 'Port not forwarded',
                headers: {}
            });
            return;
        }

        try {
            const response = await this.localRequest(request);
            sendResponse({
                type: 'TUNNEL_RESPONSE',
                requestId: request.requestId,
                status: response.status,
                headers: response.headers,
                body: response.body
            });
        } catch (error) {
            sendResponse({
                type: 'TUNNEL_RESPONSE',
                requestId: request.requestId,
                status: 502,
                body: error instanceof Error ? error.message : 'Proxy error',
                headers: {}
            });
        }
    }

    public async proxyToRemote(
        port: number,
        path: string,
        sendTunnel: (payload: Record<string, unknown>) => void,
        hostSocketId: string
    ): Promise<{ status: number; body: string; headers: Record<string, string> }> {
        const requestId = `tunnel-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Tunnel timeout')), 10000);

            const handler = (msg: Record<string, unknown>) => {
                if (msg.type === 'TUNNEL_RESPONSE' && msg.requestId === requestId) {
                    clearTimeout(timeout);
                    resolve({
                        status: Number(msg.status ?? 502),
                        body: String(msg.body ?? ''),
                        headers: (msg.headers as Record<string, string>) ?? {}
                    });
                }
            };

            sendTunnel({
                type: 'TUNNEL_REQUEST',
                requestId,
                port,
                method: 'GET',
                path,
                targetSocketId: hostSocketId
            });

            void handler;
        });
    }

    private localRequest(req: TunnelRequest): Promise<{ status: number; body: string; headers: Record<string, string> }> {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: '127.0.0.1',
                port: req.port,
                path: req.path || '/',
                method: req.method || 'GET',
                headers: req.headers,
                timeout: 8000
            };

            const request = http.request(options, (res) => {
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    resolve({
                        status: res.statusCode ?? 200,
                        body: Buffer.concat(chunks).toString('utf8'),
                        headers: Object.fromEntries(
                            Object.entries(res.headers).map(([k, v]) => [k, String(v)])
                        )
                    });
                });
            });

            request.on('error', reject);
            request.on('timeout', () => {
                request.destroy();
                reject(new Error('Local request timeout'));
            });

            if (req.body) {
                request.write(req.body);
            }
            request.end();
        });
    }

    public reset(): void {
        this.forwardedPorts.clear();
    }
}
