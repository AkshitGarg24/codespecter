import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center h-screen -my-20">
      <Loader2 className="animate-spin h-12 w-12 text-primary" />
      <span className="ml-3 text-xl">Loading...</span>
    </div>
  );
}
