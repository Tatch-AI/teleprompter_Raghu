import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

// Mints a short-lived Deepgram token so the browser can open a live transcription
// socket without ever seeing the long-lived DEEPGRAM_API_KEY. Falls back to a
// temporary scoped project key when the grant endpoint is unavailable.
// Returns { configured:false } when no key is set so the UI can gate the feature.
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  const projectId = process.env.DEEPGRAM_PROJECT_ID;
  if (!apiKey) {
    return NextResponse.json({ configured: false });
  }

  // Preferred: ephemeral access token (no project id required).
  try {
    const res = await fetch(GRANT_URL, {
      method: "POST",
      headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl_seconds: 300 }),
    });
    if (res.ok) {
      const json = (await res.json()) as { access_token?: string };
      if (json.access_token) {
        return NextResponse.json({ configured: true, kind: "token", token: json.access_token });
      }
    }
  } catch {
    /* fall through to project-key path */
  }

  // Fallback: create a temporary scoped API key (requires DEEPGRAM_PROJECT_ID).
  if (projectId) {
    try {
      const res = await fetch(`https://api.deepgram.com/v1/projects/${projectId}/keys`, {
        method: "POST",
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          comment: `teleprompter-live-${Date.now()}`,
          scopes: ["usage:write"],
          time_to_live_in_seconds: 300,
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { key?: string };
        if (json.key) {
          return NextResponse.json({ configured: true, kind: "key", token: json.key });
        }
      }
    } catch {
      /* fall through to error */
    }
  }

  return NextResponse.json(
    { configured: false, error: "Could not mint a Deepgram token (check DEEPGRAM_API_KEY / DEEPGRAM_PROJECT_ID)." },
    { status: 500 },
  );
}
