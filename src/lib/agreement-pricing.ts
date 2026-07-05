type AgreementPricingGroup = {
  clients: Array<{ id: string }>;
  prices: Array<{ product_code: string; price: number }>;
};

export function agreementPriceFor(
  groups: AgreementPricingGroup[],
  clientId: string,
  productCode: string,
  fallbackPrice: number,
) {
  const group = groups.find((value) =>
    value.clients.some((client) => client.id === clientId),
  );
  const special = group?.prices.find(
    (price) => String(price.product_code) === String(productCode),
  );
  return special ? Number(special.price) : fallbackPrice;
}
