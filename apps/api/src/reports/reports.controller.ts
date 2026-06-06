import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role, AuthUser } from '@vendorbridge/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('spend')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  spend(@CurrentUser() user: AuthUser) {
    return this.reports.spend(user.organizationId);
  }

  @Get('vendors')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  vendors(@CurrentUser() user: AuthUser) {
    return this.reports.vendors(user.organizationId);
  }

  @Get('trends')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER, Role.APPROVER)
  trends(@CurrentUser() user: AuthUser) {
    return this.reports.trends(user.organizationId);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.PROCUREMENT_OFFICER)
  async export(@CurrentUser() user: AuthUser, @Res() res: Response) {
    const { filename, csv } = await this.reports.export(user.organizationId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }
}
