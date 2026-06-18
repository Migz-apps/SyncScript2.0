import { UserRole } from '../types/messages';

export class PermissionManager {
    private role: UserRole = 'viewer';

    public setRole(role: UserRole): void {
        this.role = role;
    }

    public getRole(): UserRole {
        return this.role;
    }

    public canEdit(): boolean {
        return this.role === 'host' || this.role === 'co-host' || this.role === 'editor' || this.role === 'presenter';
    }

    public canAdmin(): boolean {
        return this.role === 'host' || this.role === 'co-host';
    }

    public isPresenter(): boolean {
        return this.role === 'presenter';
    }

    public canView(): boolean {
        return true;
    }

    public isReadOnly(): boolean {
        return this.role === 'viewer';
    }
}
