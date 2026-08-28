export type PasswordResetOtpEmailParams = {
    email: string;
    otp: string;
    expiresMinutes: number;
};

export function buildPasswordResetOtpEmailHtml({
    email,
    otp,
    expiresMinutes,
}: PasswordResetOtpEmailParams): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Password reset code</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="padding:28px 28px 12px 28px;text-align:center;">
              <p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#71717a;">Vastu Arun Sharma</p>
              <h1 style="margin:12px 0 0 0;font-size:24px;line-height:1.3;color:#18181b;">Password reset code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 0 28px;">
              <p style="margin:0;font-size:15px;line-height:1.6;color:#3f3f46;">
                Use the code below to continue resetting the password for
                <strong style="color:#18181b;">${email}</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="background-color:#fafafa;border:1px dashed #d4d4d8;border-radius:12px;padding:20px;">
                    <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Your code</p>
                    <p style="margin:0;font-size:34px;line-height:1;letter-spacing:0.35em;font-weight:700;color:#18181b;">${otp}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px 28px;">
              <p style="margin:0;font-size:14px;line-height:1.6;color:#52525b;">
                This code expires in <strong>${expiresMinutes} minutes</strong>.
                Enter it on the reset password screen in the app or website.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.6;color:#a1a1aa;">
                If you did not request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildPasswordResetOtpEmailText({
    email,
    otp,
    expiresMinutes,
}: PasswordResetOtpEmailParams): string {
    return [
        'Vastu Arun Sharma',
        '',
        'Password reset code',
        '',
        `Use this code to reset the password for ${email}:`,
        '',
        otp,
        '',
        `This code expires in ${expiresMinutes} minutes.`,
        'Enter it on the reset password screen in the app or website.',
        '',
        'If you did not request this, you can ignore this email.',
    ].join('\n');
}
