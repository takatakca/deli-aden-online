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
