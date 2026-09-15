export async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; }
  catch { throw new Error("Pedido inválido."); }
}

export function handleApiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Ocorreu um erro inesperado.";
  const unauthorized = /sessão|session|autentica/i.test(message);
  return Response.json({ error: message }, { status: unauthorized ? 401 : 400 });
}
