"use client";

/**
 * App shell — the signed-in surface of the platform. Single-route by the
 * sandbox constraint: views switch in-page, every piece of state shown is
 * fetched from real APIs. No simulated numbers anywhere.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CircleDot,
  Film,
  Images,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewView } from "@/components/app/overview-view";
import { CharactersView } from "@/components/app/characters-view";
import { MediaView } from "@/components/app/media-view";
import { LiveStudioView } from "@/components/app/live-studio-view";
import { JobsView } from "@/components/app/jobs-view";
import { AdminView } from "@/components/app/admin-view";

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
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-20">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-3 flex items-center gap-3">
          <CircleDot className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          <h1 className="text-lg font-semibold tracking-tight">
            Live Character Platform
          </h1>
          <Badge variant="outline" className="hidden sm:inline-flex border-emerald-300 bg-emerald-50 text-emerald-800">
            Phase 3 · Trust plane
          </Badge>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline">
              {user.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              disabled={signingOut}
            >
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
        <Tabs value={view} onValueChange={setView} className="gap-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-6 h-auto">
            <TabsTrigger value="overview" className="gap-2 py-2">
              <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="characters" className="gap-2 py-2">
              <Users className="h-4 w-4" aria-hidden="true" />
              Characters
            </TabsTrigger>
            <TabsTrigger value="media" className="gap-2 py-2">
              <Images className="h-4 w-4" aria-hidden="true" />
              Media & Consent
            </TabsTrigger>
            <TabsTrigger value="studio" className="gap-2 py-2">
              <Film className="h-4 w-4" aria-hidden="true" />
              Live Studio
            </TabsTrigger>
            <TabsTrigger value="jobs" className="gap-2 py-2">
              <Boxes className="h-4 w-4" aria-hidden="true" />
              Jobs
            </TabsTrigger>
            {isStaff && (
              <TabsTrigger value="admin" className="gap-2 py-2">
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
          {isStaff && (
            <TabsContent value="admin">
              <AdminView selfRole={user.role} mfaEnabled={user.twoFactorEnabled} />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <footer className="mt-auto border-t bg-muted/40">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-4">
          <p className="text-xs text-muted-foreground">
            Every status on this page comes from the running backend — the
            Postgres database, the worker fleet, and the media relay. The
            current transform is an honest CPU color grade (dev worker);
            AI model capabilities arrive in Phase 2 through verified provider
            APIs.
          </p>
        </div>
      </footer>
    </div>
  );
}
