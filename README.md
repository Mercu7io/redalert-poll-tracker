# RedAlert Poll Tracker 🚨

A modern, real-time web application for **WhatsApp poll tracking**, **community crisis response**, and live correlation with **Israel's national Tzeva Adom (Pikud HaOref) emergency sirens**.

Powered by Node.js, [Baileys](https://github.com/WhiskeySockets/Baileys) (100% headless, no Chromium or heavy browser needed), SQLite (WAL mode), Socket.IO, and Tailwind CSS.

---

## ✨ Key Features

- **⚡ Ultra-lightweight Baileys Engine**: Headless WhatsApp protocol engine consuming minimal RAM (~60MB), booting instantly.
- **🔴 Real-time Tzeva Adom Siren Integration**: Live WebSocket connection to Tzofar (1,450+ geolocated Israeli cities, detecting rockets 🚀, hostile drones 🛸, terrorist infiltrations ⚠️, shelter countdowns).
- **📊 Real-time Poll Tracking**: Live vote ingestion and cryptographic decryption via Socket.IO without page refreshes.
- **🛡️ Automated Emergency Alerts**: Instant WhatsApp alert notifications triggered when someone votes for a help option (*"Need help"*, *"SOS"*, *"Aide"*).
- **📈 Crisis Statistics & Exposure Analytics**:
  - Filter by period: **Last 1 hour (1h)**, 24 hours, 7 days, 30 days (Month), 1 year, and all-time history.
  - **Member Search & Breakdown**: Instant multi-period alert history and threat breakdown for any specific contact.
- **👥 Contact Directory & Multi-Identity Resolution**:
  - Automatically reconciles WhatsApp **LID** (Linked Identifier) with international phone numbers.
  - Strict deduplication, group filtering, and individual or batch city assignment.
- **🔔 Smart Automated Reminders**: Send follow-up WhatsApp reminders to pending members with dynamic `[Name]` personalization.
- **📥 CSV Export & Complete ZIP Backups**: One-click download of vote logs and full database backup/restore.
- **🌍 Native Bilingual UI (English / French)**: Switch languages on the fly.

---

## 🚀 Quick Start with Docker (Ready-to-Use)

The pre-built image is published and ready to pull from GitHub Container Registry (`ghcr.io`). **No code cloning or compilation required.**

---

### Option A: With Docker Compose (Recommended)

1. Create a dedicated folder and move into it:
   ```bash
   mkdir redalert-poll-tracker && cd redalert-poll-tracker
   ```

2. Create a `docker-compose.yml` file:
   ```yaml
   services:
     redalert-poll-tracker:
       image: ghcr.io/mercu7io/redalert-poll-tracker:latest
       container_name: redalert-poll-tracker
       restart: unless-stopped
       ports:
         - "3500:3500"
       environment:
         - PORT=3500
         - APP_PASSWORD=ChangeThisPassword123
         - ALERT_LANGUAGE=en # or 'fr'
         # - ALERT_TARGET_NUMBER=972501234567 # (Optional) Phone number receiving SOS alerts
       volumes:
         - ./data:/app/data
         - ./.baileys_auth:/app/.baileys_auth
   ```

3. Start the container in the background:
   ```bash
   docker compose up -d
   ```

4. Open your browser at **`http://localhost:3500`**.

---

### Option B: With Docker CLI (Single Command)

Run the container directly with one command:

```bash
docker run -d \
  --name redalert-poll-tracker \
  --restart unless-stopped \
  -p 3500:3500 \
  -e APP_PASSWORD="ChangeThisPassword123" \
  -e ALERT_LANGUAGE="en" \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/.baileys_auth:/app/.baileys_auth \
  ghcr.io/mercu7io/redalert-poll-tracker:latest
```

*(On Windows PowerShell, use `${PWD}` instead of `$(pwd)`)*

---

## 🔑 First-Time Setup (3 Easy Steps)

1. **Access Web Interface**: Go to `http://localhost:3500` and enter your password (`APP_PASSWORD`).
2. **Link WhatsApp**: Open WhatsApp on your phone (*Settings > Linked Devices > Link a Device*) and scan the QR code displayed on the screen.
3. **Done!**: Your participating groups and polls will synchronize automatically. You can broadcast polls, track votes, and monitor sirens in real time.

---

## ⚙️ Environment Variables

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Web interface port | `3500` |
| `APP_PASSWORD` | Access password for the web dashboard | `admin123` *(change in production)* |
| `ALERT_LANGUAGE` | Default language for UI and alert messages (`en` or `fr`) | `en` |
| `ALERT_TARGET_NUMBER` | WhatsApp number receiving urgent SOS alerts (e.g. `972501234567` or `33612345678`) | *(Optional: defaults to self)* |

---

## 💾 Data Persistence Across Updates

All your persistent data is saved on the host machine through mounted volumes:
- `./data`: SQLite database (`sondages.db`) containing the contact directory, assigned cities, and poll & alert history.
- `./.baileys_auth`: Encrypted WhatsApp session keys (you do **not** need to rescan the QR code after container restarts or updates).

To update the application to the latest version:
```bash
docker compose pull
docker compose up -d
```
All your data and WhatsApp credentials will be **100% preserved**.

---

## 🧪 Local Development & Testing

For contributors who want to modify or run the code locally:

```bash
git clone https://github.com/Mercu7io/redalert-poll-tracker.git
cd redalert-poll-tracker
npm install
npm test       # Runs the complete automated test suite (75 tests)
npm start      # Starts development server locally
```

---

## 📄 License

MIT

