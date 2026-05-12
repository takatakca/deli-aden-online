# Deploiement MochaHost — Les Délices d'Aden

Application Node.js (Express + SQLite + Nodemailer) avec frontend React/Vite.

## 1. Préparer le projet localement

```bash
npm install
npm run build
```

`npm run build` produit le dossier `dist/` que `server.cjs` sert.

## 2. Téléverser sur MochaHost

Via cPanel **File Manager** (ou FTP), envoyez le projet entier dans un dossier
hors de `public_html`, par exemple `/home/USER/deliaden/`. Téléversez **tout
sauf** `node_modules/` (sera réinstallé sur le serveur).

Doivent être présents :
- `server.cjs`
- `package.json`, `package-lock.json` (ou `bun.lock`)
- `dist/` (résultat de `npm run build`)
- `.env` (créé à partir de `.env.example`)

## 3. Créer l'application Node.js dans cPanel

1. cPanel → **Setup Node.js App** → **Create Application**
2. Node.js version : **20.x** ou supérieure
3. Application mode : **Production**
4. Application root : `deliaden` (chemin du projet)
5. Application URL : votre domaine (ex. `deliaden.ca`)
6. **Application startup file** : `server.cjs`
7. **Save**

## 4. Variables d'environnement

Toujours dans **Setup Node.js App**, section *Environment variables*, ajoutez :

```
PORT=3000
SMTP_HOST=mail.deliaden.ca
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=notify@deliaden.ca
SMTP_PASS=<votre mot de passe email>
FROM_EMAIL=notify@deliaden.ca
RESTAURANT_EMAIL=orders@deliaden.ca
ADMIN_PASSWORD=<mot de passe admin fort>
```

(Si vous préférez, créez un fichier `.env` dans le dossier de l'app — `dotenv`
le chargera automatiquement.)

## 5. Installer les dépendances

Dans cPanel → Setup Node.js App, cliquez **Run NPM Install**.

Si l'installation de `better-sqlite3` échoue (besoin de compilation native),
contactez le support MochaHost pour activer `python` + `make` + `g++`, ou
basculez vers `sqlite3` (changez l'import dans `server.cjs`).

## 6. Démarrer / Redémarrer

Cliquez **Restart** dans Setup Node.js App.

## 7. Tests

- **Health check** : `https://deliaden.ca/api/health`
  → doit renvoyer `{"ok":true,"message":"Deli Aden ordering system running"}`
- **Site** : `https://deliaden.ca/` → page d'accueil
- **Menu / Panier / Checkout** : passez une commande de test → vous devez
  recevoir un email à `orders@deliaden.ca`.
- **Admin** : `https://deliaden.ca/admin` → entrez `ADMIN_PASSWORD`.

## 8. Mises à jour

Pour redéployer après modification :

```bash
npm run build
# téléverser le nouveau dist/ et server.cjs
# cPanel → Restart
```

## 9. Sauvegarde de la base de données

La base SQLite vit par défaut dans `./data/deli-aden.db` (relatif au dossier
de l'app). Sauvegardez ce fichier régulièrement via cPanel ou cron.
