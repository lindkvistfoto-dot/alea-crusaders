-- Preserve imported historical work even if a client sends DELETE directly.
CREATE OR REPLACE FUNCTION public.uppslag_prevent_historical_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF jsonb_array_length(OLD.historical_prs) > 0 OR OLD.import_source IS NOT NULL OR OLD.active_pr_number IS NOT NULL THEN
    RAISE EXCEPTION 'Historical UPPSLAG entries cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS uppslag_protect_historical_delete ON public.olympia_ideas;
CREATE TRIGGER uppslag_protect_historical_delete
BEFORE DELETE ON public.olympia_ideas
FOR EACH ROW EXECUTE FUNCTION public.uppslag_prevent_historical_delete();
