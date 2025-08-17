import { getEnv, logger } from "./utils";
import { beFisherman } from "./roles/fisherman";
import { beFighter } from "./roles/fighter";
import { beMiner } from "./roles/miner";

let role = getEnv("ROLE"); // ToDo: Pick a random role if none supplied
let shouldStopActions = false;
let validRoles = ["fisherman", "fighter", "miner"];

async function main() {
  if (!validRoles.includes(role)) {
    logger.error(`Invalid role: ${role}. Exiting`);
    shouldStopActions = true;
  }

  while (!shouldStopActions) {
    switch (role) {
      case "fisherman": {
        await beFisherman();
        break;
      }
      case "fighter": {
        await beFighter();
        break;
      }
      case "miner": {
        await beMiner();
        break;
      }
    }
  }

  // logger.error("Reached end of activities. Exiting");
  // process.exit();
}

main();
