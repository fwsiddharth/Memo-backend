-- ============================================
-- USER PROFILES TABLE MIGRATION
-- ============================================
-- Adds user profiles table to store usernames and display names
-- Supports both email and username authentication
-- ============================================

-- Create user profiles table
CREATE TABLE public.user_profiles (
  id TEXT PRIMARY KEY DEFAULT auth.uid()::text,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
  updated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create indexes for fast lookups
CREATE INDEX idx_user_profiles_username ON public.user_profiles (username);
CREATE INDEX idx_user_profiles_email ON public.user_profiles (email);

-- Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view all profiles (for username lookup)"
  ON public.user_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.user_profiles FOR INSERT
  WITH CHECK (auth.uid()::text = id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid()::text = id);

CREATE POLICY "Users can delete their own profile"
  ON public.user_profiles FOR DELETE
  USING (auth.uid()::text = id);

-- Function to create profile after user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, username, display_name, email)
  VALUES (
    new.id::text,
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Function to find user by username or email
CREATE OR REPLACE FUNCTION public.find_user_by_username_or_email(identifier TEXT)
RETURNS TABLE (
  user_id TEXT,
  username TEXT,
  display_name TEXT,
  email TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id as user_id,
    up.username,
    up.display_name,
    up.email
  FROM public.user_profiles up
  WHERE up.username = identifier OR up.email = identifier
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if username is available
CREATE OR REPLACE FUNCTION public.is_username_available(check_username TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE username = check_username
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;