import { SearchHero } from "@/components/search-hero";
import { AppHeader } from "@/components/app-header";

export default function Home() {
  return (
    <main className="min-h-screen bg-background mx-auto w-full max-w-5xl px-4">
      <AppHeader />
      <SearchHero />
    </main>
  );
}
