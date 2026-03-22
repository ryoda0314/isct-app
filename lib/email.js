import { Resend } from 'resend';

let _resend;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.EMAIL_FROM || 'ScienceTokyo App <noreply@sciencetokyo.app>';

export async function sendVerificationCode(email, code) {
  const { error } = await getResend().emails.send({
    from: FROM,
    to: email,
    subject: `[ISCT] メール確認コード: ${code}`,
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="font-size:18px;color:#1a1a2e;margin:0 0 8px">ISCT メールアドレス確認</h2>
        <p style="font-size:14px;color:#555;margin:0 0 24px;line-height:1.6">以下の確認コードを入力してメールアドレスの連携を完了してください。</p>
        <div style="background:#f0f4ff;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1a1a2e">${code}</span>
        </div>
        <p style="font-size:12px;color:#999;margin:0;line-height:1.5">このコードは10分間有効です。<br>心当たりがない場合はこのメールを無視してください。</p>
      </div>
    `,
  });

  if (error) throw new Error(error.message);
}
