import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { HomePage } from "@/pages/HomePage";
import { ImportCollectionPage } from "@/pages/ImportCollectionPage";
import { CheckDeckPage } from "@/pages/CheckDeckPage";
import { ResultPage } from "@/pages/ResultPage";
import { FavoritesPage } from "@/pages/FavoritesPage";
import { MountedDecksPage } from "@/pages/MountedDecksPage";
import { CardFinderPage } from "@/pages/CardFinderPage";
import { FriendsPage } from "@/pages/FriendsPage";
import { AccountPage } from "@/pages/AccountPage";
import { SettingsPage } from "@/pages/SettingsPage";
import type { DeckComparisonResult, NormalizedDeck } from "@/types/deck";

export default function App() {
  const [currentDeck, setCurrentDeck] = useState<NormalizedDeck | null>(null);
  const [currentResult, setCurrentResult] = useState<DeckComparisonResult | null>(null);
  const [currentFavoriteId, setCurrentFavoriteId] = useState<string | null>(null);

  const setResult = (
    deck: NormalizedDeck,
    result: DeckComparisonResult,
    favoriteId: string | null = null
  ) => {
    setCurrentDeck(deck);
    setCurrentResult(result);
    setCurrentFavoriteId(favoriteId);
  };

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/importar" element={<ImportCollectionPage />} />
        <Route path="/comprobar" element={<CheckDeckPage onResult={setResult} />} />
        <Route
          path="/resultado"
          element={
            <ResultPage
              key={currentResult?.checkedAt}
              deck={currentDeck}
              result={currentResult}
              isFavorite={currentFavoriteId !== null}
            />
          }
        />
        <Route path="/favoritos" element={<FavoritesPage onOpenResult={setResult} />} />
        <Route path="/montados" element={<MountedDecksPage onOpenResult={setResult} />} />
        <Route path="/buscar" element={<CardFinderPage />} />
        <Route path="/amigos" element={<FriendsPage />} />
        <Route path="/cuenta" element={<AccountPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
