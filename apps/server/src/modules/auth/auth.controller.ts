import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { loginRequestSchema, registerRequestSchema } from '@holdem/shared';
import type { z } from 'zod';
import type { AppConfig } from '../../config/config.js';
import { CONFIG } from '../../config/tokens.js';
import { WalletService } from '../wallet/wallet.service.js';
import { AuthGuard } from './auth.guard.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { TicketService } from './ticket.service.js';

function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message));
  return parsed.data;
}

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(TicketService) private readonly tickets: TicketService,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(WalletService) private readonly wallet: WalletService,
  ) {}

  @Post('register')
  async register(@Body() body: unknown): Promise<{ userId: string; username: string }> {
    const { username, password } = parseBody(registerRequestSchema, body);
    return this.auth.register(username, password);
  }

  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<{ accessToken: string; expiresIn: number }> {
    const { username, password } = parseBody(loginRequestSchema, body);
    return this.auth.login(username, password);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(@Req() request: AuthenticatedRequest): Promise<{ userId: string; username: string; balance: string }> {
    const { userId, username } = request.user!;
    const balance = await this.wallet.balanceOf({ type: 'user', id: userId });
    return { userId, username, balance: balance.toString() };
  }

  @Post('ws-ticket')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  issueTicket(@Req() request: AuthenticatedRequest): { ticket: string; expiresIn: number } {
    const ticket = this.tickets.issue(request.user!);
    return { ticket, expiresIn: this.config.wsTicketTtlSeconds };
  }
}
