import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PaginationControls } from "@/components/PaginationControls";

describe("controles de paginación", () => {
  it("no ocupa espacio cuando todos los resultados caben en una página", () => {
    render(
      <PaginationControls
        currentPage={1}
        pageSize={80}
        totalItems={80}
        onPageChange={vi.fn()}
      />
    );
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("permite ir a cualquier página y avanzar o retroceder", () => {
    const onPageChange = vi.fn();
    render(
      <PaginationControls
        currentPage={2}
        pageSize={80}
        totalItems={166}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText("Página 2 de 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ir a la página 3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    fireEvent.click(screen.getByRole("button", { name: "Página anterior" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: "Página siguiente" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});
