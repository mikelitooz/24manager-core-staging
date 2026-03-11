import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/**
 * JWT guard for admin billing endpoints.
 * Checks for `admin_session` cookie and verifies its validity.
 */
@Injectable()
export class AdminJwtGuard implements CanActivate {
    private readonly logger = new Logger(AdminJwtGuard.name);

    constructor(private jwtService: JwtService) { }

    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const token = request.cookies?.['admin_session'];

        if (!token) {
            throw new UnauthorizedException('Authentication required');
        }

        try {
            const payload = this.jwtService.verify(token, {
                secret: process.env.ADMIN_API_KEY || 'supersecretkey2026'
            });
            request['admin'] = payload;
            return true;
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired session');
        }
    }
}
