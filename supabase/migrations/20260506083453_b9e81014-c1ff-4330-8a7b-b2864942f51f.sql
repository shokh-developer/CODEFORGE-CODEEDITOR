
-- Refill credits if it's a new day, callable from client
CREATE OR REPLACE FUNCTION public.refill_credits_if_needed(_user_id uuid)
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
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no user');
  END IF;

  SELECT plan INTO user_plan FROM public.user_subscriptions WHERE user_id = _user_id;
  user_plan := COALESCE(user_plan, 'free');
  plan_limit := public.get_daily_limit_for_plan(user_plan);

  INSERT INTO public.user_credits (user_id, balance, daily_limit)
  VALUES (_user_id, plan_limit, plan_limit)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO rec FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF rec.last_refill_at::date < now()::date OR rec.daily_limit <> plan_limit THEN
    UPDATE public.user_credits
       SET balance = plan_limit,
           daily_limit = plan_limit,
           last_refill_at = now(),
           updated_at = now()
     WHERE user_id = _user_id
     RETURNING * INTO rec;
  END IF;

  RETURN jsonb_build_object('ok', true, 'balance', rec.balance, 'daily_limit', rec.daily_limit, 'plan', user_plan);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refill_credits_if_needed(uuid) TO authenticated;

-- Also delete old AI messages cleanup is not needed, table already exists with persistence
