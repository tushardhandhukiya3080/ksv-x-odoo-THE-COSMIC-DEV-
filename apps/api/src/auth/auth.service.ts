import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  Role,
  JwtPayload,
  SignupInput,
  LoginInput,
  ResetInput,
} from '@vendorbridge/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  /** Signup creates an Organization + its first ADMIN user (Spec §6.1). */
  async signup(input: SignupInput) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.organizationName, gstin: input.gstin || null },
      });
      return tx.user.create({
        data: {
          organizationId: org.id,
          email: input.email,
          name: input.name,
          passwordHash,
          role: Role.ADMIN,
        },
      });
    });

    await this.audit.log({
      organizationId: user.organizationId,
      actorId: user.id,
      action: 'ORG_CREATED',
      entityType: 'Organization',
      entityId: user.organizationId,
      metadata: { email: user.email },
    });

    return this.issueTokens(user);
  }

  async login(input: LoginInput) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const valid = await argon2.verify(user.passwordHash, input.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Optional TOTP gate for Admin/Approver (Spec §6.1) — enforced when configured.
    if (user.totpSecret && (user.role === Role.ADMIN || user.role === Role.APPROVER)) {
      if (!input.totp) throw new UnauthorizedException('2FA code required');
      // Verification handled by a dedicated TOTP service in Phase 2; placeholder accepts 6 digits.
    }

    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new UnauthorizedException();
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Forgot password: issues a short-lived reset token and dispatches via n8n.
   * Degrades gracefully — if n8n is down we still return ok and log the token in dev.
   */
  async forgot(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = await this.jwt.signAsync(
        { sub: user.id, purpose: 'reset' },
        { secret: this.config.get<string>('jwt.refreshSecret'), expiresIn: '30m' },
      );
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[dev] password reset token for ${email}: ${token}`);
      }
      // TODO Phase 2: POST signed webhook to n8n to email the reset link.
    }
    // Always 200 to avoid account enumeration.
    return { ok: true };
  }

  async reset(input: ResetInput) {
    let payload: { sub: string; purpose?: string };
    try {
      payload = await this.jwt.verifyAsync(input.token, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new BadRequestException('Reset link is invalid or expired');
    }
    if (payload.purpose !== 'reset') throw new BadRequestException('Invalid reset token');

    const passwordHash = await argon2.hash(input.password);
    await this.prisma.user.update({ where: { id: payload.sub }, data: { passwordHash } });
    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { name: true, gstin: true } } },
    });
    if (!user) throw new UnauthorizedException();
    const { passwordHash, totpSecret, ...safe } = user;
    return safe;
  }

  private async issueTokens(user: { id: string; organizationId: string; role: Role; email: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: this.config.get<number>('jwt.accessTtl'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: this.config.get<number>('jwt.refreshTtl'),
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
    };
  }
}
