import * as crypto from 'crypto';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  username?: string;
  orgId?: string;
}

/**
 * Supports API key auth and GitHub OAuth token validation.
 */
export class AuthService {
  private readonly apiKeys: Set<string>;
  private readonly githubEnabled: boolean;

  constructor() {
    this.apiKeys = new Set(
      (process.env.API_KEYS ?? process.env.SYNCSCRIPT_API_KEY ?? '')
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    );
    this.githubEnabled = process.env.GITHUB_OAUTH_ENABLED === 'true';
  }

  public async validateToken(token: string | undefined): Promise<AuthResult> {
    if (!token) {
      return { valid: this.apiKeys.size === 0 };
    }

    if (this.apiKeys.has(token)) {
      return { valid: true, userId: crypto.createHash('sha256').update(token).digest('hex').slice(0, 12) };
    }

    if (this.githubEnabled) {
      return this.validateGitHubToken(token);
    }

    return { valid: false };
  }

  private async validateGitHubToken(token: string): Promise<AuthResult> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'SyncScript' }
      });
      if (!response.ok) {
        return { valid: false };
      }
      const user = await response.json() as { login?: string; id?: number };
      return {
        valid: true,
        userId: String(user.id ?? ''),
        username: user.login
      };
    } catch {
      return { valid: false };
    }
  }

  public requiresAuth(): boolean {
    return this.apiKeys.size > 0 || this.githubEnabled;
  }
}
