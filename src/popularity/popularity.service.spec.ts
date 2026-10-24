import { Test, TestingModule } from '@nestjs/testing';
import { PopularityService } from './popularity.service';

describe('PopularityService', () => {
  let service: PopularityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PopularityService],
    }).compile();

    service = module.get<PopularityService>(PopularityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
