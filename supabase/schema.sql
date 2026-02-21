-- Table des biens immobiliers
CREATE TABLE biens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  adresse TEXT NOT NULL,
  ville TEXT NOT NULL DEFAULT 'Conakry',
  type TEXT DEFAULT 'appartement',
  surface NUMERIC,
  loyer_base NUMERIC NOT NULL,
  charges NUMERIC DEFAULT 0,
  statut TEXT DEFAULT 'vacant',
  created_at TIMESTAMP DEFAULT now()
);

-- Table des locataires
CREATE TABLE locataires (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES biens(id) ON DELETE SET NULL,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  date_entree DATE NOT NULL,
  date_sortie DATE,
  depot_garantie NUMERIC DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);

-- Table des paiements
CREATE TABLE paiements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  locataire_id UUID REFERENCES locataires(id) ON DELETE CASCADE,
  bien_id UUID REFERENCES biens(id) ON DELETE SET NULL,
  montant NUMERIC NOT NULL,
  date_paiement DATE NOT NULL,
  mois_concerne TEXT NOT NULL,
  statut TEXT DEFAULT 'payé',
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Row Level Security
ALTER TABLE biens ENABLE ROW LEVEL SECURITY;
ALTER TABLE locataires ENABLE ROW LEVEL SECURITY;
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users manage own biens" ON biens FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own locataires" ON locataires FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own paiements" ON paiements FOR ALL USING (
  EXISTS (SELECT 1 FROM locataires WHERE id = paiements.locataire_id AND user_id = auth.uid())
);
