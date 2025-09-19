import { Character } from './classes/Character.js';
import { getCharacter } from './api_calls/Character.js';
import express from 'express';
import GatherRouter from './routes/Gather.js';
import TaskRouter from './routes/Task.js';
import TrainSkillRouter from './routes/TrainSkill.js';
import { ApiUrl, CharName, logger } from './utils.js';
import JobsRouter from './routes/Jobs.js';
import CraftRouter from './routes/Craft.js';
import DepositRouter from './routes/Deposit.js';
import EquipRouter from './routes/Equip.js';
import FightRouter from './routes/Fight.js';
import RecycleRouter from './routes/Recycle.js';
import { ApiError } from './classes/Error.js';

async function main() {
  const charData = await getCharacter(CharName);
  if (charData instanceof ApiError) {
    logger.error(`Failed to get character data`);
    return;
  } else {
    logger.debug(`Gathered data for ${charData.name}`)
  }
  const char = new Character(charData);
  await char.init();

  if (ApiUrl === 'https://api-test.artifactsmmo.com') {
    logger.info(`-- Using Test server --`);
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use('/craft', CraftRouter(char));
  app.use('/deposit', DepositRouter(char));
  app.use('/equip', EquipRouter(char));
  app.use('/fight', FightRouter(char));
  app.use('/gather', GatherRouter(char));
  app.use('/jobs', JobsRouter(char));
  app.use('/recycle', RecycleRouter(char));
  app.use('/task', TaskRouter(char));
  app.use('/train', TrainSkillRouter(char));

  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  char.executeJobList();
}

main();
