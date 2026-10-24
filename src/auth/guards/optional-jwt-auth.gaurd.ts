import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err, user, info) {
    // Reject invalid supplied tokens, but allow missing tokens.
    if (err) {
      throw err;
    }

    if (user) {
      return user;
    }

    if (info?.name === 'JsonWebTokenError' ||
        info?.name === 'TokenExpiredError') {
      throw info;
    }

    return null;
  }
}