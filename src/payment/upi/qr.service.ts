import QRCode from 'qrcode';

export async function generateQrCodeBase64(upiUrl: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(upiUrl, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 300,
  });
  return dataUrl.replace(/^data:image\/png;base64,/, '');
}
