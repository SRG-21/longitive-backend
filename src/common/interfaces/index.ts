export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
  type: 'access' | 'refresh';
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DateRangeParams {
  from?: Date;
  to?: Date;
}
