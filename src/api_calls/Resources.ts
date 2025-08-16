import { ApiUrl, MyHeaders } from "../constants";
import { AllResources, ResourceQueryParameters } from "../types/ResourceData";
import { SkillData } from "../types/SkillData";
import { logger } from "../utils";

export async function gatherResources(charName: string): Promise<SkillData> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${charName}/action/gathering`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    return await response.json();
  } catch (error) {
    console.error(error);
  }
}

export async function getResourceLocations(
  queryParams: ResourceQueryParameters,
): Promise<AllResources> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/resources`);

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
  if (queryParams.skill) {
    apiUrl.searchParams.set("skill", queryParams.skill);
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      logger.error(`/resources failed: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error(error);
  }
}
