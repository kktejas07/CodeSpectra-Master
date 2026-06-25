-- Fix "infinite recursion detected in policy for relation profiles" when policies
-- on `profiles` reference `profiles` again (e.g. EXISTS (SELECT … FROM profiles …)).
--
-- `codespectra_is_superadmin()` runs as SECURITY DEFINER so it can read `profiles`
-- for `auth.uid()` without re-entering RLS on `profiles`.
--
-- Apply via Supabase SQL editor or `supabase db push` / migrate.

CREATE OR REPLACE FUNCTION public.codespectra_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'superadmin'
  );
$$;

REVOKE ALL ON FUNCTION public.codespectra_is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.codespectra_is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.codespectra_is_superadmin() TO service_role;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own_or_superadmin
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.codespectra_is_superadmin());

CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY profiles_update_own_or_superadmin
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.codespectra_is_superadmin())
  WITH CHECK (id = auth.uid() OR public.codespectra_is_superadmin());
