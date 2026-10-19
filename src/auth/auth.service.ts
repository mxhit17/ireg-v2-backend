import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt, createHmac } from 'crypto';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly otpExpiryMinutes = 5;
  private readonly maxOtpAttempts = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashOtp(otp: string): string {
    const secret = this.configService.get<string>('OTP_SECRET');

    if (!secret) {
      throw new InternalServerErrorException(
        'OTP configuration is missing',
      );
    }

    return createHmac('sha256', secret)
      .update(otp)
      .digest('hex');
  }

  async register(dto: RegisterDto) {
    console.log('[REGISTER] Started');

    const email = this.normalizeEmail(dto.email);

  console.log('[REGISTER] Checking existing user');
  
    const existingUser = await this.prisma.users.findFirst({
      where: {
        email,
        deleted_at: null,
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException(
        'An account with this email already exists',
      );
    }
    // Your existing Prisma query
  console.log('[REGISTER] Existing user check completed');


    // Hash the password before temporarily storing it.
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Generate a cryptographically secure six-digit OTP.
    const otp = randomInt(100000, 1000000).toString();
    const otpHash = this.hashOtp(otp);

    const expiresAt = new Date(
      Date.now() + this.otpExpiryMinutes * 60 * 1000,
    );
console.log('[REGISTER] Saving pending registration');
    // Replace any previous pending registration for this email.
    await this.prisma.pending_registrations.upsert({
      where: { email },
      create: {
        email,
        name: dto.name.trim(),
        password_hash: passwordHash,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts: 0,
      },
      update: {
        name: dto.name.trim(),
        password_hash: passwordHash,
        otp_hash: otpHash,
        expires_at: expiresAt,
        attempts: 0,
      },
    });

  
  // Your existing Prisma upsert/create
  console.log('[REGISTER] Pending registration saved');

  console.log('[REGISTER] Sending OTP email');
  // Your existing mailService.sendOtpEmail(...) call
  

    try {
      await this.mailService.sendOtpEmail(email, otp);
      console.log('[REGISTER] OTP email sent');
    } catch {
      // Do not leave an apparently valid registration behind
      // if the email could not be sent.
      await this.prisma.pending_registrations.deleteMany({
        where: { email, otp_hash: otpHash },
      });

      throw new InternalServerErrorException(
        'Unable to send verification email. Please try again.',
      );
    }

    return {
      success: true,
      message: 'OTP sent to your email. Verify it to complete registration.',
      expiresInSeconds: this.otpExpiryMinutes * 60,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const email = this.normalizeEmail(dto.email);

    const pending =
      await this.prisma.pending_registrations.findUnique({
        where: { email },
      });

    if (!pending) {
      throw new BadRequestException(
        'No pending registration found. Please register again.',
      );
    }

    if (pending.expires_at.getTime() <= Date.now()) {
      await this.prisma.pending_registrations.deleteMany({
        where: { email },
      });

      throw new BadRequestException(
        'OTP has expired. Please register again.',
      );
    }

    if (pending.attempts >= this.maxOtpAttempts) {
      await this.prisma.pending_registrations.deleteMany({
        where: { email },
      });

      throw new BadRequestException(
        'Too many incorrect attempts. Please register again.',
      );
    }

    const submittedOtpHash = this.hashOtp(dto.otp);

    if (submittedOtpHash !== pending.otp_hash) {
      const updated = await this.prisma.pending_registrations.updateMany({
        where: {
          email,
          otp_hash: pending.otp_hash,
          attempts: { lt: this.maxOtpAttempts },
        },
        data: { attempts: { increment: 1 } },
      });

      if (updated.count === 0) {
        throw new BadRequestException(
          'Registration expired or attempts exceeded. Please register again.',
        );
      }

      throw new UnauthorizedException('Invalid OTP');
    }

    try {
      // Create the real account and remove the pending record atomically.
        const user = await this.prisma.$transaction(async (tx) => {
        const currentPending =
            await tx.pending_registrations.findUnique({
            where: { email },
            });

        if (
            !currentPending ||
            currentPending.otp_hash !== pending.otp_hash ||
            currentPending.expires_at.getTime() <= Date.now() ||
            currentPending.attempts >= this.maxOtpAttempts
        ) {
            throw new BadRequestException(
            'OTP is no longer valid. Please register again.',
            );
        }

        // 1. Find the default role.
        const userRole = await tx.roles.findUnique({
            where: { name: 'USER' },
            select: { id: true },
        });

        if (!userRole) {
            throw new InternalServerErrorException(
            'Default USER role is not configured.',
            );
        }

        // 2. Create the verified user and assign the role.
        const createdUser = await tx.users.create({
            data: {
            name: currentPending.name,
            email: currentPending.email,
            password_hash: currentPending.password_hash,
            is_verified: true,

            user_roles: {
                create: {
                roles: {
                    connect: {
                    id: userRole.id,
                    },
                },
                },
            },
            },
            select: {
            id: true,
            name: true,
            email: true,
            is_verified: true,
            created_at: true,
            user_roles: {
                select: {
                roles: {
                    select: {
                    id: true,
                    name: true,
                    },
                },
                },
            },
            },
        });

        // 3. Remove the pending registration.
        await tx.pending_registrations.delete({
            where: { email },
        });

        return createdUser;
        });


      const roles = user.user_roles.map(({ roles: role }) => role.name);
      const identityPayload = { sub: user.id, email: user.email };
      const accessPayload = { ...identityPayload, roles };
      const accessSecret = this.configService.get<string>('JWT_ACCESS_SECRET');
      const refreshSecret = this.configService.get<string>('JWT_REFRESH_SECRET');

      if (!accessSecret || !refreshSecret) {
        throw new InternalServerErrorException(
          'JWT configuration is missing',
        );
      }

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(accessPayload, {
          secret: accessSecret,
          expiresIn: Number(
            this.configService.get<string>('JWT_ACCESS_EXPIRES_IN_SECONDS', '900'),
          ),
        }),
        this.jwtService.signAsync(identityPayload, {
          secret: refreshSecret,
          expiresIn: Number(
            this.configService.get<string>('JWT_REFRESH_EXPIRES_IN_SECONDS', '604800'),
          ),
        }),
      ]);

      return {
        success: true,
        message: 'Registration completed successfully.',
        data: user,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // P2002 means a unique constraint was violated.
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists.',
        );
      }

      throw error;
    }
  }


  async login(dto: LoginDto) {
    const email = this.normalizeEmail(dto.email);

    // 1. Find the existing, non-deleted user.
    const user = await this.prisma.users.findFirst({
      where: {
        email,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        password_hash: true,
        is_verified: true,
        created_at: true,
        user_roles: {
          select: {
            roles: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Use the same error for an unknown email and incorrect password.
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Ensure the account is verified.
    if (!user.is_verified) {
      throw new UnauthorizedException(
        'Please verify your email before logging in.',
      );
    }

    // 3. Compare the submitted password against the stored bcrypt hash.
    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Extract assigned role names.
    const roles = user.user_roles.map(
      ({ roles: role }) => role.name,
    );

    // 5. Create the same JWT payloads as verifyOtp.
    const identityPayload = {
      sub: user.id,
      email: user.email,
    };

    const accessPayload = {
      ...identityPayload,
      roles,
    };

    const accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
    );

    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
    );

    if (!accessSecret || !refreshSecret) {
      throw new InternalServerErrorException(
        'JWT configuration is missing',
      );
    }

    const accessExpiresIn = Number(
      this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN_SECONDS',
        '900',
      ),
    );

    const refreshExpiresIn = Number(
      this.configService.get<string>(
        'JWT_REFRESH_EXPIRES_IN_SECONDS',
        '604800',
      ),
    );

    if (
      !Number.isSafeInteger(accessExpiresIn) ||
      accessExpiresIn <= 0 ||
      !Number.isSafeInteger(refreshExpiresIn) ||
      refreshExpiresIn <= 0
    ) {
      throw new InternalServerErrorException(
        'JWT expiration configuration is invalid',
      );
    }

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn,
      }),
      this.jwtService.signAsync(identityPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn,
      }),
    ]);

    // 6. Return the same response structure as verifyOtp.
    const { password_hash, ...publicUser } = user;

    return {
      success: true,
      message: 'Login successful.',
      data: publicUser,
      accessToken,
      refreshToken,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const refreshSecret = this.configService.get<string>(
      'JWT_REFRESH_SECRET',
    );

    const accessSecret = this.configService.get<string>(
      'JWT_ACCESS_SECRET',
    );

    if (!refreshSecret || !accessSecret) {
      throw new InternalServerErrorException(
        'JWT configuration is missing',
      );
    }

    let payload: {
      sub: string;
      email: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token is invalid or expired. Please log in again.',
      );
    }

    // Fetch the current user and roles rather than trusting
    // potentially outdated role information from a token.
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      include: {
        user_roles: {
          include: {
            roles: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }

    const roles = user.user_roles.map(
      ({ roles: role }) => role.name,
    );

    const accessPayload = {
      sub: user.id,
      email: user.email,
      roles,
    };

    const accessToken = await this.jwtService.signAsync(
      accessPayload,
      {
        secret: accessSecret,
        expiresIn: Number(
          this.configService.get<string>(
            'JWT_ACCESS_EXPIRES_IN_SECONDS',
            '900',
          ),
        ),
      },
    );

    return {
      success: true,
      message: 'Access token renewed successfully.',
      accessToken,
    };
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        user_roles: {
          select: {
            roles: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const roles = user.user_roles.map(
      ({ roles: role }) => role.name,
    );

    return {
      success: true,
      message: 'Current user fetched successfully.',
      data: {
        id: user.id,
        email: user.email,
        roles,
      },
    };
  }

}



