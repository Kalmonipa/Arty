import { getEnv, logger } from "./utils";
import { beAlchemist } from "./roles/alchemist";
import { beFisherman } from "./roles/fisherman";
import { beFighter } from "./roles/fighter";
import { beLumberjack } from "./roles/lumberjack";
import { beMiner } from "./roles/miner";
import { beTaskmaster } from "./roles/taskmaster";

let role = getEnv("ROLE"); // ToDo: Pick a random role if none supplied
let shouldStopActions = false;
let validRoles = [
  "alchemist",
  "fisherman",
  "fighter",
  "lumberjack",
  "miner",
  "taskmaster",
];

async function main() {
  if (!validRoles.includes(role)) {
    logger.error(`Invalid role: ${role}. Exiting`);
    shouldStopActions = true;
  }

  while (!shouldStopActions) {
    switch (role) {
      case "alchemist": {
        await beAlchemist();
        break;
      }
      case "fisherman": {
        await beFisherman();
        break;
      }
      case "fighter": {
        await beFighter();
        break;
      }
      case "lumberjack": {
        await beLumberjack();
        break;
      }
      case "miner": {
        await beMiner();
        break;
      }
      case "taskmaster": {
        shouldStopActions = await beTaskmaster(); // Returns true when task is complete
        break;
      }
    }
  }

  // logger.error("Reached end of activities. Exiting");
  // process.exit();
}

main();
