# Emails d'authentification Joblytics

Ces templates remplacent les emails par défaut de Supabase (qui affichent « Supabase » et
tombent souvent en spam) par des emails brandés Joblytics, bilingues FR + EN.

## Fichiers
- `confirm-signup.html` — confirmation d'inscription
- `reset-password.html` — réinitialisation du mot de passe

---

## 1. Coller les templates (2 min)

Supabase → **Authentication → Emails** :

| Onglet Supabase | Fichier à coller | Objet suggéré |
|---|---|---|
| **Confirm signup** | `confirm-signup.html` | `Confirmez votre compte Joblytics / Confirm your Joblytics account` |
| **Reset Password** | `reset-password.html` | `Réinitialisez votre mot de passe Joblytics / Reset your Joblytics password` |

Pour chaque onglet : bascule sur la vue **Source / HTML**, colle le contenu du fichier, mets
l'objet ci-dessus, puis **Save**. Les variables `{{ .ConfirmationURL }}` sont remplacées
automatiquement par Supabase.

> Astuce : les mêmes gabarits marchent pour **Magic Link** et **Change Email Address** si tu
> les utilises — duplique `confirm-signup.html` et adapte le titre.

---

## 2. Nom d'expéditeur + SMTP personnalisé (le vrai correctif anti-spam)

Coller les templates change le *contenu*, mais tant que Supabase envoie depuis son SMTP
partagé, l'expéditeur reste générique et la délivrabilité est mauvaise. Pour que l'email
vienne de **Joblytics** et arrive en boîte de réception :

Supabase → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**, avec un
fournisseur comme **[Resend](https://resend.com)**, **[Postmark](https://postmarkapp.com)**
ou **[Brevo](https://www.brevo.com)** :

- **Sender name** : `Joblytics`
- **Sender email** : `no-reply@joblytics-ai.com`
- **Host / Port / User / Password** : fournis par ton fournisseur SMTP.

Puis, chez le fournisseur, **vérifie le domaine `joblytics-ai.com`** en ajoutant les
enregistrements DNS **SPF**, **DKIM** (et idéalement **DMARC**) qu'il te donne. C'est cette
authentification de domaine qui sort tes emails des spams.

### Résumé express (Resend)
1. Crée un compte Resend → **Domains → Add `joblytics-ai.com`** → ajoute les DNS fournis.
2. **API Keys / SMTP** → récupère host `smtp.resend.com`, port `465`, user `resend`, password = ta clé API.
3. Colle ces valeurs dans Supabase → SMTP Settings, avec le sender ci-dessus.

---

## 3. Vérifier
Crée un compte test → l'email doit :
- venir de **Joblytics `<no-reply@joblytics-ai.com>`** (plus « Supabase »),
- s'afficher bilingue avec le bouton cuivre,
- arriver en **boîte de réception** (pas en spam) une fois le domaine vérifié.

---

## Notes
- Supabase n'a qu'**un template par type** (pas de version par langue de l'utilisateur) : c'est
  pourquoi chaque email est **bilingue** (français puis anglais).
- Accent utilisé : cuivre `#B5663C` (couleur de marque Joblytics). Change-la dans les fichiers
  si la charte évolue.
