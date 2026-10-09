import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Request, Response, NextFunction } from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

function readPackageVersion(): string {
  try {
    // When compiled, main.js lives in dist/, so package.json is one level up.
    const candidates = [
      join(__dirname, '..', 'package.json'),
      join(__dirname, '..', '..', 'package.json'),
    ];
    for (const p of candidates) {
      try {
        const raw = readFileSync(p, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed?.name?.includes('backend') && parsed.version) return parsed.version;
      } catch {
        /* keep trying */
      }
    }
  } catch {
    /* ignore */
  }
  return '1.0.0';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('BACKEND_PORT', 3001);
  const corsOrigins = configService.get<string>('CORS_ORIGINS', 'http://localhost:3000');

  // Security
  app.use(helmet({ crossOriginEmbedderPolicy: false }));
  app.use(cookieParser());

  // CORS
  app.enableCors({
    origin: corsOrigins.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // API prefix
  app.setGlobalPrefix('api');

  // Versioning
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Global interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger / OpenAPI
  const swaggerConfig = new DocumentBuilder()
    .setTitle('SwarmUI API')
    .setDescription(
      'Docker Swarm management REST API — manage endpoints, stacks, services, nodes, images, networks, volumes, security, backups, registries, templates, GitOps, users, roles, API keys.',
    )
    .setVersion(readPackageVersion())
    .setContact('Alican Kuklaci', 'https://github.com/ruvnet/swarmui', 'alican.kuklaci@gmail.com')
    .setLicense('Proprietary', '')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT access token (login via POST /api/v1/auth/login).',
      },
      'access-token',
    )
    // Default-name bearer scheme so existing `@ApiBearerAuth()` (no name)
    // decorators across controllers keep working.
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    })
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-Api-Key',
        in: 'header',
        description:
          'Long-lived API key issued via /api/v1/api-keys. Use for machine/CI access. Scopes: read, write, admin.',
      },
      'api-key',
    )
    .addCookieAuth('refresh_token')
    .addServer('/', 'Current host')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // Gate Swagger UI + spec behind JWT auth (unless NODE_ENV=development).
  // We mount a tiny Express-level guard before Swagger registers routes.
  const nodeEnv = configService.get<string>('NODE_ENV', 'production');
  if (nodeEnv !== 'development') {
    const httpAdapter = app.getHttpAdapter();
    const instance = httpAdapter.getInstance();
    // Lazy import to reuse the running Nest JWT strategy
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const passport = require('passport');
    const docsGuard = (req: Request, res: Response, next: NextFunction) => {
      // Allow access when a valid JWT is in Authorization header OR
      // `?access_token=` query (handy for curl); otherwise 401.
      const authHeader = (req.headers.authorization as string) || '';
      const qToken = (req.query?.access_token as string) || '';
      if (!authHeader && qToken) {
        req.headers.authorization = `Bearer ${qToken}`;
      }
      passport.authenticate('jwt', { session: false }, (err: any, user: any) => {
        if (err || !user) {
          res.status(401).json({
            statusCode: 401,
            message:
              'Authentication required. Pass Authorization: Bearer <jwt> header or ?access_token=<jwt>.',
          });
          return;
        }
        (req as any).user = user;
        next();
      })(req, res, next);
    };
    instance.use('/api/docs', docsGuard);
    instance.use('/api/docs-json', docsGuard);
  }

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true,
    },
    customSiteTitle: 'SwarmUI API Docs',
  });

  await app.listen(port);
  console.log(`SwarmUI-Master Backend running on port ${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`OpenAPI JSON: http://localhost:${port}/api/docs-json`);
}
bootstrap();
