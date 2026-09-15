import { handleApiError } from "@/lib/api";
import { requireWorkspace } from "@/lib/auth";

export async function GET() {
  try {
    const { user, workspace } = await requireWorkspace();
    return Response.json({ user: { id: user.id, name: user.name, username: user.username, role: user.role }, workspace: { id: workspace.id, name: workspace.name } });
  } catch (error) { return handleApiError(error); }
}
