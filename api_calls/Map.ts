import { ApiUrl, MyHeaders } from "../constants";
import { MapSchema } from "../types/MapData";

export async function getLocationOfContent(
  contentCode?: string,
  contentType?: string,
): Promise<MapSchema> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var endpoint: string = "maps";

  if (contentCode || contentType) {
    endpoint += "?";
  }

  if (contentCode) {
    endpoint += `content_code=${contentCode}`;
  }
  if (contentType) {
    endpoint += `content_type=${contentType}`;
  }

    const response = await fetch(`${ApiUrl}/${endpoint}`, requestOptions)
    .then(response => { return response.json()})
    .catch(error => console.log("error", error));

    return response
}
