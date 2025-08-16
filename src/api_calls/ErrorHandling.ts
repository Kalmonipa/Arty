import { ErrorResponse } from "../types/ResponseData";
import { logger } from "../utils";

function ensureError(value: unknown): Error {
  if (value instanceof Error) return value;

  let stringified = "[Unable to stringify the thrown value]";
  try {
    stringified = JSON.stringify(value);
  } catch {}

  const error = new Error(
    `This value was thrown as is, not through an Error: ${stringified}`,
  );
  return error;
}

export function checkErrorCodes(statusCode: number) {
  switch (statusCode) {
    case 404: {
      logger.error(`${statusCode}: Not found`);
      break;
    }
    case 422: {
      logger.error(`${statusCode}: Invalid payload`);
      break;
    }
    case 429: {
      logger.error(`${statusCode}: Too many requests`);
      break;
    }
    case 431: {
      logger.error(`${statusCode}: Grand Exchange: No orders`);
      break;
    }
    case 433: {
      logger.error(`${statusCode}: Grand Exchange: Max orders`);
      break;
    }
    case 434: {
      logger.error(`${statusCode}: Grand Exchange: Too many items`);
      break;
    }
    case 435: {
      logger.error(`${statusCode}: Grand Exchange: Same account`);
      break;
    }
    case 437: {
      logger.error(`${statusCode}: Grand Exchange: Invalid item`);
      break;
    }
    case 438: {
      logger.error(`${statusCode}: Grand Exchange: Not your order`);
      break;
    }
    default: {
      logger.error(`${statusCode}: Generic log message`);
      break;
    }
  }
}
