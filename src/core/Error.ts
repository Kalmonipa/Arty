export class ApiError extends Error {
  error: {
    code: number;
    message: string;
  };

  constructor(error: { code: number; message: string }) {
    super(error.message);
    this.error = error;
    this.name = 'ApiError';
  }
}
