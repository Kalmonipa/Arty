export type ErrorResponse = {
  code: number;
  message: string;
};

/**
 * Allows for handling errors in the calling function.
 */
export type ApiResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      status: number | null;
      error: string;
    };
