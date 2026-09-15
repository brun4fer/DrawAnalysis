import { handleApiError, readJson } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";
import { claimMediaLinkToken, createMediaLinkToken, getMediaLinkStatus } from "@/lib/media-link";

export async function GET() {
  try {
    return Response.json(await getMediaLinkStatus(await requireWorkspace()));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const account = await requireWorkspace();
    const body = await readJson<{ action?: "create" | "claim"; token?: string }>(request);
    if (body.action === "create") return Response.json(await createMediaLinkToken(account), { status: 201 });
    if (body.action === "claim") return Response.json(await claimMediaLinkToken(account, body.token ?? ""));
    throw new Error("Ação de ligação inválida.");
  } catch (error) {
    return handleApiError(error);
  }
}
