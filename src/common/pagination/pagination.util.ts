
import {
  PaginatedResponse,
} from './pagination.types';

interface PaginateOptions<T> {
  page: number;
  limit: number;
  findMany: (
    skip: number,
    take: number,
  ) => Promise<T[]>;
  count: () => Promise<number>;
}

export async function paginate<T>({
  page,
  limit,
  findMany,
  count,
}: PaginateOptions<T>): Promise<PaginatedResponse<T>> {
  const skip = (page - 1) * limit;

  const [data, totalItems] = await Promise.all([
    findMany(skip, limit),
    count(),
  ]);

  const totalPages = Math.ceil(totalItems / limit);

  return {
    data,
    meta: {
      page,
      limit,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
    },
  };
}
