import { ApiUrl, MyHeaders } from "../constants";
import { ResourceQueryParameters } from '../types/ResourceData'

export async function getResourceLocations(queryParams: ResourceQueryParameters) {
  var requestOptions = {
    method: "GET",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/resources`)

  if (queryParams.drop) {
    apiUrl.searchParams.set('drop', queryParams.drop)
  }
  if (queryParams.max_level) {
    apiUrl.searchParams.set('max_level', queryParams.max_level.toString())
  }
  if (queryParams.min_level) {
    apiUrl.searchParams.set('min_level', queryParams.min_level.toString())
  }
  if (queryParams.page) {
    apiUrl.searchParams.set('page', queryParams.page.toString())
  }
  if (queryParams.size) {
    apiUrl.searchParams.set('size', queryParams.size.toString())
  }
  if (queryParams.skill) {
    apiUrl.searchParams.set('skill', queryParams.skill)
  }

  try {
    const response = await fetch(
      apiUrl,
      requestOptions,
    );
    const data = await response.json();
    //console.log(data);
    return data;
  } catch (error) {
    console.error(error);
  }
}
