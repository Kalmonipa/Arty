import { getEnv, logger } from "./utils";
import { beFisherman } from "./roles/fisherman";
import { beFighter } from "./roles/fighter";

let counter = 0;
let role = getEnv("ROLE"); // ToDo: Pick a random role if none supplied
let shouldStopActions = false;
let changeRoles = false;
let validRoles = ["fisherman", "fighter"];

if (!validRoles.includes(role)) {
  logger.error(`Invalid role: ${role}. Exiting`);
}

async function main() {
  if (counter === 1000) {
    changeRoles = true;
    counter = 0;
  }

  while (!shouldStopActions) {
    if (changeRoles) {
      if (role === "fisherman") {
        logger.info("Changing to fighter");
        role = "fighter";
      } else if (role === "fighter") {
        logger.info("Changing to fisherman");
        role = "fisherman";
      }
      changeRoles = false;
    }
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

    counter += 1;
  }

  // logger.error("Reached end of activities. Exiting");
  // process.exit();
}

main();
