import { Test, TestingModule } from '@nestjs/testing';
import { PopularityController } from './popularity.controller';

describe('PopularityController', () => {
  let controller: PopularityController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PopularityController],
    }).compile();

    controller = module.get<PopularityController>(PopularityController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
