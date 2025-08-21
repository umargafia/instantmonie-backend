export const formatAmount = (amountInCents: number, currency: string = 'USD'): string => {
  // Convert cents to standard currency unit
  const standardAmount = amountInCents / 100;

  // Format based on currency
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(standardAmount);
};
