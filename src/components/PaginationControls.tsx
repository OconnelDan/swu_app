import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationControlsProps {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  label?: string;
}

function visiblePages(currentPage: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "ellipsis"> = [];
  ordered.forEach((page, index) => {
    if (index > 0 && page - ordered[index - 1] > 1) result.push("ellipsis");
    result.push(page);
  });
  return result;
}

export function PaginationControls({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  label = "resultados"
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav className="flex flex-wrap items-center justify-center gap-2" aria-label={`Paginación de ${label}`}>
      <button
        type="button"
        className="btn-secondary px-3"
        aria-label="Página anterior"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        <ChevronLeft size={16} />
      </button>

      {visiblePages(currentPage, totalPages).map((page, index) =>
        page === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-1 text-sm text-slate-500" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={page === currentPage ? "btn-primary min-w-10 px-3" : "btn-secondary min-w-10 px-3"}
            aria-label={`Ir a la página ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
            onClick={() => onPageChange(page)}
          >
            {page}
          </button>
        )
      )}

      <button
        type="button"
        className="btn-secondary px-3"
        aria-label="Página siguiente"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        <ChevronRight size={16} />
      </button>
      <span className="w-full text-center text-xs text-slate-400">
        Página {currentPage} de {totalPages}
      </span>
    </nav>
  );
}
