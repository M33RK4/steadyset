// Shown the instant a screen is opened if it hasn't been fetched yet, so a tap never feels ignored.
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-10 w-56" />
      <div className="skeleton h-44 w-full" />
      <div className="skeleton h-28 w-full" />
    </div>
  );
}
