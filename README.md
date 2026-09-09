# Cœur & Indices

Jeu d'association de mots à cœur, jouable hors-ligne à plusieurs, inspiré de *So Clover!*.

## Déployer sur GitHub Pages

Ce dépôt contient un workflow GitHub Actions (`.github/workflows/deploy.yml`) qui déploie
automatiquement le site sur GitHub Pages à chaque push sur la branche `main`.

Étapes (une seule fois) :

1. Crée un nouveau dépôt sur GitHub (public ou privé), sans README/gitignore/licence
   (pour ne pas entrer en conflit avec ce dossier).
2. Depuis ce dossier, connecte-le au dépôt distant et pousse :
   ```bash
   git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
   git branch -M main
   git add -A
   git commit -m "Version initiale"
   git push -u origin main
   ```
3. Sur GitHub : **Settings → Pages → Build and deployment → Source**, choisis
   **GitHub Actions** (pas "Deploy from a branch").
4. Le workflow se lance automatiquement ; l'URL du site apparaît dans l'onglet
   **Actions** une fois le déploiement terminé (généralement
   `https://<ton-compte>.github.io/<ton-repo>/`).

À chaque prochain `git push` sur `main`, le site se met à jour automatiquement.

## Ajouter un dictionnaire

Dépose un fichier `.json` (liste de mots) dans `data/`, puis lance :

```bash
node tools/update-dictionaries.js
```

Il apparaîtra dans le menu déroulant du jeu (écran « Gérer les cartes » ou « Gérer les mots » selon le dictionnaire actif).

Le dictionnaire principal du jeu est maintenant `data/So lover.json`.
