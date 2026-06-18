import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * End-to-end encryption for file content relayed through the signaling server.
 * The server relays ciphertext only — it cannot read file contents.
 */
export class EncryptionService {
    private key: Buffer | null = null;

    public setKey(passphrase: string): void {
        if (!passphrase) {
            this.key = null;
            return;
        }
        this.key = crypto.scryptSync(passphrase, 'syncscript-salt', 32);
    }

    public isEnabled(): boolean {
        return this.key !== null;
    }

    public encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } | null {
        if (!this.key) {
            return null;
        }
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return {
            encrypted: encrypted.toString('base64'),
            iv: iv.toString('base64'),
            tag: tag.toString('base64')
        };
    }

    public decrypt(payload: { encrypted: string; iv: string; tag: string }): string | null {
        if (!this.key) {
            return null;
        }
        try {
            const decipher = crypto.createDecipheriv(
                ALGORITHM,
                this.key,
                Buffer.from(payload.iv, 'base64')
            );
            decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(payload.encrypted, 'base64')),
                decipher.final()
            ]);
            return decrypted.toString('utf8');
        } catch {
            return null;
        }
    }

    public wrapMessage(content: string): Record<string, unknown> {
        const result = this.encrypt(content);
        if (!result) {
            return { content, encrypted: false };
        }
        return {
            encrypted: true,
            ciphertext: result.encrypted,
            iv: result.iv,
            authTag: result.tag
        };
    }

    public unwrapMessage(data: Record<string, unknown>): string {
        if (data.encrypted !== true) {
            return String(data.content ?? '');
        }
        const decrypted = this.decrypt({
            encrypted: String(data.ciphertext ?? ''),
            iv: String(data.iv ?? ''),
            tag: String(data.authTag ?? data.tag ?? '')
        });
        return decrypted ?? '';
    }
}
