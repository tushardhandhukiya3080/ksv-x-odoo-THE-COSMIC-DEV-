import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

/**
 * Validates a request payload against a shared Zod schema.
 * Usage: @Body(new ZodValidationPipe(createVendorSchema)) dto: CreateVendorInput
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'ValidationError',
          message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
          details: err.flatten(),
        });
      }
      throw err;
    }
  }
}
