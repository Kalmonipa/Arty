import { ApiError } from "../classes/ErrorClass";
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
    const result = (await fetch(apiUrl, requestOptions)).json();

    return result;
  } catch (error) {
    logger.error(error, "get maps failed");
  }
}
