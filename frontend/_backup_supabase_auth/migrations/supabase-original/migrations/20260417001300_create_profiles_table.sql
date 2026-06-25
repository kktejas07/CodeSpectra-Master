-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('superadmin', 'tenant_admin', 'user')),
  avatar_url TEXT,
  organization_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (drop first so this migration is safe after a partial apply / repair)
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can read org profiles" ON public.profiles;
CREATE POLICY "Admins can read org profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles admin_profile
      WHERE admin_profile.id = auth.uid()
      AND admin_profile.role IN ('tenant_admin', 'superadmin')
      AND (admin_profile.organization_id = organization_id OR admin_profile.role = 'superadmin')
    )
  );

DROP POLICY IF EXISTS "Service role full access" ON public.profiles;
CREATE POLICY "Service role full access" ON public.profiles
  FOR ALL USING (TRUE);

-- profiles may already exist from 20260416000000 (username, no email); add missing columns for this migration shape
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Create indexes (IF NOT EXISTS: safe when re-running or columns added later)
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_organization_id ON public.profiles(organization_id);
