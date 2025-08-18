import { ApiUrl, MyHeaders } from "../constants";
import { RewardDataResponseSchema } from "../types/types";

export async function completeTask(
  characterName: string,
): Promise<RewardDataResponseSchema> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
  };

  var apiUrl = new URL(`${ApiUrl}/my/${characterName}/action/task/complete`);

  try {
    const response = await fetch(apiUrl, requestOptions);
    return await response.json();
  } catch (error) {
    console.error(error);
  }
}
