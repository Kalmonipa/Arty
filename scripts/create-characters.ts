#!/usr/bin/env tsx
import { CharacterSchema } from '../src/types/types.js';

/**
 * Character creation script for ArtifactsMMO
 * Creates 5 characters with random skins
 */

// Character names to create
const characterNames = [
  'LongLegLarry',
  'JumpyJimmy', 
  'ZippyZoe',
  'TimidTom',
  'BouncyBella'
];

const skins = [
  'men1',
  'men2', 
  'men3',
  'women1',
  'women2',
  'women3'
];

// Set the API_URL if you want to use another endpoint (i.e. the test server)
const API_BASE_URL = process.env.API_URL || 'https://api.artifactsmmo.com';

interface CreateCharacterRequest {
  name: string;
  skin: string;
}

/**
 * Get a random skin from the available skins
 */
function getRandomSkin(): string {
  const randomIndex = Math.floor(Math.random() * skins.length);
  return skins[randomIndex];
}

/**
 * Create a single character
 */
async function createCharacter(
  name: string, 
  skin: string, 
  bearerToken: string
): Promise<{ success: boolean; response?: CharacterSchema; error?: string }> {
  try {
    console.log(`Creating character: ${name} with skin: ${skin}`);
    
    const response = await fetch(`${API_BASE_URL}/characters/create`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        skin
      } as CreateCharacterRequest)
    });

    const responseData: CharacterSchema = await response.json();

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
    }

    console.log(`Successfully created character: ${name}`);
    console.log(`Response:`, JSON.stringify(responseData, null, 2));
    
    return {
      success: true,
      response: responseData
    };
    
  } catch (error) {
    let errorMessage = 'Unknown error';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    console.log(`Failed to create character: ${name}`);
    console.log(`Error: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Main function to create all characters
 */
async function main(): Promise<void> {
  const bearerToken = process.env.API_TOKEN;
  
  if (!bearerToken) {
    console.error('Error: API_TOKEN environment variable is required');
    console.error('Usage: API_TOKEN=your_token_here npm run create-characters');
    process.exit(1);
  }

  const results = [];
  
  for (const charName of characterNames) {
    const randomSkin = getRandomSkin();
    const result = await createCharacter(charName, randomSkin, bearerToken);
    results.push({ name: charName, ...result });
    
    console.log('---');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('Character creation process completed!');
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`Successfully created: ${successful} characters`);
  console.log(`Failed to create: ${failed} characters`);
  
  if (failed > 0) {
    console.log('');
    console.log('Failed characters:');
    results
      .filter(r => !r.success)
      .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
  }
}

main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
});

