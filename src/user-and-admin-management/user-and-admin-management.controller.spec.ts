import { Test, TestingModule } from '@nestjs/testing';
import { UserAndAdminManagementController } from './user-and-admin-management.controller';

describe('UserAndAdminManagementController', () => {
  let controller: UserAndAdminManagementController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserAndAdminManagementController],
    }).compile();

    controller = module.get<UserAndAdminManagementController>(UserAndAdminManagementController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
