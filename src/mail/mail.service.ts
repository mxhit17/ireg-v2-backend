// import { Injectable } from '@nestjs/common';

// @Injectable()
// export class MailService {}

import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOtpEmail(email: string, otp: string): Promise<void> {
    await this.mailerService.sendMail({
      to: email,
      subject: 'Verify your IREG account',
      text: [
        'Welcome to IREG!',
        `Your email verification code is ${otp}.`,
        'This code expires in 5 minutes.',
        'If you did not request this code, you can ignore this email.',
      ].join('\n\n'),
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: auto;">
          <h2>Welcome to IREG</h2>
          <p>Use the following code to verify your email address.</p>
          <div style="
            font-size: 32px;
            font-weight: bold;
            letter-spacing: 8px;
            padding: 20px;
            text-align: center;
            background: #f3f4f6;
            border-radius: 8px;
          ">${otp}</div>
          <p>This code expires in <strong>5 minutes</strong>.</p>
          <p>If you did not request this code, you can ignore this email.</p>
        </div>
      `,
    });
  }
}
