import * as winston from 'winston'

export const logger = winston.createLogger({
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'arty.log' })
  ]
});

/**
 * @description Checks that the env variables are set. If any are undefined, throw an error
 * @param name 
 * @returns the env var value
 */
export function getEnv(name: string): string {
  if (typeof process.env[name] === "undefined") {
    throw new Error(`Variable ${name} undefined.`);
  }

  return process.env[name];
}

/**
 * @description Used after every action to wait for the cooldown period to finish
 * @param cooldown Number of seconds to sleep for
 */
export const sleep = (ms: number) =>
  new Promise((r) => setTimeout(r, ms * 1000));
