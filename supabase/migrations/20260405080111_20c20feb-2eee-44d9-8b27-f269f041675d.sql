
-- Admin-managed user subscriptions
CREATE TABLE public.user_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'team', 'enterprise')),
  assigned_by UUID,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anyone can view their own subscription
CREATE POLICY "Users can view own subscription" ON public.user_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all subscriptions
CREATE POLICY "Admins can view all subscriptions" ON public.user_subscriptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Admins can manage subscriptions
CREATE POLICY "Admins can insert subscriptions" ON public.user_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update subscriptions" ON public.user_subscriptions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete subscriptions" ON public.user_subscriptions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
