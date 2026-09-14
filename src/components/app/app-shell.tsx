"use client";

/**
 * App shell — the signed-in surface. Views switch in-page; every
 * number shown is fetched from real APIs. The chrome speaks the
 * user's language only — operational detail lives on the staff
 * help page.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Clapperboard,
  Images,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserCircle2,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandMark } from "@/components/fx/brand-mark";
import { OverviewView } from "@/components/app/overview-view";
import { CharactersView } from "@/components/app/characters-view";
import { MediaView } from "@/components/app/media-view";
import { LiveStudioView } from "@/components/app/live-studio-view";
import { JobsView } from "@/components/app/jobs-view";
import { AdminView } from "@/components/app/admin-view";
import { SettingsView } from "@/components/app/settings-view";
import { BRAND, LEGAL_LINKS } from "@/lib/brand";

export interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: string;
  twoFactorEnabled: boolean;
}

export function AppShell({ user }: { user: ShellUser }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [view, setView] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);
  // The tab is convenience only — every admin API re-checks the session role
  // server-side (and elevated roles must pass the MFA gate).
  const isStaff = ["MODERATOR", "SUPPORT", "ADMIN", "SUPER_ADMIN"].includes(user.role);

  const bumpRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const interval = setInterval(bumpRefresh, 30_000);
    return () => clearInterval(interval);
  }, [bumpRefresh]);

  async function signOut() {
    setSigningOut(true);
    await authClient.signOut();
    router.refresh();
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-black">
        <div className="container-x flex h-16 items-center gap-3 px-4 sm:px-6">
          <BrandMark size={26} />
          <h1 className="font-display text-lg font-semibold tracking-tight">{BRAND.name}</h1>

          <div className="ml-auto flex items-center gap-3">
            <span
              className="hidden items-center gap-2 rounded-full border border-border bg-white/[0.04] py-1 pl-1 pr-3 text-xs text-white/70 sm:inline-flex"
              title={user.email}
            >
              <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary">
                <UserCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              {user.name || user.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={signingOut}
              loading={signingOut}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="relative flex-1 container-x px-4 sm:px-6 py-8">
        <Tabs value={view} onValueChange={setView} className="relative gap-8">
          <TabsList
            aria-label="App sections"
            className="no-scrollbar h-auto w-full flex-nowrap justify-start overflow-x-auto"
          >
            <TabsTrigger value="overview" className="gap-2 py-2.5">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="characters" className="gap-2 py-2.5">
              <Users className="h-4 w-4" aria-hidden="true" />
              Characters
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2 py-2.5">
              <Images className="h-4 w-4" aria-hidden="true" />
              Media & Consent
            </TabsTrigger>
            <TabsTrigger value="studio" className="gap-2 py-2.5">
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
              Live Studio
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2 py-2.5">
              <Boxes className="h-4 w-4" aria-hidden="true" />
              Renders
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 py-2.5">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </TabsTrigger>
            {isStaff && (
              <TabsTrigger
                value="admin"
                className="gap-2 py-2.5 data-[state=active]:bg-white data-[state=active]:text-black data-[state=active]:font-semibold"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Admin
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview">
            <OverviewView refreshKey={refreshKey} onNavigate={setView} />
          </TabsContent>
          <TabsContent value="characters">
            <CharactersView onChanged={bumpRefresh} />
          </TabsContent>
          <TabsContent value="media">
            <MediaView onChanged={bumpRefresh} onNavigate={setView} />
          </TabsContent>
          <TabsContent value="studio">
            <LiveStudioView onChanged={bumpRefresh} onNavigate={setView} />
          </TabsContent>
          <TabsContent value="jobs">
            <JobsView refreshKey={refreshKey} onChanged={bumpRefresh} onNavigate={setView} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsView mfaEnabled={user.twoFactorEnabled} isStaff={isStaff} />
          </TabsContent>
          {isStaff && (
            <TabsContent value="admin">
              <AdminView selfRole={user.role} mfaEnabled={user.twoFactorEnabled} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <footer className="mt-auto border-t border-border bg-black">
        <div className="container-x px-4 sm:px-6 py-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <BrandMark size={22} />
              <div>
                <p className="font-display text-sm font-semibold tracking-tight">{BRAND.name}</p>
                <p className="text-[11px] text-white/45">
                  Live characters, rendered responsibly.
                </p>
              </div>
            </div>
            <nav aria-label="Legal" className="flex max-w-xl flex-wrap gap-x-5 gap-y-2.5 text-xs">
              {LEGAL_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="inline-block py-0.5 text-white/45 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
