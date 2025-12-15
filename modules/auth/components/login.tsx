'use client';
import { useState } from 'react';
import { signIn } from '@/lib/auth-client';
import { Code2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Github, Ghost, ShieldCheck, Zap } from 'lucide-react';

const LoginUI = () => {
  const [loading, setIsLoading] = useState(false);

  const handleGithubSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn.social({
        provider: 'github',
      });
    } catch (error) {
      console.log(error);
    }
    setIsLoading(false);
  };

  return (
    <div className="w-full h-screen lg:grid lg:grid-cols-2">
      <div className="relative hidden h-full flex-col items-center justify-center overflow-hidden bg-zinc-900 text-white lg:flex dark:border-r border-zinc-800">
        <div className="absolute inset-0 bg-zinc-950" />
        <div className="absolute -top-[20%] -left-[10%] h-[500px] w-[500px] rounded-full bg-primary/20 blur-[100px]" />
        <div className="absolute bottom-[10%] right-[10%] h-[400px] w-[400px] rounded-full bg-violet-900/20 blur-[100px]" />
        <div className="relative z-20 flex max-w-[500px] flex-col items-center text-center p-8">
          <div className="mb-8 rounded-2xl bg-zinc-900/50 p-4 ring-1 ring-white/10 shadow-2xl backdrop-blur-md">
            <Ghost className="h-12 w-12 text-primary" />
          </div>

          <h1 className="mb-4 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            CodeSpecter
          </h1>

          <p className="mb-8 text-lg text-zinc-400">
            Code reviews, perfected. Secure your main branch with the most
            advanced AI analysis tool built for modern engineering teams.
          </p>

          <div className="grid grid-cols-3 gap-4 text-left">
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/5 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-10 text-primary" />
              <span className="text-sm font-medium text-zinc-200">
                Security First
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/5 backdrop-blur-sm">
              <Zap className="h-5 w-10 text-primary" />
              <span className="text-sm font-medium text-zinc-200">
                Instant Feedback
              </span>
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3 ring-1 ring-white/5 backdrop-blur-sm">
              <Code2 className="h-5 w-10 text-primary" />
              <span className="text-sm font-medium text-zinc-200">
                Deep Analysis
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <div className="flex justify-center lg:hidden">
              <Ghost className="h-10 w-10 text-primary mb-2" />
            </div>

            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to CodeSpecter to continue
            </p>
          </div>

          <div className="grid gap-6">
            <Button
              onClick={handleGithubSignIn}
              disabled={loading}
              variant="outline"
              size="lg"
              className="relative h-12 border-input bg-background cursor-pointer hover:bg-accent hover:text-accent-foreground transition-all"
            >
              <Github className="mr-2 h-5 w-5" />
              Continue with GitHub
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginUI;
