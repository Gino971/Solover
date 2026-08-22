#!/usr/bin/env node
// Régénère data/dictionaries.json à partir des fichiers .json réellement présents
// dans data/ (hors dictionaries.json lui-même) : à lancer après avoir ajouté,
// renommé ou supprimé un dictionnaire dans ce dossier.
// Usage : node tools/update-dictionaries.js
'use strict';

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const manifestPath = path.join(dataDir, 'dictionaries.json');

const files = fs.readdirSync(dataDir)
  .filter((name) => name.toLowerCase().endsWith('.json') && name !== 'dictionaries.json')
  .sort((a, b) => a.localeCompare(b, 'fr'));

if (!files.length) {
  console.error('Aucun fichier .json trouvé dans data/ (hors dictionaries.json).');
  process.exit(1);
}

fs.writeFileSync(manifestPath, JSON.stringify(files, null, 2) + '\n');
console.log(`data/dictionaries.json mis à jour (${files.length} dictionnaire${files.length > 1 ? 's' : ''}) :`);
files.forEach((f) => console.log(`  - ${f}`));
