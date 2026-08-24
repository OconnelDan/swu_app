import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CardImageThumbnail } from "@/components/CardImageThumbnail";

describe("miniatura de carta", () => {
  it("prueba el espejo cuando falla la imagen oficial", () => {
    render(
      <CardImageThumbnail
        src="https://cdn.starwarsunlimited.com//card_IBH_022.png"
        fallbackSrc="https://cdn.swu-db.com/images/cards/IBH/22.png"
        alt="GR-75 Medium Transport"
      />
    );

    const image = screen.getByRole("img", { name: "GR-75 Medium Transport" });
    expect(image).toHaveAttribute("src", "https://cdn.starwarsunlimited.com//card_IBH_022.png");

    fireEvent.error(image);

    expect(screen.getByRole("img", { name: "GR-75 Medium Transport" })).toHaveAttribute(
      "src",
      "https://cdn.swu-db.com/images/cards/IBH/22.png"
    );
  });

  it("solo oculta la miniatura después de fallar todas las fuentes", () => {
    render(
      <CardImageThumbnail
        src="https://cdn.starwarsunlimited.com//card_IBH_022.png"
        fallbackSrc="https://cdn.swu-db.com/images/cards/IBH/22.png"
        alt="GR-75 Medium Transport"
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "GR-75 Medium Transport" }));
    fireEvent.error(screen.getByRole("img", { name: "GR-75 Medium Transport" }));

    expect(screen.queryByRole("img", { name: "GR-75 Medium Transport" })).not.toBeInTheDocument();
  });

  it("vuelve a intentarlo si el componente recibe otra carta", () => {
    const { rerender } = render(
      <CardImageThumbnail src="https://example.invalid/old.png" alt="Carta anterior" />
    );
    fireEvent.error(screen.getByRole("img", { name: "Carta anterior" }));
    expect(screen.queryByRole("img", { name: "Carta anterior" })).not.toBeInTheDocument();

    rerender(<CardImageThumbnail src="https://example.invalid/new.png" alt="Carta nueva" />);

    expect(screen.getByRole("img", { name: "Carta nueva" })).toHaveAttribute(
      "src",
      "https://example.invalid/new.png"
    );
  });

  it("permite desactivar la ampliación temporal en pantallas con modal propio", () => {
    render(
      <CardImageThumbnail
        src="https://example.invalid/card.png"
        alt="Carta con ficha"
        zoomOnClick={false}
      />
    );

    fireEvent.click(screen.getByRole("img", { name: "Carta con ficha" }));

    expect(
      screen.queryByRole("button", { name: "Cerrar vista ampliada de la carta" })
    ).not.toBeInTheDocument();
  });
});
