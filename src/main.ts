import { getEnv, logger } from "./utils";
import { beFisherman } from "./roles/fisherman";
import { beFighter } from "./roles/fighter";

let shouldStopActions = false;

async function main() {
  const role = getEnv("ROLE");

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
  }
}

  // logger.error("Reached end of activities. Exiting");
  // process.exit();

}

main();
