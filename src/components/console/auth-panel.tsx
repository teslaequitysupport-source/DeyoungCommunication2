"use client";

/**
 * The entry gate — sign in or create an account. Real authentication
 * (email + password, optional two-factor), every attempt audited
 * server-side. Errors shown are the server's actual responses.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, LogIn, LogOut, UserPlus } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface ConsoleUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
}

function AuthError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-[oklch(0.8_0.14_24)]"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      <div>
        <p className="font-medium text-foreground">We couldn't complete that</p>
        <p className="text-white/60">{message}</p>
      </div>
    </div>
  );
}

function SessionCard({ user }: { user: ConsoleUser }) {
  const [isSigningOut, startSignOut] = useTransition();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const router = useRouter();

  async function signOut() {
    setSignOutError(null);
    const { error } = await authClient.signOut();
    if (error) {
      setSignOutError(error.message ?? "Sign-out failed");
      return;
    }
    startSignOut(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-display text-lg font-semibold text-foreground">{user.name}</p>
        {user.role !== "USER" ? <Badge variant="default">{user.role}</Badge> : null}
        <Badge variant="status">{user.status}</Badge>
        {user.twoFactorEnabled ? <Badge variant="outline">2FA on</Badge> : null}
      </div>
      <p className="text-sm text-white/55">{user.email}</p>
      {signOutError ? <AuthError message={signOutError} /> : null}
      <Button onClick={signOut} disabled={isSigningOut} variant="outline" className="w-full sm:w-auto">
        {isSigningOut ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <LogOut className="h-4 w-4" aria-hidden="true" />
        )}
        Sign out
      </Button>
    </div>
  );
}

function AuthForms() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [signIn, setSignIn] = useState({ email: "", password: "" });
  const [signUp, setSignUp] = useState({ name: "", email: "", password: "" });

  async function handleSignIn(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signIn.email({
      email: signIn.email,
      password: signIn.password,
    });
    if (error) {
      setError(error.message ?? "Invalid email or password");
      return;
    }
    setNotice(`Signed in as ${data?.user?.email ?? "user"}.`);
    startTransition(() => router.refresh());
  }

  async function handleSignUp(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    const { data, error } = await authClient.signUp.email({
      name: signUp.name,
      email: signUp.email,
      password: signUp.password,
    });
    if (error) {
      setError(error.message ?? "Sign-up was rejected");
      return;
    }
    setNotice(`Welcome aboard, ${data?.user?.name ?? "friend"}.`);
    startTransition(() => router.refresh());
  }

  return (
    <Tabs defaultValue="signin">
      <TabsList className="grid w-full grid-cols-2" aria-label="Authentication forms">
        <TabsTrigger value="signin">
          <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
          Sign in
        </TabsTrigger>
        <TabsTrigger value="signup">
          <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
          Create account
        </TabsTrigger>
      </TabsList>

      <TabsContent value="signin" className="mt-5">
        <form onSubmit={handleSignIn} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="signin-email">Email</Label>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              required
              value={signIn.email}
              onChange={(e) => setSignIn((s) => ({ ...s, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signin-password">Password</Label>
            <Input
              id="signin-password"
              type="password"
              autoComplete="current-password"
              required
              value={signIn.password}
              onChange={(e) => setSignIn((s) => ({ ...s, password: e.target.value }))}
              placeholder="Your password"
            />
          </div>
          <Button type="submit" variant="ignite" size="lg" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Sign in
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="signup" className="mt-5">
        <form onSubmit={handleSignUp} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="signup-name">Name</Label>
            <Input
              id="signup-name"
              autoComplete="name"
              required
              value={signUp.name}
              onChange={(e) => setSignUp((s) => ({ ...s, name: e.target.value }))}
              placeholder="Your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-email">Email</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={signUp.email}
              onChange={(e) => setSignUp((s) => ({ ...s, email: e.target.value }))}
              placeholder="you@example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signup-password">Password</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={signUp.password}
              onChange={(e) => setSignUp((s) => ({ ...s, password: e.target.value }))}
              placeholder="At least 8 characters"
            />
          </div>
          <Button type="submit" variant="ignite" size="lg" className="w-full" disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Create account
          </Button>
          <p className="text-center text-xs text-white/40">
            Free to start — includes welcome credits.
          </p>
        </form>
      </TabsContent>

      {error ? <div className="mt-4"><AuthError message={error} /></div> : null}
      {notice ? (
        <div
          role="status"
          className="mt-4 flex items-start gap-2 rounded-lg border border-primary/35 bg-primary/10 p-3 text-sm text-white/85"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{notice}</p>
        </div>
      ) : null}
    </Tabs>
  );
}

export function AuthPanel({ user }: { user: ConsoleUser | null }) {
  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.05] to-transparent shadow-[0_1px_0_0_oklch(1_0_0/0.06)_inset,inset_0_0_40px_oklch(0.62_0.235_22/0.04),0_28px_72px_-24px_oklch(0_0_0/0.85)]">
      <CardHeader>
        <CardTitle className="font-display text-xl">
          {user ? "Welcome back" : "Step inside"}
        </CardTitle>
        <CardDescription>
          {user
            ? "You're signed in with a secure session."
            : "Sign in or create your account — it takes less than a minute."}
        </CardDescription>
      </CardHeader>
      <CardContent>{user ? <SessionCard user={user} /> : <AuthForms />}</CardContent>
    </Card>
  );
}
