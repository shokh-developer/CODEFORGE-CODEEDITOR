import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Zap, Users, Sparkles, Crown, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useSubscription, TIERS } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";

const plans = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "Try BuildForge AI",
    icon: Sparkles,
    features: [
      "350 AI credits / day",
      "25 credits per AI request (~14/day)",
      "5 collaborative rooms",
      "Code execution & live preview",
      "Community support",
    ],
    priceId: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: 9.99,
    description: "For active builders",
    icon: Zap,
    popular: true,
    features: [
      "1,500 AI credits / day (~60 requests)",
      "Unlimited rooms",
      "Advanced AI models (GPT-5, Gemini Pro)",
      "Priority code execution",
      "Real-time collaboration",
      "Email support",
    ],
    priceId: TIERS.pro.price_id,
  },
  {
    id: "team",
    name: "Team",
    price: 29.99,
    description: "For teams",
    icon: Users,
    features: [
      "Everything in Pro",
      "5,000 AI credits / day (~200 requests)",
      "Team workspaces",
      "Admin panel",
      "Priority support",
    ],
    priceId: TIERS.team.price_id,
  },
];


const Pricing = () => {
  const navigate = useNavigate();
  const { currentTier, checkout, manageSubscription, subscribed, loading } = useSubscription();
  const { toast } = useToast();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const handleCheckout = async (priceId: string | null, planId: string) => {
    if (!priceId) return;
    setCheckoutLoading(planId);
    try {
      await checkout(priceId);
    } catch {
      toast({ title: "Error", description: "Could not open checkout page", variant: "destructive" });
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full bg-accent/[0.03] blur-[100px]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 relative z-10">
        {/* Header */}
        <motion.div className="flex items-center gap-4 mb-12" initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground mt-1">Choose the plan that fits you · 25 credits per AI request</p>
          </div>
        </motion.div>

        {/* Plans Grid */}
        <div className="grid gap-6 sm:grid-cols-3 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const isActive = currentTier === plan.id;
            const Icon = plan.icon;

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`relative rounded-2xl border p-6 flex flex-col transition-all duration-300 ${
                  plan.popular
                    ? "border-primary/50 bg-primary/[0.05] glow-sm scale-[1.02]"
                    : isActive
                    ? "border-primary/30 bg-primary/[0.03]"
                    : "border-border/50 bg-card/30 hover:border-border hover:bg-card/50"
                }`}
              >
                {plan.popular && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3">
                    <Crown className="h-3 w-3 mr-1" /> Popular
                  </Badge>
                )}

                {isActive && (
                  <Badge variant="outline" className="absolute -top-3 left-1/2 -translate-x-1/2 border-primary/50 text-primary">
                    <Check className="h-3 w-3 mr-1" /> Current plan
                  </Badge>
                )}

                <div className="mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center mb-3">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                </div>

                <div className="mb-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                    <span className="text-sm text-muted-foreground">/month</span>
                  </div>
                </div>

                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                {isActive ? (
                  <Button variant="outline" className="w-full" onClick={manageSubscription} disabled={!subscribed}>
                    {subscribed ? "Manage subscription" : "Current plan"}
                  </Button>
                ) : plan.id === "free" ? (
                  <Button variant="outline" className="w-full" disabled>
                    {currentTier === "free" ? "Current plan" : "Free"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleCheckout(plan.priceId, plan.id)}
                    disabled={checkoutLoading === plan.id || loading}
                  >
                    {checkoutLoading === plan.id ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...</>
                    ) : (
                      "Get started"
                    )}
                  </Button>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* FAQ */}
        <motion.div className="mt-16 max-w-2xl mx-auto text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <h2 className="text-xl font-bold text-foreground mb-2">Have questions?</h2>
          <p className="text-sm text-muted-foreground">
            Email us at contact@kodo.uz or reach out via Telegram
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Pricing;
