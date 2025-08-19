export class ApiError extends Error {
    error: {
        code: number;
        message: string;
    }

    constructor(error: any) {
        super()
        error = this.error
    }
}