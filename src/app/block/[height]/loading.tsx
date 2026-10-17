export default function LoadingBlock() {
  return (
    <main className="app-container py-8" aria-busy="true">
      <p role="status">Loading block data...</p>
    </main>
  );
}
