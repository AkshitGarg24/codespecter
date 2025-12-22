'use server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

export const requireAuth = async () => {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
};

export const requireUnauth = async () => {
  const session = await getSession();
  if (session) redirect('/');
  return session;
};

export const getSession = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
};
