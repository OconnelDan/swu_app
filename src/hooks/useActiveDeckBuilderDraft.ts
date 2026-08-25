import { useCallback, useEffect, useState } from "react";
import {
  DECK_BUILDER_DRAFT_CHANGE_EVENT,
  loadActiveDeckBuilderDraft,
  type ActiveDeckBuilderDraft
} from "@/lib/deckBuilderDraft";

export function useActiveDeckBuilderDraft(scope: string): ActiveDeckBuilderDraft | undefined {
  const [, setRevision] = useState(0);
  const activeDraft = loadActiveDeckBuilderDraft(scope);

  const refresh = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  useEffect(() => {
    const handleDraftChange = (event: Event) => {
      const changedScope = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (!changedScope || changedScope === scope) refresh();
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === localStorage) refresh();
    };

    window.addEventListener(DECK_BUILDER_DRAFT_CHANGE_EVENT, handleDraftChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(DECK_BUILDER_DRAFT_CHANGE_EVENT, handleDraftChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refresh, scope]);

  return activeDraft;
}
