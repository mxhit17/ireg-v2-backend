import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { consultation_status, message_type } from 'src/generated/prisma/enums';
import { CashfreeService } from './cashfree.service';
import { CreateConsultationDto } from './dto/create-consultation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { ListMessagesDto } from './dto/list-messages.dto';

const consultationInclude = {
  consultation_services: true,
  users_consultations_user_idTousers: {
    select: { id: true, name: true, email: true },
  },
  users_consultations_sme_idTousers: {
    select: { id: true, name: true, email: true },
  },
} as const;

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cashfree: CashfreeService,
  ) {}

  listServices() {
    return this.prisma.consultation_services.findMany({
      where: { is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async getService(id: string) {
    const service = await this.prisma.consultation_services.findFirst({
      where: { id, is_active: true },
    });
    if (!service)
      throw new NotFoundException('Consultation service not found.');
    return service;
  }

  async createConsultation(userId: string, dto: CreateConsultationDto) {
    const service = await this.prisma.consultation_services.findFirst({
      where: { id: dto.service_id, is_active: true },
    });
    if (!service)
      throw new NotFoundException('Consultation service not found.');

    return this.prisma.consultations.create({
      data: {
        user_id: userId,
        service_id: service.id,
        amount: service.price,
        currency: service.currency,
      },
      include: consultationInclude,
    });
  }

  listMine(userId: string) {
    return this.prisma.consultations.findMany({
      where: { user_id: userId },
      include: consultationInclude,
      orderBy: { created_at: 'desc' },
    });
  }

  async getConsultation(id: string, userId: string, roles: string[]) {
    const consultation = await this.prisma.consultations.findUnique({
      where: { id },
      include: consultationInclude,
    });
    if (!consultation) throw new NotFoundException('Consultation not found.');
    if (
      consultation.user_id !== userId &&
      consultation.sme_id !== userId &&
      !roles.includes('ADMIN')
    ) {
      throw new ForbiddenException('You cannot access this consultation.');
    }
    return consultation;
  }

  async initiatePayment(id: string, userId: string, returnUrl?: string) {
    const consultation = await this.prisma.consultations.findUnique({
      where: { id },
      include: { users_consultations_user_idTousers: true },
    });
    if (!consultation) throw new NotFoundException('Consultation not found.');
    if (consultation.user_id !== userId) {
      throw new ForbiddenException(
        'Only the booking user can initiate payment.',
      );
    }
    if (consultation.status !== consultation_status.PENDING_PAYMENT) {
      throw new ConflictException('This consultation is not awaiting payment.');
    }

    const configuredReturnUrl = this.config.get<string>('CASHFREE_RETURN_URL');
    if (!configuredReturnUrl) {
      throw new ServiceUnavailableException(
        'Cashfree return URL is not configured. Set CASHFREE_RETURN_URL to your application payment return page.',
      );
    }
    let checkoutUrl: URL;
    let suppliedReturnUrl: URL | undefined;
    try {
      checkoutUrl = new URL(configuredReturnUrl);
      if (returnUrl) suppliedReturnUrl = new URL(returnUrl);
    } catch {
      throw new BadRequestException(
        'Payment return URL must be a valid absolute URL.',
      );
    }
    if (suppliedReturnUrl && suppliedReturnUrl.origin !== checkoutUrl.origin) {
      throw new BadRequestException(
        'return_url must use the same origin as CASHFREE_RETURN_URL.',
      );
    }
    if (
      this.cashfree.getEnvironment() === 'production' &&
      (checkoutUrl.protocol !== 'https:' ||
        (this.config.get<string>('CASHFREE_WEBHOOK_URL') &&
          !this.config
            .get<string>('CASHFREE_WEBHOOK_URL')
            ?.startsWith('https://')))
    ) {
      throw new BadRequestException(
        'Production Cashfree return and webhook URLs must use HTTPS.',
      );
    }

    const customer = consultation.users_consultations_user_idTousers;
    if (Number(consultation.amount) < 1) {
      throw new BadRequestException(
        'Cashfree requires a payment amount of at least 1.',
      );
    }
    if (!customer.phone?.trim()) {
      throw new BadRequestException(
        'Add a phone number to your profile before starting payment.',
      );
    }
    const orderId =
      consultation.cashfree_order_id ??
      `ireg_${consultation.id.replaceAll('-', '')}`;
    let order;
    if (consultation.cashfree_order_id) {
      order = await this.cashfree.getOrder(orderId);
    } else {
      try {
        const effectiveReturnUrl = new URL(
          suppliedReturnUrl?.toString() ?? checkoutUrl.toString(),
        );
        effectiveReturnUrl.searchParams.set('consultation_id', consultation.id);
        order = await this.cashfree.createOrder({
          orderId,
          idempotencyKey: consultation.id,
          amount: Number(consultation.amount.toFixed(2)),
          currency: consultation.currency.trim(),
          customerId: consultation.user_id,
          customerName: customer.name,
          customerEmail: customer.email,
          customerPhone: normalizeIndianPhone(customer.phone),
          returnUrl: effectiveReturnUrl.toString(),
          notifyUrl: this.config.get<string>('CASHFREE_WEBHOOK_URL'),
        });
      } catch (createError) {
        // Recover safely if Cashfree created the order but the response was lost.
        try {
          order = await this.cashfree.getOrder(orderId);
        } catch {
          throw createError;
        }
      }
    }

    if (order.order_id !== orderId) {
      throw new ServiceUnavailableException(
        'Cashfree returned an unexpected order.',
      );
    }
    this.assertCashfreeOrderMatches(consultation, order);
    if (order.order_status === 'PAID') {
      await this.markConsultationPaid(consultation.id);
      return {
        consultation_id: consultation.id,
        order_id: orderId,
        status: consultation_status.PAID,
      };
    }
    if (order.order_status !== 'ACTIVE' || !order.payment_session_id) {
      throw new ConflictException('Cashfree order cannot accept payment.');
    }

    await this.prisma.consultations.update({
      where: { id: consultation.id },
      data: {
        cashfree_order_id: orderId,
        cashfree_payment_session_id: order.payment_session_id,
        updated_at: new Date(),
      },
    });

    return {
      consultation_id: consultation.id,
      order_id: orderId,
      amount: consultation.amount,
      currency: consultation.currency,
      payment_session_id: order.payment_session_id,
      environment: this.cashfree.getEnvironment(),
    };
  }

  

  async getPaymentStatus(id: string, userId: string, roles: string[]) {
    const consultation = await this.getConsultation(id, userId, roles);
    if (!consultation.cashfree_order_id) {
      return {
        consultation_id: id,
        status: consultation.status,
        order_status: null,
      };
    }
    const order = await this.cashfree.getOrder(consultation.cashfree_order_id);
    this.assertCashfreeOrderMatches(consultation, order);
    if (order.order_status === 'PAID') await this.markConsultationPaid(id);
    const updated = await this.prisma.consultations.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    return {
      consultation_id: id,
      status: updated.status,
      order_status: order.order_status,
    };
  }

  async assign(id: string, smeId: string) {
    const sme = await this.prisma.users.findFirst({
      where: {
        id: smeId,
        deleted_at: null,
        user_roles: { some: { roles: { name: 'SME' } } },
      },
      select: { id: true },
    });
    if (!sme) throw new NotFoundException('SME user not found.');

    const consultation = await this.prisma.consultations.findUnique({
      where: { id },
    });
    if (!consultation) throw new NotFoundException('Consultation not found.');
    if (
      consultation.status !== consultation_status.PAID &&
      consultation.status !== consultation_status.ASSIGNED
    ) {
      throw new ConflictException('Only paid consultations can be assigned.');
    }
    return this.prisma.consultations.update({
      where: { id },
      data: {
        sme_id: sme.id,
        status: consultation_status.ASSIGNED,
        updated_at: new Date(),
      },
      include: consultationInclude,
    });
  }

  async listMessages(
    id: string,
    userId: string,
    roles: string[],
    query: ListMessagesDto,
  ) {
    await this.getConsultation(id, userId, roles);
    const before = query.before
      ? await this.prisma.consultation_messages.findFirst({
          where: { id: query.before, consultation_id: id, deleted_at: null },
          select: { created_at: true, id: true },
        })
      : null;
    if (query.before && !before)
      throw new BadRequestException('Invalid message cursor.');

    const rows = await this.prisma.consultation_messages.findMany({
      where: {
        consultation_id: id,
        deleted_at: null,
        ...(before && {
          OR: [
            { created_at: { lt: before.created_at } },
            { created_at: before.created_at, id: { lt: before.id } },
          ],
        }),
      },
      include: { users: { select: { id: true, name: true } } },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const messages = rows.slice(0, query.limit).reverse();
    return {
      messages,
      next_cursor: hasMore ? (messages[0]?.id ?? null) : null,
      has_more: hasMore,
    };
  }

  async sendMessage(
    id: string,
    userId: string,
    roles: string[],
    dto: CreateMessageDto,
  ) {
    const consultation = await this.getConsultation(id, userId, roles);
    if (
      consultation.status !== consultation_status.ASSIGNED &&
      consultation.status !== consultation_status.ONGOING
    ) {
      throw new ConflictException(
        'Messages are available only for assigned consultations.',
      );
    }
    if (dto.message_type === message_type.SYSTEM) {
      throw new BadRequestException('System messages cannot be sent by users.');
    }
    if (dto.message_type === message_type.TEXT && !dto.content?.trim()) {
      throw new BadRequestException('Text messages require non-empty content.');
    }
    if (dto.message_type !== message_type.TEXT && !dto.attachment_url) {
      throw new BadRequestException(
        'Attachment messages require attachment_url.',
      );
    }
    const data = await this.prisma.$transaction(async (tx) => {
      if (consultation.status === consultation_status.ASSIGNED) {
        await tx.consultations.update({
          where: { id },
          data: { status: consultation_status.ONGOING, started_at: new Date() },
        });
      }
      return tx.consultation_messages.create({
        data: {
          consultation_id: id,
          sender_id: userId,
          message_type: dto.message_type,
          content: dto.content?.trim() || null,
          attachment_url: dto.attachment_url ?? null,
        },
        include: { users: { select: { id: true, name: true } } },
      });
    });
    return data;
  }

  async markMessagesRead(id: string, userId: string, roles: string[]) {
    await this.getConsultation(id, userId, roles);
    const result = await this.prisma.consultation_messages.updateMany({
      where: {
        consultation_id: id,
        sender_id: { not: userId },
        read_at: null,
        deleted_at: null,
      },
      data: { read_at: new Date() },
    });
    return { consultation_id: id, marked_read: result.count };
  }

  async complete(id: string) {
    const consultation = await this.prisma.consultations.findUnique({
      where: { id },
    });
    if (!consultation) throw new NotFoundException('Consultation not found.');
    if (
      consultation.status !== consultation_status.ONGOING &&
      consultation.status !== consultation_status.ASSIGNED
    ) {
      throw new ConflictException(
        'Only assigned or ongoing consultations can be completed.',
      );
    }
    return this.prisma.consultations.update({
      where: { id },
      data: {
        status: consultation_status.COMPLETED,
        completed_at: new Date(),
        updated_at: new Date(),
      },
      include: consultationInclude,
    });
  }

  async processPaymentWebhook(
    rawBody: Buffer | undefined,
    signature: string | undefined,
    timestamp: string | undefined,
    event: unknown,
  ) {
    this.cashfree.verifyWebhook(rawBody, signature, timestamp);
    if (!event || typeof event !== 'object') {
      throw new BadRequestException('Invalid Cashfree payment event.');
    }
    const payload = event as {
      type?: string;
      data?: {
        order?: {
          order_id?: string;
          order_amount?: number;
          order_currency?: string;
        };
        payment?: { cf_payment_id?: string | number; payment_status?: string };
      };
    };
    const cashfreeOrder = payload.data?.order;
    if (!cashfreeOrder?.order_id) {
      throw new BadRequestException(
        'Cashfree event does not include an order ID.',
      );
    }
    const consultation = await this.prisma.consultations.findFirst({
      where: { cashfree_order_id: cashfreeOrder.order_id },
    });
    if (!consultation) return { received: true, ignored: true };
    if (
      cashfreeOrder.order_amount !== undefined &&
      (Number(cashfreeOrder.order_amount) !== Number(consultation.amount) ||
        cashfreeOrder.order_currency?.toUpperCase() !==
          consultation.currency.trim().toUpperCase())
    ) {
      throw new BadRequestException(
        'Cashfree order amount or currency does not match.',
      );
    }

    const isPaid =
      payload.type === 'PAYMENT_SUCCESS_WEBHOOK' &&
      payload.data?.payment?.payment_status === 'SUCCESS';
    if (isPaid) {
      if (
        cashfreeOrder.order_amount === undefined ||
        !cashfreeOrder.order_currency ||
        !payload.data?.payment?.cf_payment_id
      ) {
        throw new BadRequestException(
          'Cashfree success event is missing payment verification fields.',
        );
      }
      await this.markConsultationPaid(
        consultation.id,
        payload.data?.payment?.cf_payment_id?.toString(),
      );
    }
    const updated = await this.prisma.consultations.findUniqueOrThrow({
      where: { id: consultation.id },
      select: { status: true },
    });
    return {
      received: true,
      consultation_id: consultation.id,
      status: updated.status,
    };
  }

  private assertCashfreeOrderMatches(
    consultation: { amount: { toString(): string }; currency: string },
    order: { order_amount: number; order_currency: string },
  ) {
    if (
      Number(order.order_amount) !== Number(consultation.amount.toString()) ||
      order.order_currency?.toUpperCase() !==
        consultation.currency.trim().toUpperCase()
    ) {
      throw new ServiceUnavailableException(
        'Cashfree order amount or currency does not match the consultation.',
      );
    }
  }

  private async markConsultationPaid(id: string, paymentId?: string) {
    await this.prisma.consultations.updateMany({
      where: {
        id,
        status: consultation_status.PENDING_PAYMENT,
      },
      data: {
        status: consultation_status.PAID,
        cashfree_payment_id: paymentId,
        payment_verified_at: new Date(),
        updated_at: new Date(),
      },
    });
  }
}

function normalizeIndianPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}