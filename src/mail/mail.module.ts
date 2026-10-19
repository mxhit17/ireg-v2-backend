// import { Module } from '@nestjs/common';
// import { ConfigModule, ConfigService } from '@nestjs/config';
// import { MailerModule } from '@nestjs-modules/mailer';

// import { MailService } from './mail.service';

// @Module({
//   imports: [
//     MailerModule.forRootAsync({
//       imports: [ConfigModule],
//       inject: [ConfigService],
//       useFactory: (configService: ConfigService) => {
//         const port = Number(
//           configService.getOrThrow<string>('MAIL_PORT'),
//         );

//         return {
//           transport: {
//             host: configService.getOrThrow<string>('MAIL_HOST'),
//             port,
//             secure: port === 465,
//             auth: {
//               user: configService.getOrThrow<string>('MAIL_USER'),
//               pass: configService.getOrThrow<string>('MAIL_PASSWORD'),
//             },
//           },
//           defaults: {
//             from: configService.getOrThrow<string>('MAIL_FROM'),
//           },
//         };
//       },
//     }),
//   ],
//   providers: [MailService],
//   exports: [MailService],
// })
// export class MailModule {}


import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MailService } from './mail.service';

@Module({
  imports: [ConfigModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
