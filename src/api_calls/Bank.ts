import { BankItemTransaction } from "../types/BankData";
import { Item, SimpleItem } from "../types/ItemData";
import { ApiUrl, MyHeaders } from "../constants";
import { logger } from "../utils";

export async function depositItems(
  charName: string,
  items: SimpleItem[],
): Promise<BankItemTransaction> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  logger.info(requestOptions);

  try {
    const response = await fetch(
      `${ApiUrl}/my/${charName}/action/bank/deposit/item`,
      requestOptions,
    );
    const data = await response.json();
    return data.data;
  } catch (error) {
    logger.error(error, "deposit failed");
  }
}
