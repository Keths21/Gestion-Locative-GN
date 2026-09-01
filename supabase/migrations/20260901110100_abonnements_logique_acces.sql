-- Durée de l'essai offert à la création d'une organisation.
CREATE OR REPLACE FUNCTION public.jours_essai()
RETURNS INTEGER LANGUAGE SQL IMMUTABLE AS $$ SELECT 30; $$;

-- L'essai s'ouvre en même temps que l'organisation. On étend handle_new_user
-- plutôt que d'ajouter un trigger : même raison qu'en août, l'ordre entre deux
-- triggers AFTER INSERT dépend de leurs noms.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'admin' ELSE 'user' END,
    CASE WHEN NEW.email = 'keita.elhadj@gmail.com' THEN 'approved' ELSE 'pending' END
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.organisations (id, nom)
  VALUES (NEW.id, COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email, 'Mon agence'))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.membres (organisation_id, user_id, role)
  VALUES (NEW.id, NEW.id, 'proprietaire')
  ON CONFLICT (organisation_id, user_id) DO NOTHING;

  INSERT INTO public.abonnements (organisation_id, acces_jusqu_au)
  VALUES (NEW.id, now() + (public.jours_essai() || ' days')::interval)
  ON CONFLICT (organisation_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- État d'accès de l'appelant, en un seul aller-retour.
--
-- Appelée par proxy.ts à chaque requête : elle doit rester bon marché, d'où la
-- lecture directe plutôt qu'un calcul. `actif` est dérivé de la date, jamais
-- stocké — un booléen figé serait faux dès la seconde d'après.
CREATE OR REPLACE FUNCTION public.etat_abonnement()
RETURNS TABLE (
  organisation_id UUID,
  acces_jusqu_au  TIMESTAMPTZ,
  actif           BOOLEAN,
  a_deja_paye     BOOLEAN,
  jours_restants  INTEGER
)
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.organisation_id,
         a.acces_jusqu_au,
         a.acces_jusqu_au > now(),
         a.a_deja_paye,
         GREATEST(0, CEIL(EXTRACT(EPOCH FROM (a.acces_jusqu_au - now())) / 86400))::integer
    FROM public.membres m
    JOIN public.abonnements a ON a.organisation_id = m.organisation_id
   WHERE m.user_id = auth.uid()
   ORDER BY m.cree_le
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.etat_abonnement() TO anon, authenticated;

-- Crédite un paiement encaissé. Appelée UNIQUEMENT par le webhook, via la clé
-- de service.
--
-- Toute la sûreté tient dans le UPDATE conditionnel : il ne passe que si la
-- ligne est encore `en_attente`. SASPay réémet ses webhooks jusqu'à cinq fois,
-- et /checkout-sessions/ n'a aucune idempotence — sans cette garde, une simple
-- relance de livraison offrirait un mois supplémentaire.
--
-- La période part de MAX(maintenant, accès actuel) : payer en avance prolonge,
-- ça ne remet pas le compteur à zéro. Un client qui renouvelle trois jours trop
-- tôt ne doit pas les perdre.
CREATE OR REPLACE FUNCTION public.crediter_abonnement(
  p_session_id TEXT,
  p_reference  TEXT DEFAULT NULL,
  p_debite     NUMERIC DEFAULT NULL,
  p_net        NUMERIC DEFAULT NULL,
  p_frais      NUMERIC DEFAULT NULL,
  p_charge     JSONB DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org    UUID;
  v_debut  TIMESTAMPTZ;
  v_fin    TIMESTAMPTZ;
BEGIN
  UPDATE public.paiements_abonnement
     SET statut = 'reussi',
         reference = COALESCE(p_reference, reference),
         montant_debite = p_debite,
         montant_net = p_net,
         frais = p_frais,
         charge_brute = COALESCE(p_charge, charge_brute),
         paye_le = now()
   WHERE session_id = p_session_id
     AND statut = 'en_attente'
   RETURNING organisation_id INTO v_org;

  IF v_org IS NULL THEN
    -- Soit la session est inconnue, soit elle a déjà été créditée. Les deux se
    -- distinguent, parce qu'une session inconnue mérite une alerte alors qu'une
    -- relance de webhook est parfaitement normale.
    RETURN jsonb_build_object(
      'credite', false,
      'motif', CASE WHEN EXISTS (SELECT 1 FROM public.paiements_abonnement WHERE session_id = p_session_id)
                    THEN 'deja_traite' ELSE 'session_inconnue' END
    );
  END IF;

  SELECT GREATEST(now(), a.acces_jusqu_au) INTO v_debut
    FROM public.abonnements a WHERE a.organisation_id = v_org;

  v_debut := COALESCE(v_debut, now());
  v_fin   := v_debut + interval '1 month';

  INSERT INTO public.abonnements (organisation_id, acces_jusqu_au, a_deja_paye)
  VALUES (v_org, v_fin, true)
  ON CONFLICT (organisation_id) DO UPDATE
    SET acces_jusqu_au = v_fin, a_deja_paye = true;

  UPDATE public.paiements_abonnement
     SET periode_debut = v_debut, periode_fin = v_fin
   WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'credite', true, 'organisation_id', v_org,
    'periode_debut', v_debut, 'periode_fin', v_fin
  );
END;
$$;

-- Fonctions de service : ni l'une ni l'autre n'est appelée par une policy, les
-- retirer de l'API publique ne peut donc rien casser.
REVOKE EXECUTE ON FUNCTION public.crediter_abonnement(text,text,numeric,numeric,numeric,jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.jours_essai() FROM anon, authenticated;

-- Reprise des organisations existantes : elles n'ont jamais rien payé, et rien
-- ne justifierait de les couper. Elles reçoivent le même essai qu'un nouveau
-- venu, à compter d'aujourd'hui.
--
-- ⚠️ C'est une DÉCISION COMMERCIALE prise par défaut, pas une évidence
-- technique : ajustez la date de vos clients existants avant que le blocage ne
-- soit déployé.
INSERT INTO public.abonnements (organisation_id, acces_jusqu_au)
SELECT o.id, now() + (public.jours_essai() || ' days')::interval
  FROM public.organisations o
 ON CONFLICT (organisation_id) DO NOTHING;
