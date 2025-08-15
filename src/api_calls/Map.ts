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

  const response = await fetch(`${apiUrl}`, requestOptions)
    .then((response) => {
      return response.json();
    })
    .catch((error) => logger.error("error", error));

  return response;
}

/**
 * @description Find closest map to current location
 */
