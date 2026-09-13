import Link from "next/link";
import { Mark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[1500px] flex-col items-start justify-center px-6">
      <p className="label mb-3 flex items-center gap-2" style={{ color: "var(--brand)" }}>
        <Mark size={16} />
        Afterhours
      </p>
      <h1 className="display text-[44px] leading-[1.02] text-text sm:text-[64px]">
        Nothing trades <em className="text-secondary">here.</em>
      </h1>
      <p className="mt-4 max-w-[50ch] text-[15px] text-secondary">
        There is one page, and this is not it. The desk reads any Solana address holding xStocks, or a sample book.
      </p>
      <Link href="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-primary px-4 text-[14px] font-medium text-primary-text hover:opacity-90">
        Open the desk
      </Link>
    </main>
  );
}
