import type { ErrorCode } from "../constants/error-codes.constants";

export interface FieldIssue {
  /** Dot-separated path of the offending field, e.g. `body.title`. */
  path: string;
  message: string;
  code?: string;
}

export interface PaginationMeta {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ResponseMeta {
  requestId: string;
  pagination?: PaginationMeta;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: FieldIssue[];
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
  meta: ResponseMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
