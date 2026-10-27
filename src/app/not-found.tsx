import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center space-y-3">
      <h1 className="text-3xl">Page not found</h1>
      <p className="text-muted">That page doesn't exist.</p>
      <Link href="/" className="font-semibold underline">
        Go to the dashboard
      </Link>
    </div>
  );
}
