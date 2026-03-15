# Bot Sayuri – Discord + IA

Bot Discord avec intelligence artificielle (**Google Gemini**) pour le serveur **Sayurio**. Répond quand on le mentionne ou quand on répond à un de ses messages. Historique des conversations stocké dans **MongoDB** (optionnel en local, recommandé sur Railway).

## Fonctionnalités

- Répond en français avec un ton amical (persona « Sayuri »)
- **Google Gemini** (gemini-1.5-flash) pour les réponses – gratuit avec quota
- **MongoDB** : historique des conversations persisté (sur Railway avec `MONGO_URL`)
- Option : limiter les réponses à certains salons via `CHANNEL_IDS`

## Prérequis

- **Node.js** 18+
- Token Discord + clé API Gemini (gratuite sur [Google AI Studio](https://aistudio.google.com/apikey))
- (Railway) Base MongoDB sur Railway ou MongoDB Atlas

---

## Installation en local

1. Cloner le projet et aller dans le dossier :
   ```bash
   cd "bot sayuri"
   npm install
   ```

2. Copier `.env.example` en `.env` et remplir :
   ```env
   DISCORD_TOKEN=ton_token_discord
   GEMINI_API_KEY=AIza...
   # MONGO_URL optionnel en local (sinon historique en mémoire)
   ```

3. Sur [Discord Developer Portal](https://discord.com/developers/applications) → ton app → Bot → activer **Message Content Intent**.

4. Lancer :
   ```bash
   npm start
   ```

---

## Déploiement sur Railway + création du repo GitHub

### 1. Créer le repo GitHub

1. Va sur [github.com/new](https://github.com/new).
2. Nom du repo : par ex. `bot-sayuri`.
3. Ne coche pas « Initialize with README » si ton projet a déjà des fichiers.
4. Crée le repo.

Dans le dossier du bot (PowerShell) :

```powershell
cd "C:\Users\larab\Desktop\bot sayuri"
git init
git add .
git commit -m "Bot Sayuri Discord + IA + MongoDB"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/bot-sayuri.git
git push -u origin main
```

(Remplace `TON_USERNAME/bot-sayuri` par l’URL de ton repo.)

### 2. MongoDB sur Railway

1. Va sur [railway.app](https://railway.app) et connecte-toi (avec GitHub si tu veux).
2. **New Project** → **Add MongoDB** (ou « Database » puis MongoDB).
3. Une fois la base créée, ouvre le service MongoDB → onglet **Variables** (ou **Connect**) et copie **MONGO_URL** (ou « MongoDB Connection URL »).

Tu peux aussi utiliser une base MongoDB Atlas et coller son URI dans `MONGO_URL` sur Railway.

### 3. Déployer le bot sur Railway

1. **New Project** → **Deploy from GitHub repo**.
2. Choisis le repo `bot-sayuri` (ou celui que tu as créé).
3. Railway détecte Node.js et utilisera `npm start`.

### 4. Variables d’environnement sur Railway

Dans le projet Railway, ouvre le **service du bot** (celui qui déploie ton code), puis **Variables** :

| Variable        | Valeur / où la trouver |
|----------------|------------------------|
| `DISCORD_TOKEN` | Token du bot (Discord Developer Portal → Bot) |
| `GEMINI_API_KEY` | Clé API Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) |
| `MONGO_URL`     | URL MongoDB (service MongoDB Railway ou Atlas) |

Optionnel : `CHANNEL_IDS` = IDs des salons séparés par des virgules.

Enregistre les variables. Railway redéploie automatiquement.

### 5. Vérifier le déploiement

Une fois le build terminé, le bot tourne en continu. Vérifie les logs dans Railway pour voir « Connecté en tant que … » et « MongoDB connecté » si `MONGO_URL` est défini.

---

## Utilisation sur Discord

- **Mention** : `@Sayuri c'est quoi la capitale du Japon ?`
- **Répondre** à un message du bot pour enchaîner la conversation.

---

## Option : limiter aux salons autorisés

Dans `.env` ou dans les variables Railway :

```env
CHANNEL_IDS=123456789012345678,987654321098765432
```

---

## Coûts

- **Gemini** : quota gratuit sur [Google AI Studio](https://aistudio.google.com) (ex. 1500 req/jour pour gemini-1.5-flash). Pas de carte bancaire requise.
- **Railway** : offre gratuite possible ; MongoDB sur Railway ou Atlas selon ton choix.

Bon amusement sur Sayurio.
