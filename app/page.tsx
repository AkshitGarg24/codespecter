import { Logout } from '@/modules/auth/components/logout';
import { requireAuth } from '@/modules/auth/utils/auth-utils';

export default async function Home() {
  await requireAuth();
  return <Logout />;
}
