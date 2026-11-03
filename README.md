# RedAlert Poll Tracker 🚨

Une application moderne et temps réel pour le **suivi des sondages WhatsApp**, la **gestion de crise** et la corrélation instantanée avec les **alertes nationales Tzeva Adom (Pikud HaOref)**.

Conçue avec Node.js, [Baileys](https://github.com/WhiskeySockets/Baileys) (100% headless, sans Chromium ni interface lourde), SQLite (mode WAL), Socket.IO et Tailwind CSS.

---

## ✨ Fonctionnalités Principales

- **⚡ Moteur Baileys ultra-léger** : Aucun navigateur Chromium requis, démarrage instantané et empreinte mémoire minimale (~60 Mo de RAM).
- **🔴 Intégration Tzeva Adom en temps réel** : Flux direct WebSocket Tzofar (1 450+ villes géolocalisées, détection de roquettes 🚀, drones 🛸, infiltrations ⚠️, temps d'abri).
- **📊 Suivi temps réel des sondages** : Mise à jour automatique des votes en direct par Socket.IO sans rechargement.
- **🛡️ Alertes d'urgence automatiques** : Notification WhatsApp immédiate en cas de réponse critique (*"Aide"*, *"Help"*, *"SOS"*).
- **📈 Statistiques & Analyses de Crise** :
  - Bilans par période : **Dernière heure (1h)**, 24h, 7 jours, 30 jours (mois), 1 an et historique total.
  - **Recherche par membre** : Bilan multi-périodes instantané d'exposition aux alertes pour n'importe quel contact.
- **👥 Annuaire & Gestion multi-identités** :
  - Résolution des identifiants modernes WhatsApp (**LID** vs numéro international).
  - Déduplication stricte des participants et assignation de villes individuelle ou en lot.
- **🔔 Relances automatiques** : Envoi de rappels individuels ou groupés aux retardataires avec personnalisation dynamique du prénom `[Name]`.
- **📥 Export CSV & Sauvegarde ZIP** : Export des votes et sauvegarde/restauration complète de la base en 1 clic.
- **🌍 Bilingue natif (FR / EN)** : Changement de langue dynamique à chaud.

---

## 🚀 Démarrage Rapide avec Docker (Prêt à l'emploi)

L'image officielle est pré-construite et prête à l'emploi sur le registre GitHub (`ghcr.io`). **Aucune compilation ni installation de code n'est nécessaire.**

---

### Option A : Avec Docker Compose (Recommandé)

1. Créez un dossier sur votre machine et placez-vous dedans :
   ```bash
   mkdir wa-poll-tracker && cd wa-poll-tracker
   ```

2. Créez un fichier `docker-compose.yml` avec le contenu suivant :
   ```yaml
   services:
     wa-poll-tracker:
       image: ghcr.io/mercu7io/redalert-poll-tracker:latest
       container_name: wa-poll-tracker
       restart: unless-stopped
       ports:
         - "3500:3500"
       environment:
         - PORT=3500
         - APP_PASSWORD=VotreMotDePasseSecret
         - ALERT_LANGUAGE=fr
         # - ALERT_TARGET_NUMBER=972501234567 # (Optionnel) Numéro WhatsApp recevant les alertes d'urgence
       volumes:
         - ./data:/app/data
         - ./.baileys_auth:/app/.baileys_auth
   ```

3. Lancez le conteneur en arrière-plan :
   ```bash
   docker compose up -d
   ```

4. Ouvrez votre navigateur sur **`http://localhost:3500`**.

---

### Option B : Avec Docker en une seule ligne (Docker Simple)

Si vous n'utilisez pas Docker Compose, lancez directement cette commande :

```bash
docker run -d \
  --name wa-poll-tracker \
  --restart unless-stopped \
  -p 3500:3500 \
  -e APP_PASSWORD="VotreMotDePasseSecret" \
  -e ALERT_LANGUAGE="fr" \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.baileys_auth:/app/.baileys_auth \
  ghcr.io/mercu7io/redalert-poll-tracker:latest
```

*(Sous Windows PowerShell, remplacez `$(pwd)` par `${PWD}`)*

---

## 🔑 Première Utilisation (3 étapes simples)

1. **Connexion Web** : Rendez-vous sur `http://localhost:3500` et entrez votre mot de passe (`APP_PASSWORD`).
2. **Liaison WhatsApp** : Scannez le QR Code affiché à l'écran depuis WhatsApp sur votre téléphone (*Menu > Appareils connectés > Connecter un appareil*).
3. **Prêt !** : Vos groupes et sondages se synchronisent immédiatement. Vous pouvez diffuser de nouveaux sondages, suivre les votes et visualiser les alertes.

---

## ⚙️ Variables d'environnement

| Variable | Description | Valeur par défaut |
| :--- | :--- | :--- |
| `PORT` | Port d'écoute du serveur Web | `3500` |
| `APP_PASSWORD` | Mot de passe d'accès à l'interface | `admin123` *(à modifier)* |
| `ALERT_LANGUAGE` | Langue de l'interface et des notifications WhatsApp (`fr` ou `en`) | `fr` |
| `ALERT_TARGET_NUMBER` | Numéro international recevant les notifications d'urgence SOS (ex: `972501234567` ou `33612345678`) | *(Optionnel : par défaut envoyé à vous-même)* |

---

## 💾 Persistance des Données lors des Mises à Jour

Toutes vos données sont stockées sur votre machine hôte grâce aux volumes :
- `./data` : Base de données SQLite (`sondages.db`) contenant l'annuaire, les villes des contacts, l'historique des sondages et des alertes.
- `./.baileys_auth` : Clés de session WhatsApp chiffrées (vous n'avez pas besoin de rescanner le QR code après un redémarrage ou une mise à jour).

Pour mettre à jour l'application avec la dernière version :
```bash
docker compose pull
docker compose up -d
```
Vos données et votre session WhatsApp sont **100% préservées**.

---

## 🧪 Tests & Développement Local

Pour les développeurs souhaitant modifier le code source :

```bash
git clone https://github.com/Mercu7io/redalert-poll-tracker.git
cd redalert-poll-tracker
npm install
npm test       # Lance la suite complète de 75 tests automatisés
npm start      # Démarre l'application localement
```

---

## 📄 Licence

MIT

