"use client";

export default function OfflinePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      <div className="max-w-md mx-auto bg-white border rounded-lg p-6 text-center">
        <h1 className="text-2xl font-bold text-rfl-navy mb-2">You are offline</h1>
        <p className="text-gray-600 mb-4">Please check your connection. Previously viewed pages may still be available.</p>
        <button
          onClick={() => location.reload()}
          className="px-4 py-2 rounded bg-rfl-navy text-white hover:bg-rfl-navy/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}


