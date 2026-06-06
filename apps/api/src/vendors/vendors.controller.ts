import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Role,
  AuthUser,
  VendorStatus,
  createVendorSchema,
  updateVendorSchema,
  createVendorCategorySchema,
  CreateVendorInput,
  UpdateVendorInput,
  CreateVendorCategoryInput,
} from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VendorsService } from './vendors.service';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get('vendor-categories')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  listCategories(@CurrentUser() user: AuthUser) {
    return this.vendors.listCategories(user.organizationId);
  }

  @Post('vendor-categories')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVendorCategorySchema)) dto: CreateVendorCategoryInput,
  ) {
    return this.vendors.createCategory(user.organizationId, dto.name);
  }

  @Get('vendors')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: VendorStatus,
    @Query('categoryId') categoryId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.vendors.list(user.organizationId, {
      q,
      status,
      categoryId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get('vendors/:id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vendors.get(user.organizationId, id);
  }

  @Post('vendors')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVendorSchema)) dto: CreateVendorInput,
  ) {
    return this.vendors.create(user.organizationId, user.id, dto);
  }

  @Patch('vendors/:id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateVendorSchema)) dto: UpdateVendorInput,
  ) {
    return this.vendors.update(user.organizationId, user.id, id, dto);
  }

  @Delete('vendors/:id')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vendors.remove(user.organizationId, user.id, id);
  }
}
