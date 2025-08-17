import { ApiUrl, MyHeaders } from "../constants";
import {
  GetAllResourcesResourcesGetData,
  GetAllResourcesResourcesGetResponse,
  SkillResponseSchema,
} from "../types/types";
import { logger } from "../utils";

export async function gatherResources(
  characterName: string,
): Promise<SkillResponseSchema> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${characterName}/action/gathering`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    return await response.json();
  } catch (error) {
    console.error(error);
  }
}

export async function getResourceInformation(
  data: GetAllResourcesResourcesGetData,
): Promise<GetAllResourcesResourcesGetResponse> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/resources`);

  if (data.query.drop) {
    apiUrl.searchParams.set("drop", data.query.drop);
  }
  if (data.query.max_level) {
    apiUrl.searchParams.set("max_level", data.query.max_level.toString());
  }
  if (data.query.min_level) {
    apiUrl.searchParams.set("min_level", data.query.min_level.toString());
  }
  if (data.query.page) {
    apiUrl.searchParams.set("page", data.query.page.toString());
  }
  if (data.query.size) {
    apiUrl.searchParams.set("size", data.query.size.toString());
  }
  if (data.query.skill) {
    apiUrl.searchParams.set("skill", data.query.skill);
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
