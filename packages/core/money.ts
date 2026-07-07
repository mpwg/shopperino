export type Money = {
  amountMinor: number;
  currency: string;
};

export function createMoney(amountMinor: number, currency: string): Money {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (!Number.isInteger(amountMinor)) {
    throw new Error("Money amountMinor must be an integer");
  }

  if (amountMinor < 0) {
    throw new Error("Money amountMinor must be positive or zero");
  }

  if (!/^[A-Z]{3}$/.test(normalizedCurrency)) {
    throw new Error("Money currency must be a three-letter ISO code");
  }

  return {
    amountMinor,
    currency: normalizedCurrency,
  };
}

export function requirePositiveMoney(money: Money): Money {
  if (money.amountMinor <= 0) {
    throw new Error("Money amountMinor must be greater than zero");
  }

  return money;
}

export function sameMoneyCurrency(left: Money, right: Money): boolean {
  return left.currency === right.currency;
}
