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

  var apiUrl = new URL(`${ApiUrl}/maps`)

  // ToDo: Need to add an & in between each of the query params if there are multiple
  if (contentCode) {
    apiUrl.searchParams.set('content_code', contentCode);
  }
  if (contentType) {
    apiUrl.searchParams.set('content_type', contentType);
  }

    const response = await fetch(`${apiUrl}`, requestOptions)
    .then(response => { return response.json()})
    .catch(error => console.log("error", error));

    return response
}
