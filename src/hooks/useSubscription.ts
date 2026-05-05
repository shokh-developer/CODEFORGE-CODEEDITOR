import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlanType = "free" | "pro" | "team" | "enterprise";

export interface SubscriptionState {
  subscribed: boolean;
  plan: PlanType;
  expiresAt: string | null;
  loading: boolean;
}

export const TIERS = {
  pro: { price_id: "price_1THSTKFxAHy92PoIxTMBNqJz", product_id: "prod_UFyQsHPabpJKXg", name: "Pro", price: 9.99 },
  team: { price_id: "price_1THSTwFxAHy92PoIgLxSU8Po", product_id: "prod_TEAM", name: "Team", price: 29.99 },
} as const;

export function useSubscription() {
  const [state, setState] = useState<SubscriptionState>({
    subscribed: false,
    plan: "free",
    expiresAt: null,
    loading: true,
  });

  const checkSubscription = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ subscribed: false, plan: "free", expiresAt: null, loading: false });
        return;
      }

      const { data } = await supabase
        .from("user_subscriptions" as any)
        .select("plan, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const plan = ((data as any)?.plan as PlanType) || "free";
      const expiresAt = (data as any)?.expires_at || null;
      const stillValid = !expiresAt || new Date(expiresAt) > new Date();
      const effectivePlan: PlanType = stillValid ? plan : "free";

      setState({
        subscribed: effectivePlan !== "free",
        plan: effectivePlan,
        expiresAt,
        loading: false,
      });
    } catch {
      setState(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    checkSubscription();
    const interval = setInterval(checkSubscription, 30000);
    return () => clearInterval(interval);
  }, [checkSubscription]);

  const checkout = async (priceId: string) => {
    const { data, error } = await supabase.functions.invoke("create-checkout", { body: { priceId } });
    if (error) throw error;
    if (data?.url) window.open(data.url, "_blank");
  };

  const manageSubscription = async () => {
    const { data, error } = await supabase.functions.invoke("customer-portal");
    if (error) throw error;
    if (data?.url) window.open(data.url, "_blank");
  };

  return {
    ...state,
    currentTier: state.plan,
    productId: null as string | null,
    subscriptionEnd: state.expiresAt,
    checkout,
    manageSubscription,
    refresh: checkSubscription,
  };
}
