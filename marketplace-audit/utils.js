import WebSocket from 'ws';

export const TIMEOUT = 8000;

export function toHttp(url) {
    return url.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

export async function fetchNIP11(relayUrl) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(toHttp(relayUrl), {
            headers: { 'Accept': 'application/nostr+json' },
            signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        return await res.json();
    } catch {
        clearTimeout(timer);
        return null;
    }
}

export class RelayAuditor {
    constructor(url) {
        this.url = url;
        this.ws = null;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.url);
            const timer = setTimeout(() => {
                ws.terminate();
                reject(new Error('Connection timeout'));
            }, TIMEOUT);

            ws.on('open', () => {
                clearTimeout(timer);
                this.ws = ws;
                resolve();
            });

            ws.on('error', (err) => {
                clearTimeout(timer);
                reject(err);
            });
        });
    }

    async query(subId, filter) {
        if (!this.ws) throw new Error('Not connected');

        return new Promise((resolve) => {
            const events = [];
            const start = performance.now();
            let eoseAt = null;
            let firstEventAt = null;
            let closedReason = null;

            const timer = setTimeout(() => {
                cleanup();
                resolve({ events, firstEventAt, eoseAt, timedOut: true, closedReason });
            }, TIMEOUT);

            const cleanup = () => {
                clearTimeout(timer);
                this.ws.off('message', onMessage);
                try {
                    this.ws.send(JSON.stringify(['CLOSE', subId]));
                } catch { }
            };

            const onMessage = (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg[0] === 'EVENT' && msg[1] === subId) {
                        const now = performance.now() - start;
                        if (!firstEventAt) firstEventAt = now;
                        events.push(msg[2]);
                    } else if (msg[0] === 'EOSE' && msg[1] === subId) {
                        eoseAt = performance.now() - start;
                        cleanup();
                        resolve({ events, firstEventAt, eoseAt, timedOut: false, closedReason });
                    } else if (msg[0] === 'CLOSED' && msg[1] === subId) {
                        closedReason = msg[2];
                        cleanup();
                        resolve({ events, firstEventAt, eoseAt, timedOut: false, closedReason });
                    }
                } catch { }
            };

            this.ws.on('message', onMessage);
            this.ws.send(JSON.stringify(['REQ', subId, filter]));
        });
    }

    async close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
