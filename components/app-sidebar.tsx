'use client';

import {
  Github,
  BookOpen,
  Star,
  Settings,
  Repeat,
  Moon,
  Sun,
  LogOut,
  ChevronsUpDown,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from '@/lib/auth-client';
import { toast } from 'sonner';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarSeparator,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';

import {
  DropdownMenuGroup,
  DropdownMenuSeparator,
} from '@radix-ui/react-dropdown-menu';

const AppSidebar = () => {
  const { theme, setTheme } = useTheme();
  const [loading, setIsLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();
  const navigationItems = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: BookOpen,
    },
    {
      title: 'Repository',
      url: '/dashboard/repository',
      icon: Github,
    },
    // {
    //   title: 'Reviews',
    //   url: '/dashboard/reviews',
    //   icon: Star,
    // },
    // {
    //   title: 'Subscription',
    //   url: '/dashboard/subscription',
    //   icon: Repeat,
    // },
    // {
    //   title: 'Settings',
    //   url: '/dashboard/settings',
    //   icon: Settings,
    // },
  ];

  const isActive = (url: string) => {
    return pathname === url || pathname.startsWith(url + '/dashboard');
  };

  const user = session?.user;
  const userName = user?.name || 'GUEST';
  const userEmail = user?.email || '';
  const userInitials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  const userImage = user?.image || '';

  useEffect(() => {
    setMounted((e) => (e = true));
  }, []);

  if (!mounted || !session) return null;

  const handleSignOut = async () => {
    await signOut({
      fetchOptions: {
        onRequest: () => {
          setIsLoading((e) => (e = true));
        },
        onSuccess: () => {
          toast.success('Signed Out Successfully.');
          setIsLoading((e) => (e = false));
          router.push('/login');
        },
        onError: (err) => {
          toast.error(`Error: ${err}`);
          setIsLoading((e) => (e = false));
        },
      },
    });
  };

  const handleTheme = () => {
    setTheme((e) => (e === 'dark' ? (e = 'light') : (e = 'dark')));
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex flex-col gap-4 px-2 py-6">
          <div className="flex items-center gap-4 px-3 py-4 rounded-lg bg-sidebar-accent/50 hover:bg-sidebar-accent/70 transition-colors">
            <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary text-primary-foreground shrink-0">
              <Github className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground tracking-wide">
                Connected Account
              </p>
              <p className="text-sm font-medium text-sidebar-foreground/90">
                {userName}
              </p>
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-3 py-6 flex-col gap-1">
        <SidebarMenu className="gap-2">
          {navigationItems.map((item) => {
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={`h-11 px-4 rounded-lg transition-all duration-200 ${isActive(item.url) ? 'bg-sidebar-accent text-sidebar-accent-foreground font-semibold' : 'hover:bg-sidebar-accent/60 text-sidebar-foreground'}`}
                >
                  <Link href={item.url} className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium">{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarSeparator className="-ml-0.5" />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={userImage} alt={userName} />
                    <AvatarFallback className="rounded-lg">
                      {userInitials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="grid flex-1 text-left text-sm leading-tight gap-0.5">
                    <span className="truncate font-semibold">{userName}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {userEmail}
                    </span>
                  </div>

                  <ChevronsUpDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>

              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={handleTheme}>
                    {theme === 'dark' ? (
                      <>
                        <Sun className="mr-2 size-4" />
                        Light Mode
                      </>
                    ) : (
                      <>
                        <Moon className="mr-2 size-4" />
                        Dark Mode
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut} disabled={loading}>
                  <LogOut className="mr-2 size-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
