import type { Metadata } from "next";
import { FloorsPanel } from "@/components/admin/FloorsPanel";
import { PinForm } from "@/components/admin/PinForm";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings — Harbour Care Centre",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();

  const supabase = await createClient();

  const [{ data: pinSetAt }, { data: floors }] = await Promise.all([
    supabase.rpc("swap_pin_status"),
    supabase.from("floors").select("*").order("sort_order"),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">Settings</h1>
      </header>

      <Panel
        title="Shift swap PIN"
        description="The four digits staff type on a tablet before they can change who is on the board. One PIN covers every floor."
      >
        <PinForm setAt={pinSetAt ?? null} />

        <p className="mt-4 rounded-lg bg-neutral-dark/5 px-4 py-3 text-sm text-neutral-dark/70">
          A correct PIN unlocks the board for ten minutes rather than for a single
          change, so a whole handover can be done without typing it again. There is
          a <strong>Done</strong> button on the board to lock it immediately.
        </p>
      </Panel>

      <Panel
        title="Floors"
        description="Each floor has its own board and its own tablet."
      >
        <FloorsPanel floors={floors ?? []} />
      </Panel>

      <Panel
        title="Setting up a tablet"
        description="What to do when a new tablet goes on a wall, or an existing one has been wiped."
      >
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-neutral-dark/80">
          <li>
            Open <code className="rounded bg-neutral-dark/5 px-1.5 py-0.5 font-mono">/setup</code>{" "}
            on the tablet.
          </li>
          <li>Choose the floor it is mounted on, and enter the setup code.</li>
          <li>
            It goes straight to that floor&rsquo;s board and stays there. Point the
            tablet&rsquo;s browser at{" "}
            <code className="rounded bg-neutral-dark/5 px-1.5 py-0.5 font-mono">/</code> on
            boot and it reopens the right board by itself.
          </li>
        </ol>

        <p className="mt-4 rounded-lg bg-neutral-dark/5 px-4 py-3 text-sm text-neutral-dark/70">
          The setup code is <code className="font-mono">BOARD_SETUP_TOKEN</code> in the
          server&rsquo;s environment — it is deliberately not shown here, and not
          stored in the database. Changing it un-pairs every tablet at once, which is
          how you revoke a tablet that has gone missing.
        </p>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-dark/10 bg-white p-5 shadow-sm sm:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-brand-primary">{title}</h2>
        <p className="mt-1 text-sm text-neutral-dark/70">{description}</p>
      </header>
      {children}
    </section>
  );
}
