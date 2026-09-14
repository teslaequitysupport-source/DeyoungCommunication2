import { Skeleton } from "@/components/ui/skeleton";
import { SiteNav } from "@/components/site/site-nav";
import { BRAND } from "@/lib/brand";

/**
 * Route-level skeleton for /support — same shape as the real page so
 * the navigation never jumps when the content arrives.
 */
export default function SupportLoading() {
  return (
    <div
      id="top"
      className="relative flex min-h-screen flex-col bg-background text-foreground"
    >
      <SiteNav brandName={BRAND.name} tagline={BRAND.tagline} />
      <main className="container-x flex-1 px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-2xl space-y-10">
          <div className="space-y-5">
            <Skeleton className="size-9 rounded-lg" />
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="rounded-xl border border-border bg-card p-6">
            <div className="space-y-5">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full rounded-lg" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full rounded-lg" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
