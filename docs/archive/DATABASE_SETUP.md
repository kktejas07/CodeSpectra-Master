# Database Setup Guide

## Required SQL for CodeSpectra

Run this SQL in your Supabase SQL Editor to set up the profiles table:

```sql
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Create index
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.user_metadata->>'full_name', 'User'),
    COALESCE(NEW.user_metadata->>'role', 'user')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Steps to Setup

1. Go to your Supabase Dashboard
2. Navigate to SQL Editor
3. Click "New Query"
4. Copy and paste the SQL above
5. Click "Run"
6. Done! Profiles table is now created

## Testing User Roles

After creating the table, you can set roles using Supabase Admin:

```sql
-- Set a user as superadmin
UPDATE public.profiles 
SET role = 'superadmin' 
WHERE email = 'admin@example.com';

-- Set a user as admin (tenant admin)
UPDATE public.profiles 
SET role = 'admin' 
WHERE email = 'teamadmin@example.com';
```

## How Redirects Work

- **Superadmin** logs in → Redirected to `/dashboard/admin/system`
- **Tenant Admin** logs in → Redirected to `/dashboard/admin/team`
- **User** logs in → Redirected to `/dashboard`

The role is automatically fetched from the profiles table and used by both the middleware and dashboard layout.
