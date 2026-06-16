import { Character } from './core/Character.js';
import { getCharacter } from './api_calls/Character.js';
import express from 'express';
import GatherRouter from './routes/Gather.js';
import TaskRouter from './routes/Task.js';
import TrainSkillRouter from './routes/TrainSkill.js';
import { GetCharacterData, logger } from './utils.js';
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
import { register } from './metrics.js';
import { db } from './db.js';

async function main() {
  let charDetails: CharacterSchema[] = await GetCharacterData();

  const char = new Character(
    charDetails.find((charData) => charData.name === CharName),
  );
  await char.init(charDetails);


  /** Test the DB connection */
  const isDbConnected = await db.testConnection();
  
  if (!isDbConnected) {
    logger.error('Critical failure: Could not connect to the local database. Exiting.');
    process.exit(1); 
  } else {
    logger.info('Database connection successful!');
  }

  if (ApiUrl === 'https://api-test.artifactsmmo.com') {
    logger.info(`-- Using Test server --`);
  }

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

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
