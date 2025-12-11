import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  variant?: "default" | "success" | "warning" | "destructive" | "info";
  className?: string;
}

const variantStyles = {
  default: {
    icon: "bg-primary/20 text-primary",
    glow: "shadow-primary/20",
  },
  success: {
    icon: "bg-success/20 text-success",
    glow: "shadow-success/20",
  },
  warning: {
    icon: "bg-warning/20 text-warning",
    glow: "shadow-warning/20",
  },
  destructive: {
    icon: "bg-destructive/20 text-destructive",
    glow: "shadow-destructive/20",
  },
  info: {
    icon: "bg-primary/20 text-primary",
    glow: "shadow-primary/20",
  },
};

export const KPICard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  variant = "default",
  className,
}: KPICardProps) => {
  const styles = variantStyles[variant];
  
  return (
    <Card className={cn(
      "animate-fade-in glass-card hover:border-primary/30 transition-all duration-300",
      className
    )}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "p-3 rounded-xl shadow-lg",
            styles.icon,
            styles.glow
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};