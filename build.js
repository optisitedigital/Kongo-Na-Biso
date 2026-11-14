/* ==========================================================================
   KONGO NA BISO — build.js
   Fabrique le dossier "dist" prêt à être publié (aucune dépendance, Node 16+).

   Ce script :
   1. copie le site dans dist/ ;
   2. remplace les adresses du bloc CONFIG de index.html par les variables
      d'environnement de l'hébergeur (si elles sont définies) ;
   3. ajoute une politique de sécurité (CSP) qui n'autorise que ce dont le site a besoin ;
   4. crée un fichier _headers (pour les hébergeurs qui le lisent).

   IMPORTANT : ces variables sont des adresses PUBLIQUES (elles finissent visibles
   dans le navigateur). Aucun mot de passe, aucune clé secrète ne doit être mis ici.

   Variables reconnues (toutes facultatives) :
     APPS_SCRIPT_URL      adresse du Web App Google Apps Script (se termine par /exec)
     ACTIVITIES_CSV_URL   adresse de la Google Sheet des activités publiée en CSV
     TURNSTILE_SITE_KEY   clé publique Cloudflare Turnstile
     DISABLE_CSP=1        désactive la politique de sécurité (dépannage seulement)
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const SKIP_ROOT = new Set(['dist', 'node_modules', 'build.js', 'package.json', 'package-lock.json', 'README.md', 'render.yaml']);

const VARS = {
  APPS_SCRIPT_URL: /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/,
  ACTIVITIES_CSV_URL: /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/[\w-]+\/pub\?[\w=&.-]*output=csv[\w=&.-]*$/,
  TURNSTILE_SITE_KEY: /^[\w-]{8,64}$/
};

function fail(msg) {
  console.error('\nERREUR : ' + msg + '\n');
  process.exit(1);
}

/* 1. Dossier dist propre, puis copie du site */
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

function copyDir(src, dest, isRoot) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (isRoot && (SKIP_ROOT.has(entry.name) || entry.name.startsWith('.'))) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyDir(from, to, false);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}
copyDir(ROOT, DIST, true);

const indexPath = path.join(DIST, 'index.html');
if (!fs.existsSync(indexPath)) fail('index.html est introuvable à la racine du dépôt.');
let html = fs.readFileSync(indexPath, 'utf8');

/* 2. Variables d'environnement -> bloc CONFIG */
const injected = [];
for (const name of Object.keys(VARS)) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') continue;
  const value = raw.trim();
  if (!VARS[name].test(value)) fail('La variable ' + name + ' a un format invalide. Vérifiez sa valeur dans les paramètres de l\'hébergeur.');
  const re = new RegExp("(\\b" + name + ":\\s*')[^']*(')");
  if (!re.test(html)) fail('Emplacement "' + name + '" introuvable dans le bloc CONFIG de index.html.');
  html = html.replace(re, (m, before, after) => before + value + after);
  injected.push(name);
}

/* 3. Politique de sécurité (CSP) avec empreintes des scripts intégrés */
let cspInfo = 'désactivée';
if (!process.env.DISABLE_CSP) {
  const hashes = [];
  html.replace(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi, (m, code) => {
    hashes.push("'sha256-" + crypto.createHash('sha256').update(code, 'utf8').digest('base64') + "'");
    return m;
  });
  const turnstile = /\bTURNSTILE_SITE_KEY:\s*'[^']+'/.test(html);
  const cf = turnstile ? ' https://challenges.cloudflare.com' : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self' " + hashes.join(' ') + cf,
    "style-src 'self' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self' https://script.google.com https://docs.google.com https://*.googleusercontent.com" + cf,
    "frame-src " + (turnstile ? 'https://challenges.cloudflare.com' : "'none'"),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  const before = html;
  html = html.replace(/<meta charset="UTF-8">/i, (m) => m + '\n  <meta http-equiv="Content-Security-Policy" content="' + csp + '">');
  if (html === before) fail('Balise <meta charset="UTF-8"> introuvable : impossible d\'ajouter la politique de sécurité.');
  cspInfo = 'activée (' + hashes.length + ' scripts autorisés)';
}

fs.writeFileSync(indexPath, html);

/* 4. En-têtes de sécurité (lus par Cloudflare Pages / Netlify ; sur Render, les saisir dans le tableau de bord) */
fs.writeFileSync(path.join(DIST, '_headers'), [
  '/*',
  '  X-Content-Type-Options: nosniff',
  '  X-Frame-Options: DENY',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=()',
  ''
].join('\n'));

console.log('Build terminé : dossier "dist" prêt.');
console.log('Variables appliquées : ' + (injected.length ? injected.join(', ') : 'aucune (valeurs par défaut de index.html)'));
console.log('Politique de sécurité (CSP) : ' + cspInfo);
