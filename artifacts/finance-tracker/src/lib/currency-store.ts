let baseCurrency = "GBP";

export function getBaseCurrency(): string {
  return baseCurrency;
}

export function setBaseCurrency(currency: string): void {
  baseCurrency = currency;
}
