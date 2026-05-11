
-- Pin search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Replace always-true insert policies with basic validation
DROP POLICY IF EXISTS "anyone_can_insert_orders" ON public.orders;
CREATE POLICY "anyone_can_insert_orders" ON public.orders
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(customer_name) BETWEEN 1 AND 200
    AND length(customer_phone) BETWEEN 4 AND 40
    AND total >= 0
    AND jsonb_typeof(items) = 'array'
  );

DROP POLICY IF EXISTS "anyone_can_insert_contact" ON public.contact_messages;
CREATE POLICY "anyone_can_insert_contact" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(name) BETWEEN 1 AND 200
    AND length(email) BETWEEN 3 AND 200
    AND length(message) BETWEEN 1 AND 5000
  );
