# Arty

This is my client for ArtifactsMMO written in Typescript. It exposes an API that lets you run it as a web app
and send it HTTP requests to get characters to do stuff.
ToDo: write up docs on the API

It can be run standalone with

```
npm run install
npm run build
npm run start
```

or in a Docker container. Example Docker compose file:

```
services:
  arty:
    image: kalmonipa/arty:latest
    restart: when-stopped
    ports:
      - 3000:3000
    volumes:
      - /some/path/to/logs:/app/logs
    environment:
      API_TOKEN: $API_TOKEN
      CHARACTER_NAME: 'MyCharacter'
      ROLE: 'fighter'
```

### API Endpoints

| Type | Endpoint                  | Description                                                                                      | Body                                                                             |
| ---- | ------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| POST | /craft                    | Craft x items specified. The API will not return any errors if the code is not a valid item code | quantity: number itemCode: string                                                |
| POST | /deposit                  | Deposit the items into the bank. itemCode can be an item or 'gold'                               | quantity: number itemCode: string                                                |
| POST | /equip                    | Equips the item into the specified slot                                                          | quantity: number itemCode: string itemSlot: string                               |
| POST | /fight/                   |                                                                                                  | quantity: number monsterCode: string                                             |
| POST | /gather                   |                                                                                                  | quantity: number itemCode: string checkBank?: boolean includeInventory?: boolean |
| GET  | /items/inventory          | Returns a list of all the items and quantities in the characters inventory                       |                                                                                  |
| GET  | /items/bank               | Returns a list of all the items in the bank                                                      |                                                                                  |
| GET  | /jobs/list/all            | Lists all the jobs in the queue                                                                  |                                                                                  |
| GET  | /jobs/list/with-parents   | Lists all the jobs with its parents if it has any                                                |                                                                                  |
| GET  | /jobs/chain/:rootJobId    | Lists the jobs associated with the provided bjective ID                                          |                                                                                  |
| POST | /jobs/cancel/:objectiveId | Puts the provided objective into cancelled state                                                 |                                                                                  |
| GET  | /jobs/cancelled           | List the cancelled jobs                                                                          |                                                                                  |
| POST | /jobs/save                | Saves the current job queue                                                                      |                                                                                  |
| POST | /recycle                  | Recycles the specified items                                                                     | quantity: number itemCode: string                                                |
| POST | /task                     | Completes the requested number of tasks. taskType must be one of 'items' or 'monsters'           | quantity: number taskType: string                                                |
| POST | /trade/:tradeType         | Trades with the relevant NPC. tradeType must be 'buy' or 'sell'                                  | quantity: number itemCode: string                                                |
| POST | /train                    | Trains the requested skill to the requested level                                                | quantity: number skill: string                                                   |
| POST | /withdraw                 | Withdraws the requested items from the bank                                                      | quantity: number itemCode: string                                                |

### To run locally:

1. Change the names in the switch/case to your character names
2. Add a .env file with `API_TOKEN` and a `CHARACTER_NAME` populated with the character name you'd like to run
3. Update the main.ts loop with the actions you'd like the character to do

Run the following:

```
npm install
npm run dev
```

### To build the types from the openapi spec

```
npx orval --input openapi-spec.json --output ./src/types/types.ts
```
