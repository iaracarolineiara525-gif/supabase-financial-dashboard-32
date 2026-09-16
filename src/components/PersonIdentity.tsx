import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

type PersonIdentityProps = {
  className?: string;
  photoClassName?: string;
  showLabel?: boolean;
};

export function PersonIdentity({ className, photoClassName, showLabel = true }: PersonIdentityProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground ring-1 ring-primary/20",
          photoClassName,
        )}
      >
        <Send className="h-4 w-4" />
      </div>
      {showLabel && (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">Meta Distribuidora</p>
          <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Cliente ativo</p>
        </div>
      )}
    </div>
  );
}

export function PersonAvatar({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground ring-1 ring-primary/20", className)} aria-label="Meta Distribuidora">
      <Send className="h-4 w-4" />
    </div>
  );
}

export function BrandIdentity({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <div
        className={cn(
          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-primary/30",
          compact && "h-9 w-9 rounded-xl",
        )}
      >
        <Send className={cn("h-5 w-5", compact && "h-4 w-4")} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-foreground">Sistema de Disparo</p>
        <p className="truncate text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Plataforma de mensagens</p>
      </div>
    </div>
  );
}
