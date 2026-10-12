
import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

interface AuthenticatedRequest {
  user?: {
    id: string;
    email: string;
    roles: Role[];
  };
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<Role[]>(
        ROLES_KEY,
        [
          context.getHandler(),
          context.getClass(),
        ],
      );

    // No role requirement means no role restriction.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();

    const userRoles = request.user?.roles;

    if (!userRoles?.length) {
      return false;
    }

    // Allow access if the user has ANY one of the required roles.
    return requiredRoles.some((role) =>
      userRoles.includes(role),
    );
  }
}
