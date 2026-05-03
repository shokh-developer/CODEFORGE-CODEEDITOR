
-- ============ USER CREDITS ============
CREATE TABLE public.user_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  balance integer NOT NULL DEFAULT 350,
  daily_limit integer NOT NULL DEFAULT 350,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits" ON public.user_credits
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage credits" ON public.user_credits
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Plan-based daily limits
CREATE OR REPLACE FUNCTION public.get_daily_limit_for_plan(_plan text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _plan
    WHEN 'pro' THEN 1500
    WHEN 'team' THEN 5000
    WHEN 'enterprise' THEN 20000
    ELSE 350
  END;
$$;

-- Consume credits (refills if a new day has passed)
CREATE OR REPLACE FUNCTION public.consume_credits(_user_id uuid, _amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.user_credits%ROWTYPE;
  user_plan text;
  plan_limit integer;
BEGIN
  SELECT plan INTO user_plan FROM public.user_subscriptions WHERE user_id = _user_id;
  user_plan := COALESCE(user_plan, 'free');
  plan_limit := public.get_daily_limit_for_plan(user_plan);

  -- Ensure row exists
  INSERT INTO public.user_credits (user_id, balance, daily_limit)
  VALUES (_user_id, plan_limit, plan_limit)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  -- Refill if new day or plan changed
  IF rec.last_refill_at::date < now()::date OR rec.daily_limit <> plan_limit THEN
    UPDATE public.user_credits
       SET balance = plan_limit,
           daily_limit = plan_limit,
           last_refill_at = now(),
           updated_at = now()
     WHERE user_id = _user_id
     RETURNING * INTO rec;
  END IF;

  IF rec.balance < _amount THEN
    RETURN jsonb_build_object('ok', false, 'balance', rec.balance, 'daily_limit', rec.daily_limit, 'plan', user_plan);
  END IF;

  UPDATE public.user_credits
     SET balance = balance - _amount, updated_at = now()
   WHERE user_id = _user_id
   RETURNING * INTO rec;

  RETURN jsonb_build_object('ok', true, 'balance', rec.balance, 'daily_limit', rec.daily_limit, 'plan', user_plan);
END;
$$;

CREATE TRIGGER trg_user_credits_updated_at
BEFORE UPDATE ON public.user_credits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AI CONVERSATIONS ============
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own conversations" ON public.ai_conversations
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_conversations_user ON public.ai_conversations(user_id, updated_at DESC);

CREATE TRIGGER trg_ai_conversations_updated_at
BEFORE UPDATE ON public.ai_conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ AI MESSAGES ============
CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ai messages" ON public.ai_messages
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_ai_messages_conv ON public.ai_messages(conversation_id, created_at);
