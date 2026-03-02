export type BudgetFile = {
  fileId: string;
  groupId: string;
  name: string;
  encryptKeyId?: string;
};

export async function login(serverUrl: string, password: string): Promise<string> {
  const res = await fetch(`${serverUrl}/account/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Login failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  if (!token) throw new Error('No token in response');
  return token;
}

export async function listFiles(serverUrl: string, token: string): Promise<BudgetFile[]> {
  const res = await fetch(`${serverUrl}/sync/list-user-files`, {
    headers: {
      'x-actual-token': token,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to list files (${res.status})`);
  }

  const json = await res.json();
  const files: BudgetFile[] = (Array.isArray(json?.data) ? json.data : (json?.data?.files ?? json?.files ?? [])).map((f: Record<string, unknown>) => ({
    fileId: f.fileId ?? f.id,
    groupId: f.groupId,
    name: f.name,
    encryptKeyId: f.encryptKeyId ?? undefined,
  }));
  return files;
}
