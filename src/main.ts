import { Character } from './core/Character.js';
import { getCharacter } from './api_calls/Character.js';
import express from 'express';
import GatherRouter from './routes/Gather.js';
import TaskRouter from './routes/Task.js';
import TrainSkillRouter from './routes/TrainSkill.js';
import {
  logger,
} from './utils.js';
import { ApiUrl } from './constants.js';
import JobsRouter from './routes/Jobs.js';
import CraftRouter from './routes/Craft.js';
import EquipRouter from './routes/Equip.js';
import FightRouter from './routes/Fight.js';
import RecycleRouter from './routes/Recycle.js';
import { ApiError } from './core/Error.js';
import ItemsRouter from './routes/Items.js';
import TradeRouter from './routes/Trade.js';
import BankRouter from './routes/Bank.js';
import CharacterRouter from './routes/Character.js';
import { CharacterSchema } from './types/types.js';
import { AllCharNames, CharName } from './constants.js';

async function main() {
  let charDetails: CharacterSchema[] = [];

  for (const character of AllCharNames) {
    const charDetail = await getCharacter(character);
    if (charDetail instanceof ApiError) {
      logger.error(
        `Failed to get data for ${character}: [${charDetail.error.code}] ${charDetail.message}`,
      );
      break;
    }
    logger.debug(`Gathered data for ${charDetail.name}`);

    charDetails.push(charDetail);
  }

  const char = new Character(
    charDetails.find((charData) => charData.name === CharName),
  );
  await char.init(charDetails);

  if (ApiUrl === 'https://api-test.artifactsmmo.com') {
    logger.info(`-- Using Test server --`);
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use('/bank', BankRouter(char));
  app.use('/craft', CraftRouter(char));
  app.use('/equip', EquipRouter(char));
  app.use('/fight', FightRouter(char));
  app.use('/gather', GatherRouter(char));
  app.use('/items', ItemsRouter(char));
  app.use('/jobs', JobsRouter(char));
  app.use('/recycle', RecycleRouter(char));
  app.use('/task', TaskRouter(char));
  app.use('/trade', TradeRouter(char));
  app.use('/train', TrainSkillRouter(char));
  app.use('/character', CharacterRouter(char));

  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  char.executeJobList();
}

main();
