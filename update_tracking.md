# Update Tracking - WhatsApp Poll Tracker

- 2026-11-01: Audit initial du projet, identification des incohérences Baileys/Docker et analyse des axes d'amélioration.
- 2026-11-01: Correction de la persistance de session Docker vers .baileys_auth, allègement du Dockerfile sans Chromium, externalisation des secrets dans .env et configuration des exclusions git.
- 2026-11-01: Refonte de l'architecture backend en couches (repositories, services, contrôleurs, validation typée Zod, middleware d'authentification).
- 2026-11-01: Ajout d'une suite complète de 23 tests unitaires et d'intégration avec node:test.
- 2026-11-01: Intégration du système i18n bilingue (FR/EN), de l'export CSV des votes et de la relance groupée des retardataires sur le frontend.
- 2026-11-01: Persistance du nom des votants (voter_name) dans SQLite, création du ContactRepository avec mapping bidirectionnel LID/téléphone et résolution hiérarchique des identités.
- 2026-11-01: Implémentation de l'édition rapide du nom des contacts directement dans le tableau avec propagation temps réel et mise à jour des votes historiques.
- 2026-11-01: Correction du décryptage AES-GCM des votes de sondages WhatsApp (résolution de voted [] et déclenchement des alertes d'urgence), et fiabilisation de la synchronisation temps réel Socket.IO.
- 2026-11-01: Résolution multi-identités (LID vs numéro de téléphone international) lors du déchiffrement des votes et double indexation des votes pour une correspondance infaillible dans l'UI.
- 2026-11-01: Génération et intégration d'une nouvelle icône d'application moderne en 3D/glassmorphism pour le favicon, la page de connexion et le tableau de bord.
- 2026-11-01: Ajout de l'option d'actualisation instantanée de l'horodatage sur la boîte de diffusion de sondage (Broadcast Poll) avec préservation du texte personnalisé.
- 2026-11-01: Intégration d'un bouton d'actualisation discret dans le champ de titre et d'un badge dans l'en-tête de la boîte de diffusion pour mettre à jour l'heure en un clic avec feedback visuel.
- 2026-11-01: Correction de la duplication des membres et de la fuite de votes : exclusion complète du bot (LID/JID), déduplication stricte des participants (Phone JID + LID) et suppression du matching de vote par nom au profit d'une correspondance cryptographique stricte par identifiant.
- 2026-11-01: Création du dépôt privé GitHub redalert-poll-tracker, rédaction du README.md complet et premier push sur la branche main.
- 2026-11-01: Traduction en anglais du message de notification d'alerte d'urgence WhatsApp avec support de configuration par variable d'environnement (ALERT_LANGUAGE).
- 2026-11-01: Ajout du workflow GitHub Actions de build et publication automatique de l'image Docker sur GHCR (ghcr.io), et mise à jour des fichiers d'exemple docker-compose.example.yml et .env.example.
- 2026-11-01: Double audit de sécurité et assainissement intégral des données de tests (anonymisation complète), purge de l'historique Git et passage du dépôt GitHub en visibilité publique.
- 2026-11-01: Modernisation complète de l'interface utilisateur sur la branche devs avec design 2026-2027, métriques en temps réel, recherche instantanée et tableau accessible.
- 2026-11-01: Ajout de la mise en favoris des groupes, de la persistance de sélection au rechargement, du remplacement dynamique de [Name] dans les relances et de la synchronisation d'historique WhatsApp.
- 2026-11-01: Intégration du sélecteur bilingue (FR/EN) directement sur la carte de connexion avec persistance et mise à jour dynamique des textes.
- 2026-11-01: Correction d'une erreur de syntaxe JS bloquant l'initialisation de l'application, fiabilisation du retour visuel d'erreur de mot de passe et support de la touche Entrée.
- 2026-11-01: Unification du sélecteur de langue dans la barre supérieure, suppression du sélecteur en doublon sur la carte de connexion et masquage du bouton de déconnexion pour les utilisateurs non authentifiés.
- 2026-11-02: Intégration complète des alertes Tzeva Adom / Pikud HaOref (WebSocket Tzofar temps réel, 1 451 villes israéliennes, fenêtre d'alerte paramétrable, modal de recherche de ville et colonne dédiée Localisation & Alerte avec indicateurs 🟢/🔴 dynamiques).
- 2026-11-02: Correction de l'autocomplétion des villes (sélection sécurisée par identifiant numérique unique, affichage immédiat des villes principales et redémarrage du serveur avec le nouveau code).
- 2026-11-02: Correction de la persistance multi-identités (LID vs JID) de la ville d'un contact et synchronisation bidirectionnelle dans SQLite.




