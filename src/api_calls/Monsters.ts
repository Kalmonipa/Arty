import { ApiUrl, MyHeaders } from "../constants";
import { CharacterFight } from '../types/CharacterData'
import { AllMonsters, MonsterQueryParameters } from "../types/MonsterData";
import { logger } from "../utils";

export async function fightMonster(characterName: string): Promise<CharacterFight> {
      var requestOptions = {
    method: "POST",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${characterName}/action/fight`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    return await response.json();
  } catch (error) {
    console.error(error);
  }
}

export async function getMonsterInformation(
  queryParams: MonsterQueryParameters,
): Promise<AllMonsters> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/monsters`);

  if (queryParams.drop) {
    apiUrl.searchParams.set("drop", queryParams.drop);
  }
  if (queryParams.max_level) {
    apiUrl.searchParams.set("max_level", queryParams.max_level.toString());
  }
  if (queryParams.min_level) {
    apiUrl.searchParams.set("min_level", queryParams.min_level.toString());
  }
  if (queryParams.page) {
    apiUrl.searchParams.set("page", queryParams.page.toString());
  }
  if (queryParams.size) {
    apiUrl.searchParams.set("size", queryParams.size.toString());
  }
  if (queryParams.name) {
    apiUrl.searchParams.set("name", queryParams.name);
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      logger.error(`/monters failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error(error);
  }
}