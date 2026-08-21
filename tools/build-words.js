#!/usr/bin/env node
// Script de génération ponctuelle du dictionnaire (data/words.json).
// Source brute : FrequencyWords (hermitdave, licence MIT) - fr_50k.txt
// Usage : node tools/build-words.js <chemin_fr_50k.txt>
'use strict';

const fs = require('fs');
const path = require('path');

const srcPath = process.argv[2];
const dicPath = process.argv[3];
if (!srcPath || !dicPath) {
  console.error('Usage: node build-words.js <fr_50k.txt> <fr.dic>');
  process.exit(1);
}

// Dictionnaire Hunspell (LibreOffice fr_FR) utilisé comme référence pour écarter
// les noms propres / mots étrangers qui polluent la liste de fréquence (sous-titres).
// On ignore les entrées capitalisées (prénoms, noms propres marqués par Hunspell),
// on ne garde que les entrées déjà en minuscules (mots communs).
const dicLines = fs.readFileSync(dicPath, 'utf8').split('\n');
const baseWords = new Set();
for (const raw of dicLines) {
  const entry = raw.split('/')[0].trim();
  if (!entry || entry[0] !== entry[0].toLowerCase()) continue;
  baseWords.add(entry);
}

// Suffixes courants (pluriels, féminins, désinences verbales) essayés pour rattacher
// une forme fléchie de la liste de fréquence à une entrée du dictionnaire de référence.
const SUFFIXES = [
  's', 'x', 'es', 'aux', 'ale', 'ales', 'ant', 'ante', 'ants', 'antes',
  'ait', 'aient', 'ais', 'iez', 'ions', 'ent', 'ez', 'e', 'ee', 'ees', 'es',
  'if', 'ive', 'ifs', 'ives', 'é', 'ée', 'és', 'ées'
];
function isKnownWord(w) {
  if (baseWords.has(w)) return true;
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) {
      if (baseWords.has(w.slice(0, -suf.length))) return true;
    }
  }
  return false;
}

// Mots-outils français à exclure (pronoms, articles, prépositions, conjonctions,
// auxiliaires conjugués, adverbes de degré/négation, interrogatifs...).
const STOPWORDS = new Set(`
alors après assez aucun aucune aujourd auquel aussi autre autres avaient avais
avait avant avec avez aviez avions avoir avons ayant beaucoup bien cela celle
celles celui cependant certain certaine certaines certains ceux chaque chez
comme comment contre dans debout dedans dehors depuis derrière dessous dessus
devant devers devra doit doivent donc dont durant elle elles encore entre
envers environ est etaient etais etait etant etc etre eu eue eues eurent eus
eusse eussent eusses eussiez eussions eut eux eûmes eût eûtes faisaient
faisais faisait faisant fais faisons faites faut furent fus fusse fussent
fusses fussiez fussions fut fûmes fût fûtes ici il ils jamais je jusqu jusque
juste la laquelle le lequel les lesquelles lesquels leur leurs lorsque lui
maintenant mais malgré me même mêmes merci mes moi moins mon même nos notre
nous nôtre nôtres on ont où par parce parmi pas pendant personne peu peut
peuvent peux plupart plus plusieurs pour pourquoi pourrai pourrais pourrait
pourras pourront pouvait précisément près puis puisque quand quant que quel
quelle quelles quels quelque quelques qui quoi quoique sans sauf selon seront
ses seulement si sien sienne siennes siens sinon soi soit sommes son sont
souvent suis suivant sur surtout ta tandis tant tellement tels tes toi ton
toujours tous tout toute toutes tres très trop tu une valeur voici voilà
volontiers vos votre vous vôtre vôtres
`.split(/\s+/).filter(Boolean));

// Liste courte de vocabulaire vulgaire/injurieux/sexuel à exclure quelle que soit
// la fréquence (non exhaustive, volontairement conservatrice pour un jeu familial).
const BLOCKLIST_SUBSTR = [
  'merde', 'putain', 'connard', 'connasse', 'salope', 'encul', 'niqu', 'foutr',
  'bordel', 'batard', 'bâtard', 'couillon', 'couille', 'chiant', 'chier',
  'pute', 'salaud', 'salopard', 'branl', 'nichon', 'penis', 'pénis', 'vagin',
  'cul', 'bite', 'zizi', 'negre', 'nègre', 'youpin', 'bougnoul', 'pd',
  'suicid', 'viol', 'meurtre', 'tuer', 'nazi', 'hitler', 'terroris'
];

const WORD_RE = /^[a-zàâäéèêëïîôöùûüçœæ]+$/;
const MIN_LEN = 4;
const MAX_LEN = 9;
const TARGET_COUNT = 6000;
const SKIP_TOP_RANKS = 120; // les mots les + fréquents sont presque tous des mots-outils

const lines = fs.readFileSync(srcPath, 'utf8').split('\n');
const seen = new Set();
const result = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const spaceIdx = line.lastIndexOf(' ');
  if (spaceIdx === -1) continue;
  const word = line.slice(0, spaceIdx).trim();
  if (i < SKIP_TOP_RANKS) continue;
  if (word.length < MIN_LEN || word.length > MAX_LEN) continue;
  if (!WORD_RE.test(word)) continue;
  if (STOPWORDS.has(word)) continue;
  if (seen.has(word)) continue;
  if (BLOCKLIST_SUBSTR.some((bad) => word.includes(bad))) continue;
  if (!isKnownWord(word)) continue;
  seen.add(word);
  result.push(word);
  if (result.length >= TARGET_COUNT) break;
}

result.sort();

const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 'words.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

console.log(`OK: ${result.length} mots écrits dans ${outPath}`);
