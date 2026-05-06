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
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-mono text-[10px] leading-none whitespace-nowrap",
        color,
        className
      )}
      title={`Daily AI credits: ${balance} / ${dailyLimit}`}
    >
      <Zap className="h-2.5 w-2.5" />
      <span>{balance}</span>
      <span className="opacity-50">/</span>
      <span className="opacity-70">{dailyLimit}</span>
    </div>
  );
};

export default CreditBadge;
