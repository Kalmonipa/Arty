import pino from 'pino';
import { CooldownSchema } from './types/types';

// ToDo: Show log level (info, error) in logs output instead of integer value
export const logger = pino({
  base: undefined,
  transport: {
    targets: [
      {
        level: 'trace',
        target: 'pino/file',
        options: {
          destination: './logs/arty.log',
        },
      },
      {
        level: 'trace',
        target: 'pino-pretty',
        options: {},
      },
    ],
  },
  // formatters: {
  //   level: (label) => {
  //     return { level: label };
  //   },
  // },
  timestamp: pino.stdTimeFunctions.isoTime, //'DD-MM-YYYY HH:mm:ss.SSS'
});

/**
 * @description Checks that the env variables are set. If any are undefined, throw an error
 * @param name
 * @returns the env var value
 */
export function getEnv(name: string): string {
  if (typeof process.env[name] === 'undefined') {
    throw new Error(`Variable ${name} undefined.`);
  }

  return process.env[name];
}

/**
 * @description Used after every action to wait for the cooldown period to finish
 * @param cooldown Number of seconds to sleep for
 */
export const sleep = (cooldown: number, reason: string) => {
  logger.info(`Sleeping for ${cooldown} seconds because of ${reason}`);
  return new Promise((r) => setTimeout(r, cooldown * 1000));
};
