import { Character } from './classes/Character';
import { CharName } from './constants';
import { getCharacter } from './api_calls/Character';
import express from 'express';
import gatherRouter from './routes/Gather';
import depositRouter from './routes/Deposit';
import craftRouter from './routes/Craft';
import equipRouter from './routes/Equip';
import fightRouter from './routes/Fight';
import TaskRouter from './routes/Task';
import TrainSkillRouter from './routes/TrainSkill';
import { logger } from './utils';
import ListJobsRouter from './routes/ListJobs';

async function main() {
  const charData = await getCharacter(CharName);
  const char = new Character(charData);
  await char.init();

  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());
  app.use('/craft', craftRouter(char));
  app.use('/deposit', depositRouter(char));
  app.use('/equip', equipRouter(char));
  app.use('/fight', fightRouter(char));
  app.use('/gather', gatherRouter(char));
  app.use('/listjobs', ListJobsRouter(char));
  app.use('/task', TaskRouter(char));
  app.use('/train', TrainSkillRouter(char));

  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`);
  });

  char.executeJobList();
}

main();
