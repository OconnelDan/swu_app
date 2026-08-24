import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSourceContext, type DataSourceValue } from "@/contexts/DataSourceContext";
import { ScanCardsPage } from "@/pages/ScanCardsPage";

const mocks = vi.hoisted(() => ({
  recognizeCardCode: vi.fn(),
  disposeCardScanner: vi.fn(),
  getCard: vi.fn()
}));

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

vi.mock("@/lib/cardScanner", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/cardScanner")>();
  return {
    ...original,
    recognizeCardCode: mocks.recognizeCardCode,
    disposeCardScanner: mocks.disposeCardScanner
  };
});

vi.mock("@/providers/cardProvider/SwUnlimitedDbCardProvider", () => ({
  SwUnlimitedDbCardProvider: class {
    getCard = mocks.getCard;
  }
}));

function dataSource(overrides: Partial<DataSourceValue> = {}): DataSourceValue {
  return {
    mode: "account",
    collection: {
      cards: [],
      differentCards: 0,
      totalCopies: 0,
      fingerprint: "empty",
      isEmpty: true
    },
    favorites: [],
    accountUpdatedAt: "2026-08-15T08:00:00.000Z",
    hasAccountData: true,
    error: null,
    refreshing: false,
    refresh: vi.fn(),
    replaceCollection: vi.fn(),
    addCollectionCard: vi.fn().mockResolvedValue(1),
    removeCollectionCard: vi.fn().mockResolvedValue(0),
    saveFavoriteDeck: vi.fn(),
    updateFavoriteResult: vi.fn(),
    renameFavoriteDeck: vi.fn(),
    deleteFavoriteDeck: vi.fn(),
    duplicateFavoriteDeck: vi.fn(),
    mountFavoriteDeck: vi.fn(),
    unmountFavoriteDeck: vi.fn(),
    prioritizeFavoriteDeckCard: vi.fn(),
    ...overrides
  };
}

function renderPage(value: DataSourceValue) {
  return render(
    <DataSourceContext.Provider value={value}>
      <MemoryRouter>
        <ScanCardsPage />
      </MemoryRouter>
    </DataSourceContext.Provider>
  );
}

describe("añadir cartas con la cámara", () => {
  beforeEach(() => {
    mocks.recognizeCardCode.mockReset().mockResolvedValue({
      cardId: "ASH_132",
      setCode: "ASH",
      cardNumber: "132",
      printedTotal: 264,
      rawText: "ASH EN 132/264"
    });
    mocks.getCard.mockReset().mockResolvedValue({
      cardId: "ASH_132",
      setCode: "ASH",
      cardNumber: "132",
      name: "Queen Soruna, Willing to Fight"
    });
    mocks.disposeCardScanner.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:card-photo")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    if (originalCreateObjectUrl) {
      Object.defineProperty(URL, "createObjectURL", originalCreateObjectUrl);
    } else {
      delete (URL as Partial<typeof URL>).createObjectURL;
    }
    if (originalRevokeObjectUrl) {
      Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectUrl);
    } else {
      delete (URL as Partial<typeof URL>).revokeObjectURL;
    }
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("bloquea el escáner para invitados", () => {
    renderPage(dataSource({ mode: "guest", accountUpdatedAt: null }));

    expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir escáner en vivo" })).not.toBeInTheDocument();
  });

  it("reconoce, confirma y añade una carta a la cuenta", async () => {
    const addCollectionCard = vi.fn().mockResolvedValue(4);
    const { container } = renderPage(dataSource({ addCollectionCard }));

    expect(screen.getByRole("button", { name: "Abrir escáner en vivo" })).toBeInTheDocument();

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const photo = new File(["photo"], "queen-soruna.jpg", { type: "image/jpeg" });
    fireEvent.change(inputs[1], { target: { files: [photo] } });

    await waitFor(() =>
      expect(screen.getByText("Queen Soruna, Willing to Fight")).toBeInTheDocument()
    );
    expect(screen.getByText("ASH_132")).toBeInTheDocument();
    const quantityInput = screen.getByRole("spinbutton", { name: "Cantidad de copias" });
    expect(quantityInput).toHaveValue(1);
    fireEvent.change(quantityInput, { target: { value: "4" } });

    fireEvent.click(screen.getByRole("button", { name: "Añadir 4 copias a mi colección" }));

    await waitFor(() =>
      expect(addCollectionCard).toHaveBeenCalledWith(
        {
          cardId: "ASH_132",
          setCode: "ASH",
          cardNumber: "132",
          name: "Queen Soruna, Willing to Fight"
        },
        4
      )
    );
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "4 copias de Queen Soruna, Willing to Fight añadidas."
      )
    );
    expect(
      screen.getByText((_, element) =>
        Boolean(element?.tagName === "P" && element.textContent?.includes("Ahora tienes 4 copias."))
      )
    ).toBeInTheDocument();
  });

  it("guarda una impresión variante como la carta base de la colección", async () => {
    mocks.recognizeCardCode.mockResolvedValue({
      cardId: "SEC_526",
      setCode: "SEC",
      cardNumber: "526",
      printedTotal: 264,
      rawText: "SEC EN 526/264"
    });
    mocks.getCard.mockResolvedValue({
      cardId: "SEC_262",
      setCode: "SEC",
      cardNumber: "262",
      name: "Ando Commission",
      imageUrl: "https://cdn.swu-db.com/images/cards/SEC/526.png"
    });
    const addCollectionCard = vi.fn().mockResolvedValue(1);
    const { container } = renderPage(dataSource({ addCollectionCard }));

    const inputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fireEvent.change(inputs[1], {
      target: { files: [new File(["photo"], "ando-commission.jpg", { type: "image/jpeg" })] }
    });

    await waitFor(() => expect(screen.getByText("Ando Commission")).toBeInTheDocument());
    expect(
      screen.getByText(/Impresión detectada: SEC_526 · se guardará como la carta base SEC_262/)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Añadir 1 copia a mi colección" }));
    await waitFor(() =>
      expect(addCollectionCard).toHaveBeenCalledWith(
        {
          cardId: "SEC_262",
          setCode: "SEC",
          cardNumber: "262",
          name: "Ando Commission"
        },
        1
      )
    );
  });

  it("abre el escáner continuo sin pedir que se pulse un disparador", async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }]
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    renderPage(dataSource());
    fireEvent.click(screen.getByRole("button", { name: "Abrir escáner en vivo" }));

    await waitFor(() => expect(screen.getByLabelText("Vista de la cámara")).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ facingMode: { ideal: "environment" } })
      })
    );
    expect(screen.queryByRole("button", { name: "Capturar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar escaneo" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar escaneo" }));
    expect(stop).toHaveBeenCalledOnce();
  });
});
