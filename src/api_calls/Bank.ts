import { BankItemTransactionSchema, SimpleItemSchema } from "../types/types";
import { ApiUrl, MyHeaders } from "../constants";
import { logger } from "../utils";

export async function depositItems(
  charName: string,
  items: SimpleItemSchema[],
): Promise<BankItemTransactionSchema> {
  var requestOptions = {
    method: "POST",
    headers: MyHeaders,
    body: JSON.stringify(items),
  };

  try {
    const response = await fetch(
      `${ApiUrl}/my/${charName}/action/bank/deposit/item`,
      requestOptions,
    );
    //   if (!response.ok) {
    //     return { success: false, status: response.status, error: 'deposit failed'};
    // }
    const data = await response.json();
    items.forEach(function (item) {
      logger.info(`Deposited ${item.quantity} ${item.code}`);
    });
    return data.data;
  } catch (error) {
    logger.error(error, "deposit failed");
  }
}
