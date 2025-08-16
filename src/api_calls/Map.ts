import { ApiUrl, MyHeaders } from "../constants";
import { AllMaps } from "../types/MapData";
import { logger } from "../utils";

export async function getContentLocation(
  contentCode?: string,
  contentType?: string,
): Promise<AllMaps> {
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
    const data = await response.json();
    return data.data;
  } catch (error) {
    logger.error(error, "get content location failed");
  }
}

/**
 * @description Find closest map to current location
 */
