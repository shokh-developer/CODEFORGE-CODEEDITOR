import { Zap } from "lucide-react";
import { useCredits } from "@/hooks/useCredits";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CreditBadgeProps {
  className?: string;
  showLabel?: boolean;
}

const CreditBadge = ({ className, showLabel = false }: CreditBadgeProps) => {
  const { balance, dailyLimit, loading } = useCredits();
  if (loading) return null;
  const pct = dailyLimit > 0 ? (balance / dailyLimit) * 100 : 0;
  const color =
    pct < 15
      ? "border-destructive/50 text-destructive bg-destructive/10"
      : pct < 35
      ? "border-amber-500/50 text-amber-400 bg-amber-500/10"
      : "border-primary/40 text-primary bg-primary/10";
  return (
    <Badge
      variant="outline"
      className={cn("font-mono gap-1 px-2 py-0.5", color, className)}
      title={`Kunlik AI credits: ${balance} / ${dailyLimit}`}
    >
      <Zap className="h-3 w-3" />
      <span className="text-[11px]">{balance}/{dailyLimit}</span>
      {showLabel && <span className="text-[10px] opacity-70 ml-1">credits</span>}
    </Badge>
  );
};

export default CreditBadge;
