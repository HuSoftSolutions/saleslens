import { LocationsCard } from "@/components/locations-card";
import { UsageLimitsCard } from "@/components/usage-limits-card";

export default function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your locations and account.
        </p>
      </div>

      <LocationsCard />
      <UsageLimitsCard />
    </div>
  );
}
