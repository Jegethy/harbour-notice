import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = {
  title: "Administrator sign in — Harbour Care Centre",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/admin/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/admin";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-brand-primary p-6">
      <div className="w-full max-w-md rounded-2xl bg-neutral-light p-8 shadow-xl">
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-primary">Harbour Care Centre</h1>
          <p className="mt-1 text-sm font-medium text-neutral-dark/70">
            Duty noticeboard — administrator sign in
          </p>
        </header>

        <LoginForm next={next} />
      </div>
    </main>
  );
}
