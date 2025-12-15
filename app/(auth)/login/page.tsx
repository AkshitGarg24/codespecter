import LoginUI from '@/modules/auth/components/login';
import { requireUnauth } from '@/modules/auth/utils/auth-utils';

const LoginPage = async () => {
  await requireUnauth();
  return (
    <div>
      <LoginUI />
    </div>
  );
};

export default LoginPage;
