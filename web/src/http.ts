export async function request<T = any>(path: string, method = 'GET', data?: unknown, token = ''): Promise<T> {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: {'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})},
    body: data === undefined ? undefined : JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'A solicitação falhou. Tente novamente.');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
