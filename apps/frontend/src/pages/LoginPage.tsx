import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Container, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLogin } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useTranslation();
  const loginMutation = useLogin();

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-blue-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <Container className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">SwarmUI Master</h1>
          <p className="text-gray-400 mt-1">Docker Swarm Management Platform</p>
        </div>

        <Card className="shadow-2xl border-gray-700 bg-gray-800/50 backdrop-blur">
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-white text-xl">{t('auth.signIn')}</CardTitle>
            <CardDescription className="text-gray-400">
              {t('auth.enterCredentials')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">{t('auth.username')}</Label>
                <Input
                  id="username"
                  placeholder={t('auth.enterUsername')}
                  {...register('username')}
                  className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500"
                />
                {errors.username && (
                  <p className="text-red-400 text-sm">{errors.username.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">{t('auth.password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.enterPassword')}
                    {...register('password')}
                    className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:border-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-400 text-sm">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? t('auth.signingIn') : t('auth.signIn')}
              </Button>
            </form>

            <div className="mt-4 p-3 bg-gray-700/50 rounded-md">
              <p className="text-xs text-gray-400 text-center">
                Default credentials: <strong className="text-gray-200">admin</strong> / <strong className="text-gray-200">admin123!</strong>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
