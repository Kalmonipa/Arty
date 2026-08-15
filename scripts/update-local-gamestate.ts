import { ApiUrl } from '../src/constants.js';
import { StaticDataPageItemSchema } from '../src/types/types.js';

async function getGameData(itemType: string): Promise<void> {
  console.log(`Fetching ${itemType} data`);

  const response = await fetch(`${ApiUrl}/${itemType}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(response)}`);
  }

  const gameData = await response.json();

  if (!gameData?.data || gameData.data.length === 0) {
    throw new Error(`No ${itemType} data found in response`);
  }

  if (gameData.pages > 1) {
    console.log(
      `Found ${gameData.pages} pages of ${itemType} data. Fetching remaining pages...`,
    );

    for (let page = 2; page <= gameData.pages; page++) {
      console.log(`Fetching page ${page} of ${itemType} data`);
      const pageResponse = await fetch(`${ApiUrl}/${itemType}?page=${page}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!pageResponse.ok) {
        throw new Error(
          `HTTP ${pageResponse.status}: ${JSON.stringify(pageResponse)}`,
        );
      }

      const pageData: StaticDataPageItemSchema = await pageResponse.json();

      if (!pageData?.data || pageData.data.length === 0) {
        throw new Error(
          `No ${itemType} data found in response for page ${page}`,
        );
      }

      gameData.data.push(...pageData.data);
    }
  }

  console.log(`Fetched ${gameData.data.length} ${itemType} in total`);

  const fs = await import('node:fs');
  const path = await import('node:path');

  const dataDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const outputPath = path.join(dataDir, `${itemType}-data.json`);
  fs.writeFileSync(outputPath, JSON.stringify(gameData.data, null, 2));
  console.log(`Saved ${itemType} data to ${outputPath}`);
}

await getGameData('items');
await getGameData('maps');
await getGameData('monsters');
await getGameData('resources');
await getGameData('events');
