import { buildUpiUri, type UpiUriParams } from './upi-uri.builder';

export type UpiApp = 'google_pay' | 'phonepe' | 'paytm' | 'bhim' | 'generic';

const APP_SCHEMES: Record<UpiApp, string> = {
  google_pay: 'tez://upi/pay',
  phonepe: 'phonepe://pay',
  paytm: 'paytmmp://pay',
  bhim: 'upi://pay',
  generic: 'upi://pay',
};

export function buildUpiDeepLink(app: UpiApp, params: UpiUriParams): string {
  const genericUri = buildUpiUri(params);
  if (app === 'generic' || app === 'bhim') {
    return genericUri;
  }

  const query = genericUri.split('?')[1] ?? '';
  return `${APP_SCHEMES[app]}?${query}`;
}

export function getAllUpiDeepLinks(params: UpiUriParams): Record<UpiApp, string> {
  return {
    google_pay: buildUpiDeepLink('google_pay', params),
    phonepe: buildUpiDeepLink('phonepe', params),
    paytm: buildUpiDeepLink('paytm', params),
    bhim: buildUpiDeepLink('bhim', params),
    generic: buildUpiDeepLink('generic', params),
  };
}
