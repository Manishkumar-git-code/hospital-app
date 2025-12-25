export type RequestUserRole = 'patient' | 'hospital' | 'driver';

export type RequestUser = {
  id: string;
  role: RequestUserRole;
  email?: string;
};

export function getRequestUser(headers: Headers): RequestUser | null {
  const id = headers.get('x-user-id') || '';
  const role = (headers.get('x-user-role') || '') as RequestUserRole;
  const email = headers.get('x-user-email') || undefined;

  if (!id) return null;
  if (role !== 'patient' && role !== 'hospital' && role !== 'driver') return null;

  return { id, role, email };
}
