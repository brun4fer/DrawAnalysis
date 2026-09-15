import { createHash, randomBytes } from "node:crypto";
import { mediaPrisma } from "./media-prisma";
import { ensureMediaWorkspace } from "./media-workspace";

type Account = Parameters<typeof ensureMediaWorkspace>[0];
const tokenHash = (token: string) => createHash("sha256").update(token.trim()).digest("hex");

export async function getMediaLinkStatus(account: Account) {
  const { mediaWorkspace } = await ensureMediaWorkspace(account);
  const accounts = await mediaPrisma.mediaAccount.findMany({ where: { mediaWorkspaceId: mediaWorkspace.id }, select: { appId: true }, orderBy: { appId: "asc" } });
  const linkedApps = [...new Set(accounts.map((item) => item.appId))];
  return { linkedApps, linked: linkedApps.length > 1 };
}

export async function createMediaLinkToken(account: Account) {
  const { mediaWorkspace } = await ensureMediaWorkspace(account);
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await mediaPrisma.mediaLinkToken.create({ data: { mediaWorkspaceId: mediaWorkspace.id, tokenHash: tokenHash(token), expiresAt } });
  return { token, expiresAt: expiresAt.toISOString() };
}

export async function claimMediaLinkToken(account: Account, token: string) {
  const normalized = token.trim();
  if (normalized.length < 20) throw new Error("Introduza um código de ligação válido.");
  const { mediaWorkspace: currentWorkspace } = await ensureMediaWorkspace(account);
  const link = await mediaPrisma.mediaLinkToken.findFirst({ where: { tokenHash: tokenHash(normalized), usedAt: null, expiresAt: { gt: new Date() } } });
  if (!link) throw new Error("O código é inválido, expirou ou já foi utilizado.");
  if (link.mediaWorkspaceId === currentWorkspace.id) {
    await mediaPrisma.mediaLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
    return getMediaLinkStatus(account);
  }
  await mediaPrisma.$transaction(async (transaction) => {
    const fresh = await transaction.mediaLinkToken.findFirst({ where: { id: link.id, usedAt: null, expiresAt: { gt: new Date() } } });
    if (!fresh) throw new Error("O código já não está disponível.");
    const targetId = fresh.mediaWorkspaceId;
    const sourceId = currentWorkspace.id;
    await transaction.mediaAsset.updateMany({ where: { mediaWorkspaceId: sourceId }, data: { mediaWorkspaceId: targetId } });
    await transaction.mediaReference.updateMany({ where: { mediaWorkspaceId: sourceId }, data: { mediaWorkspaceId: targetId } });
    await transaction.mediaAccount.updateMany({ where: { mediaWorkspaceId: sourceId }, data: { mediaWorkspaceId: targetId } });
    await transaction.mediaLinkToken.updateMany({ where: { mediaWorkspaceId: sourceId }, data: { mediaWorkspaceId: targetId } });
    await transaction.mediaLinkToken.update({ where: { id: fresh.id }, data: { usedAt: new Date() } });
    await transaction.mediaWorkspace.delete({ where: { id: sourceId } });
  });
  return getMediaLinkStatus(account);
}
