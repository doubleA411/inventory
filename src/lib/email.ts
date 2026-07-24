import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

/**
 * Send a transactional email via Resend's REST API.
 *
 * Without `RESEND_API_KEY` configured (e.g. local dev, or before you've set
 * one up), this logs the email to the console instead of sending it — so the
 * forgot-password flow is fully testable without any external account.
 */
export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Stackwise <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `\n[email:dev] Would send to ${input.to}\n[email:dev] Subject: ${input.subject}\n[email:dev] ${stripHtml(input.html)}\n`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Failed to send email (${res.status}): ${detail.slice(0, 300)}`);
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Best-effort base URL for building links inside emails. */
export function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
