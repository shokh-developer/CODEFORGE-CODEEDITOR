import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CreditsState {
  balance: number;
  dailyLimit: number;
  loading: boolean;
}

export function useCredits() {
  const [state, setState] = useState<CreditsState>({ balance: 0, dailyLimit: 350, loading: true });

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setState({ balance: 0, dailyLimit: 350, loading: false }); return; }
    // Trigger daily refill if needed
    await supabase.rpc("refill_credits_if_needed" as any, { _user_id: user.id });
    const { data } = await supabase
      .from("user_credits" as any)
      .select("balance, daily_limit")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setState({ balance: (data as any).balance, dailyLimit: (data as any).daily_limit, loading: false });
    } else {
      setState({ balance: 350, dailyLimit: 350, loading: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 15000);
    return () => clearInterval(i);
  }, [refresh]);

  return { ...state, refresh };
}
