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
```

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
