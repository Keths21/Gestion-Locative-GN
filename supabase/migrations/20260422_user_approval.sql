-- Migration: Système de validation des utilisateurs par l'administrateur
-- À exécuter dans le SQL Editor de Supabase Dashboard

-- Table des profils utilisateurs
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs peuvent lire leur propre profil
CREATE POLICY "Users read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Fonction de création automatique du profil à l'inscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'approved' ELSE 'pending' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Migrer les utilisateurs existants (tous approuvés pour ne pas bloquer l'accès)
INSERT INTO profiles (id, full_name, email, role, status)
SELECT
  id,
  raw_user_meta_data->>'full_name',
  email,
  CASE WHEN email = 'keita.elhadj@gmail.com' THEN 'admin' ELSE 'user' END,
  'approved'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
