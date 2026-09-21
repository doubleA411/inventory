export default function AppLoading() {
  return (
    <div className="animate-pulse" aria-label="Loading page" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-44 rounded bg-gray-200" />
          <div className="h-4 w-64 max-w-[70vw] rounded bg-gray-100" />
        </div>
        <div className="h-9 w-28 rounded-md bg-gray-200" />
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="card h-24 p-4" key={index}>
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="mt-4 h-6 w-16 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="card mt-6 overflow-hidden">
        <div className="border-b border-gray-100 p-4">
          <div className="h-4 w-32 rounded bg-gray-200" />
        </div>
        <div className="divide-y divide-gray-100 px-4">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="flex items-center justify-between gap-4 py-4" key={index}>
              <div className="h-4 w-1/3 rounded bg-gray-100" />
              <div className="h-4 w-20 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
