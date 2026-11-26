export async function request<T = any>(path: string, method = 'GET', data?: unknown, token = ''): Promise<T> {
  const response = await fetch(path, {
    method, cache: 'no-store',
    headers: {'Content-Type':'application/json', ...(token ? {Authorization:'Bearer '+token} : {})},
    body: data === undefined ? undefined : JSON.stringify(data)
  }).catch(() => {throw new Error('Conexão interrompida. Confira sua rede e tente novamente.');});
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (typeof error?.detail === 'string') throw new Error(error.detail);
    const messages: Record<number,string> = {
      401:'A sessão administrativa expirou ou a chave é inválida.',
      403:'O acesso foi recusado.',
      413:'O conteúdo enviado excedeu o limite do servidor.',
      422:'Confira os campos informados.',
      429:'Muitas solicitações. Aguarde alguns segundos antes de tentar novamente.'
    };
    const reason=messages[response.status] ?? (response.status>=500
      ? 'O serviço está temporariamente indisponível.'
      : 'O servidor recusou a solicitação.');
    throw new Error(reason+' (HTTP '+response.status+')');
  }
  return response.status === 204 ? undefined as T : response.json();
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
}
