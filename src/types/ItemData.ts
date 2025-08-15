export type SimpleItem = {
  code: string;
  quantity: number;
};

export type Item = {
  data: {
    name: string;
    code: string;
    level: number;
    type: string;
    subtype: string;
    description: string;
    condition: {
      code: string;
      operator: string;
      value: number;
    };
    effects: {
      code: string;
      value: number;
      description: string;
    };
    craft: {
      skill: string;
      level: number;
      items: {
        code: string;
        quantity: number;
      };
      quantity: number;
    };
    tradeable: boolean;
  };
};
