import { ApiUrl, MyHeaders } from "../constants";
import { GetAllMapsMapsGetResponse } from "../types/types";
import { logger } from "../utils";

export async function getMaps(
  contentCode?: string,
  contentType?: string,
): Promise<GetAllMapsMapsGetResponse> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/maps`);

  if (contentCode) {
    apiUrl.searchParams.set("content_code", contentCode);
  }
  if (contentType) {
    apiUrl.searchParams.set("content_type", contentType);
  }

  try {
    const response = await fetch(apiUrl, requestOptions);
    if (!response.ok) {
      logger.error(`/maps failed: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    logger.error(error, "get content location failed");
  }
}

/**
 * @description Find closest map to current location
 */
