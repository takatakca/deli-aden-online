# Déploiement MochaHost — Les Délices d'Aden

Application Node.js haute performance : Express + MySQL/MariaDB (avec
fallback SQLite) + Nodemailer + helmet/compression + frontend React/Vite.

## 1. Préparer le projet localement

```bash
npm install
npm run build
```

`npm run build` produit le dossier `dist/` que `server.cjs` sert.

## 2. Téléverser sur MochaHost

Via cPanel **File Manager** (ou FTP), envoyez le projet dans un dossier hors
de `public_html`, par exemple `/home/USER/deliaden/`. Téléversez tout sauf
`node_modules/`.

Fichiers requis : `server.cjs`, `package.json`, `package-lock.json`, `dist/`,
`.env` (créé à partir de `.env.example`).

## 3. Créer la base MySQL/MariaDB (recommandé)

Dans cPanel → **MySQL Databases** :

1. Créez une base : `USER_deliaden`
2. Créez un utilisateur : `USER_deliaden_app` avec un mot de passe fort
3. Attribuez **ALL PRIVILEGES** à l'utilisateur sur la base

Les tables (`orders`, `order_events`, `contact_messages`, `email_logs`,
`counters`) et tous les **index** (`order_number`, `status`, `created_at`,
`customer_phone`) sont créés automatiquement au premier démarrage de
`server.cjs`.

> Si vous n'utilisez pas MySQL, laissez `DB_HOST` vide : le serveur basculera
> automatiquement sur SQLite (`data/deli-aden.db`).

## 4. Créer l'application Node.js dans cPanel

1. cPanel → **Setup Node.js App** → **Create Application**
2. Node.js version : **20.x ou supérieure**
3. Application mode : **Production**
4. Application root : `deliaden`
5. Application URL : `deliaden.ca`
6. **Application startup file** : `server.cjs`
7. **Save**

## 5. Variables d'environnement

Dans **Setup Node.js App** → *Environment variables* :

```
PORT=3000

DB_HOST=localhost
DB_PORT=3306
DB_USER=USER_deliaden_app
DB_PASSWORD=<mot de passe MySQL>
DB_NAME=USER_deliaden

SMTP_HOST=mail.deliaden.ca
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=notify@deliaden.ca
SMTP_PASS=<mot de passe email>
FROM_EMAIL=notify@deliaden.ca
RESTAURANT_EMAIL=orders@deliaden.ca

ADMIN_PASSWORD=<mot de passe admin fort>
```

## 6. Installer les dépendances et démarrer

Dans cPanel → Setup Node.js App, cliquez :
1. **Run NPM Install**
2. **Restart**

## 7. Tests

- **Health** : `https://deliaden.ca/api/health`
  → `{"ok":true,"message":"...","db":"mysql"}` (ou `"db":"sqlite"`)
- **Site** : `https://deliaden.ca/`
- **Commande** : menu → panier → checkout → email arrive à `orders@deliaden.ca`
- **Admin** : `https://deliaden.ca/admin`

## 8. Performances et fiabilité (intégrées)

- **MySQL pool** (10 connexions) avec index sur `order_number`, `status`,
  `created_at`, `customer_phone`.
- **compression** (gzip) sur toutes les réponses.
- **helmet** pour les en-têtes de sécurité.
- **Cache statique 1 an** pour les assets hashés Vite, `no-cache` sur
  `index.html`.
- **Email non-bloquant** : la commande est toujours enregistrée même si SMTP
  échoue ; chaque envoi est journalisé dans la table `email_logs`
  (`sent` / `failed` / `skipped`).
- **Pool SMTP** Nodemailer pour réutiliser les connexions.
- **Logs structurés** JSON pour chaque appel `/api/*` (méthode, chemin,
  statut, durée ms).
- **`order_events`** : chaque changement de statut crée une trace.

## 9. Admin amélioré

- Auto-rafraîchissement **toutes les 10 secondes**.
- **Alerte sonore + toast** sur nouvelle commande.
- Statuts clairs : Nouvelle → Acceptée → En préparation → Prête →
  **Expédiée** → Terminée.
- **Filtres par date** (du / au), statut, recherche.
- **Export CSV** des commandes filtrées.
- Impression reçu cuisine.

## 10. Mises à jour

```bash
npm run build
# téléverser le nouveau dist/ et server.cjs
# cPanel → Restart
```

## 11. Sauvegarde

- **MySQL** : utiliser cPanel → **Backup** ou `mysqldump` via cron.
- **SQLite** (fallback) : copier `data/deli-aden.db` régulièrement.

## 12. Notes production

- **Node.js 20+** requis.
- **`mysql2`** est en pur JavaScript : aucune compilation native sur MochaHost.
- **`better-sqlite3`** (fallback) nécessite `python` + `make` + `g++` ; si
  l'installation échoue et que vous utilisez MySQL, ce package est inutilisé
  côté runtime — vous pouvez le retirer du `package.json` pour éviter
  l'erreur d'install.
- **`ADMIN_PASSWORD`** impérativement défini en env avant la production.
- **SMTP** : si les variables manquent ou échouent, les commandes sont
  enregistrées normalement, seul l'email est ignoré (loggé dans
  `email_logs`).

## 13. Dépannage (Troubleshooting)

### `/api/health` ne répond pas
- L'app Node.js est-elle démarrée ? cPanel → Setup Node.js App → état **Running**
- Le fichier de démarrage est-il bien `server.cjs` ?
- Consultez les logs cPanel : `~/logs/` ou onglet **Errors** de l'app Node.js
- Si réponse `{ "ok": false, "db": { "connected": false } }` : la base est inaccessible
  (vérifier `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, privilèges MySQL)
- Le port est-il occupé ? Définir `PORT=3000` (ou un port libre)

### Les emails n'arrivent pas
- Vérifier `/api/health` → `smtp.configured: true` ET `smtp.verified: true`
- Si `verified: false` : identifiants SMTP incorrects, port bloqué, ou
  SSL requis (`SMTP_SECURE=true` sur port 465, `false` sur 587)
- Consulter la table `email_logs` :
  ```sql
  SELECT created_at, recipient, status, error
  FROM email_logs ORDER BY id DESC LIMIT 20;
  ```
- `status = 'failed'` → lire la colonne `error`
- `status = 'skipped'` → SMTP non configuré (ajouter les vars `SMTP_*` puis Restart)
- Les commandes sont **toujours enregistrées** même si l'email échoue.

### Connexion admin impossible
- Vérifier que `ADMIN_PASSWORD` est défini dans **Environment variables**
- En production, le serveur **refuse de démarrer** si `ADMIN_PASSWORD` < 8 caractères
- Limite : **10 tentatives par 15 min par IP**. Si bloqué (429), attendre 15 min
- Vider le `localStorage` du navigateur (`deli-aden-admin-pwd`) si mot de passe en cache obsolète
- Tester manuellement :
  ```bash
  curl -X POST https://deliaden.ca/api/admin/verify \
    -H "Content-Type: application/json" -d '{"password":"VOTRE_MDP"}'
  ```

### MySQL ne se connecte pas après un Restart
- MochaHost recycle parfois les connexions. Le pool a `enableKeepAlive: true`
  et se reconnecte automatiquement. Si le problème persiste, **Restart** l'app.
- Vérifier dans cPanel → MySQL Databases que l'utilisateur a toujours `ALL PRIVILEGES`.

### Le frontend affiche une page blanche après build
- Vérifier que `dist/index.html` existe (`npm run build` a-t-il réussi ?)
- Helmet est configuré sans CSP : les assets Vite hashés doivent charger sans erreur
- Inspecter la console navigateur — un 404 sur `/assets/*.js` indique un `dist/` manquant

---

## Workflow restaurant (admin)

L'administration est accessible à `/admin` (mot de passe `ADMIN_PASSWORD`).

### Écrans
- **`/admin`** — Liste détaillée des commandes, filtres, export CSV, historique, impression.
- **`/admin/board`** — Tableau kanban (5 colonnes) avec auto-rafraîchissement 5 s et chime sur nouvelles commandes.
- **`/admin/kitchen`** — Mode cuisine plein écran (fond sombre, grosses cartes, son d'alerte). À afficher sur un écran en cuisine.
- **`/admin/dispatch`** — Gestion des livreurs (CRUD) + assignation des commandes prêtes + bouton « Livrée ».
- **`/admin/menu`** — Gestion par article : disponibilité, prix, description, image. Activation/désactivation par catégorie.
- **`/admin/metrics`** — Cartes (nouvelles / en prép / prêtes / expédiées), revenus jour/semaine/mois, courbes 14 jours.
- **`/admin/settings`** — Tous les réglages du restaurant : ouvert/fermé, pause, modes, frais, taxes, coordonnées, horaires, masquage de catégories.

### Statuts (workflow)
`new → accepted → preparing → ready → dispatched → completed` (+ `cancelled` à tout moment). Chaque changement est journalisé dans `order_events`.

### Tracking client
Lien public (sans login) sur la confirmation : `/track/<numéro>` — état en direct, ETA, bouton Appeler, bouton Itinéraire Google Maps.

### Journée type
1. **Ouverture** — `/admin/settings` → activer « Ouvert », vérifier pause OFF, ajuster temps estimés.
2. **Réception** — afficher `/admin/kitchen` en cuisine. Le son alerte chaque nouvelle commande.
3. **Préparation** — un clic suffit pour faire avancer le statut (`Acceptée → En préparation → Prête`).
4. **Expédition** — `/admin/dispatch` : assigner les commandes Prêtes à un livreur. Marquer « Livrée » au retour.
5. **Fermeture** — `/admin/settings` → « Ouvert » OFF. Exporter le CSV du jour si besoin.


---

## 14. Twilio SMS setup

Automated SMS notifications for customers (order updates) and admin (new
orders, unassigned-ready alerts, payment failures).

1. Create a Twilio account: https://www.twilio.com/try-twilio
2. Buy or verify a phone number capable of SMS (Canadian long code
   recommended for Quebec).
3. Add these environment variables in cPanel → Setup Node.js App →
   *Environment variables* :

   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+15145551234
   SMS_ENABLED=true
   SMS_RESTAURANT_ADMIN_PHONE=+15145550000
   PUBLIC_BASE_URL=https://deliaden.ca
   ```

4. **Restart** the Node.js app.
5. **SMS Pumping Protection** — in the Twilio Console, enable *Messaging →
   Services → Advanced → SMS Pumping Protection* and restrict *SMS Geo
   Permissions* to **Canada** only (and any additional country you serve).
6. **Canadian SMS compliance** — Canada's anti-spam law (CASL / CRTC) and
   Twilio's Canadian A2P rules require:
   - Explicit customer consent (the checkout checkbox `sms_opt_in` records
     it — respect it: unchecked = no customer SMS).
   - A clear sender identification (all templates start with
     `Deli Aden — …`).
   - No promotional content in transactional SMS. Templates cover only
     order status and payments.
7. Test order SMS:
   - Place a test order at `/checkout` with SMS opt-in checked.
   - Check the admin SMS page: `/admin/sms` — you should see one `sent`
     row for the customer confirmation and one for the admin alert.
   - Failed sends appear with `status=failed` and the Twilio error;
     use the *Retry* button to resend.

### Optional — ready-order alert scheduler

Alerts the admin by SMS when a delivery order stays in `ready` status
for too long without a driver. Off by default:

```
ENABLE_READY_ORDER_ALERTS=true
UNASSIGNED_READY_ALERT_MINUTES=10
```

One alert per order (deduplicated via `sms_logs`).

---

## 15. Driver portal workflow

Drivers manage their deliveries from `/driver` (public URL, PIN or
SMS OTP login). No admin password required for drivers.

1. **Create the driver** in admin: `/admin/dispatch` → *Livreurs* →
   fill name + phone (E.164) → *Ajouter*.
2. **Set a PIN** for the driver (admin only, one-time) via
   `POST /api/admin/drivers/:id/pin` — the admin dispatch UI exposes
   this action, or use the API directly. Alternatively the driver can
   request an SMS OTP at login if Twilio is configured.
3. **Driver logs in** at `https://deliaden.ca/driver` using their
   phone + PIN (or OTP).
4. **Driver goes online** with the *En ligne* toggle. Admin sees the
   green dot in `/admin/dispatch`.
5. **Admin assigns** a ready delivery order from `/admin/dispatch`
   → *Commandes prêtes à expédier* → *Assigner*. Status becomes
   `dispatched` and the driver assignment is created.
6. **Driver accepts** the order in the portal (`assigned → accepted`,
   timestamp `driver_accepted_at`).
7. **Driver marks Ramassée** when picking up the food
   (`accepted → picked_up`, timestamp `picked_up_at`).
8. **Driver marks Livrée** at the customer's door
   (`picked_up → delivered`, timestamp `delivered_at`; order status
   flips to `completed`).
9. **Customer tracking** at `/track/<orderNumber>` updates live via
   SSE for every step (assigned → accepted → picked up → delivered)
   plus driver name/phone and status pill.

**Admin overrides** in `/admin/dispatch`:
- *Retirer* — unassigns the driver, order returns to `ready`.
- *Réassigner* — pick another active driver and confirm; timestamps reset.
