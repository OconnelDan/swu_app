import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadTextFile } from "@/lib/downloadTextFile";

describe("descarga de archivos de texto", () => {
  const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  let createdBlob: Blob | undefined;
  const createObjectUrl = vi.fn((blob: Blob) => {
    createdBlob = blob;
    return "blob:swu-download";
  });
  const revokeObjectUrl = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    createdBlob = undefined;
    createObjectUrl.mockClear();
    revokeObjectUrl.mockClear();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();

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
  });

  it("pulsa un enlace conectado al documento y mantiene viva la URL hasta iniciar la descarga", () => {
    let clickedDownload = "";
    let clickedHref = "";
    let clickedWhileConnected = false;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clickedDownload = this.download;
      clickedHref = this.href;
      clickedWhileConnected = this.isConnected;
    });

    downloadTextFile("2x SOR_001", "cartas-faltantes.txt", "text/plain");

    expect(clickedDownload).toBe("cartas-faltantes.txt");
    expect(clickedHref).toBe("blob:swu-download");
    expect(clickedWhileConnected).toBe(true);
    expect(document.querySelector('a[download="cartas-faltantes.txt"]')).not.toBeInTheDocument();
    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(createdBlob?.type).toBe("text/plain;charset=utf-8");
    expect(revokeObjectUrl).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:swu-download");
  });
});
