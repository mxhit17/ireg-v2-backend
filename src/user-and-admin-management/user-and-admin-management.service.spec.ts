import { Test, TestingModule } from '@nestjs/testing';
import { UserAndAdminManagementService } from './user-and-admin-management.service';

describe('UserAndAdminManagementService', () => {
  let service: UserAndAdminManagementService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserAndAdminManagementService],
    }).compile();

    service = module.get<UserAndAdminManagementService>(UserAndAdminManagementService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
