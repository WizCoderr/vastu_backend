export interface UpiUriParams {
  vpa: string;
  payeeName: string;
  transactionRef: string;
  transactionNote: string;
  amount: number;
  currency?: string;
}

export function buildUpiUri(params: UpiUriParams): string {
  const query = new URLSearchParams({
    pa: params.vpa,
    pn: params.payeeName,
    tr: params.transactionRef,
    tn: params.transactionNote,
    am: params.amount.toFixed(2),
    cu: params.currency ?? 'INR',
  });

  return `upi://pay?${query.toString()}`;
}
