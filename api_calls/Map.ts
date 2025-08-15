import { ApiUrl, MyHeaders } from "../constants";
import { AllMaps, MapSchema } from "../types/MapData";

export async function getLocationOfContent(
  contentCode?: string,
  contentType?: string,
): Promise<AllMaps> {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/maps`)

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
