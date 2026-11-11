/* =========================================================================
   KONGO NA BISO — app.js
   Configuration, navigation, animations au scroll, chargement des données
   (activités CSV + équipe JSON) et formulaire d'adhésion.
   Aucune dépendance externe. Animations : transform / opacity uniquement,
   désactivées si l'utilisateur a préféré réduire les animations.
   ========================================================================= */

/* ------------------------------------------------------------ CONFIGURATION */
/** URL du backend Google Apps Script (formulaire d'adhésion). */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwl8oUjg80vxOfsodqskDtz_ef1-R1X6uEy81Pv2Ck-0p3ccmZ3bF9nEP7JBU-eeHo/exec";

/** URL de la Google Sheet publiée en CSV (colonne Facebook / colonne Instagram). */
const ACTIVITIES_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRnLmp-pFDfhUjb8aB129P4-uWx_V4I3mfC1EqT8Knlxbu1GCzqqhSoRtbatu182zqdsjQxoJIoyx5j/pub?output=csv";

/** Clé Cloudflare Turnstile — laisser vide pour désactiver. */
const TURNSTILE_SITE_KEY = "";

/** Fichier des membres. */
const MEMBERS_URL = "data/membres.json";

/** Durée du cache des activités (ms) — sessionStorage, 10 minutes. */
const ACTIVITIES_CACHE_TTL = 10 * 60 * 1000;

/* ---------------------------------------------------------------- HELPERS */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ==========================================================================
   1. EN-TÊTE : compact au scroll + menu burger accessible
   ========================================================================== */
const header = $("#site-header");
const burger = $("#burger-btn");
const nav = $("#site-nav");

let lastScrollY = -1;
function onScrollHeader() {
  const y = window.scrollY;
  if (y === lastScrollY) return;
  lastScrollY = y;
  header.classList.toggle("is-compact", y > 24);
}

function setMenu(open) {
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Fermer le menu de navigation" : "Ouvrir le menu de navigation");
  nav.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
}

burger.addEventListener("click", () => {
  setMenu(burger.getAttribute("aria-expanded") !== "true");
});

// Voile derrière le tiroir : clic pour fermer
const navBackdrop = $("#nav-backdrop");
if (navBackdrop) navBackdrop.addEventListener("click", () => setMenu(false));

// Fermeture au clic sur un lien, avec retour du focus au bouton si clavier
nav.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (link && burger.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    if (e.detail === 0) burger.focus(); // clic au clavier uniquement
  }
});

// Fermeture avec la touche Échap
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && burger.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    burger.focus();
  }
});

// Fermeture si l'on clique hors du menu
document.addEventListener("click", (e) => {
  if (burger.getAttribute("aria-expanded") !== "true") return;
  if (!nav.contains(e.target) && !burger.contains(e.target)) setMenu(false);
});

// Le menu burger n'existe qu'en mobile : on le remet à jour au redimensionnement
window.addEventListener("resize", () => {
  if (window.innerWidth >= 920) setMenu(false);
});

/* ==========================================================================
   2. SECTION ACTIVE dans la navigation
   ========================================================================== */
const navLinks = $$(".site-nav a");
const sections = navLinks
  .map((a) => document.querySelector(a.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && sections.length) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => {
          const active = a.getAttribute("href") === "#" + entry.target.id;
          if (active) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
  );
  sections.forEach((s) => spy.observe(s));
}

/* ==========================================================================
   3. APPARITION AU SCROLL (fade + slide-up 24 px, 600 ms)
   ========================================================================== */
const revealEls = $$(".reveal");
if (reduceMotion() || !("IntersectionObserver" in window)) {
  revealEls.forEach((el) => el.classList.add("is-visible"));
} else {
  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
  );
  revealEls.forEach((el) => io.observe(el));
}

/* ==========================================================================
   4. HERO : cascade au chargement + zoom + parallaxe discrète
   ========================================================================== */
function heroReady() {
  if (document.documentElement.classList.contains("is-loaded")) return;
  document.documentElement.classList.add("is-loaded");
}
function heroSchedule() {
  requestAnimationFrame(heroReady);
  // Repli : si requestAnimationFrame est suspendu (onglet en arrière-plan),
  // la cascade du hero doit quand même démarrer.
  setTimeout(heroReady, 600);
}
if (document.readyState === "complete") heroSchedule();
else window.addEventListener("load", heroSchedule);

// Parallaxe : translate vertical très léger de l'image (transform/opacity seuls)
const heroImg = $("#hero-img");
if (heroImg && "translate" in heroImg.style && !reduceMotion()) {
  let ticking = false;
  const updateParallax = () => {
    ticking = false;
    const y = window.scrollY;
    if (y > window.innerHeight * 1.2) return; // on ne bouge que dans le hero
    heroImg.style.translate = "0 " + Math.min(y * 0.05, 28) + "px";
  };
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    },
    { passive: true }
  );
}

/* ==========================================================================
   5. COMPTEUR ANIMÉ (nombre de membres de l'équipe)
   ========================================================================== */
function animateCount(el, target) {
  el.dataset.count = String(target);
  if (reduceMotion()) {
    el.textContent = String(target);
    return;
  }
  const duration = 1100;
  const start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out doux
    el.textContent = String(Math.round(target * eased));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ==========================================================================
   6. ACTIVITÉS : CSV robuste + validation des URL + cache sessionStorage
   ========================================================================== */
const ALLOWED_URL_PREFIXES = [
  "https://www.instagram.com/",
  "https://www.facebook.com/",
  "https://web.facebook.com/",
];

/** Parseur CSV (guillemets, virgules, retours chariot, champs multi-lignes). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Une URL n'est acceptée que si elle appartient aux domaines autorisés. */
function isAllowedUrl(url) {
  return ALLOWED_URL_PREFIXES.some((p) => url.startsWith(p));
}

/** Extrait le domaine lisible pour l'affichage (instagram.com, facebook.com…). */
function urlDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Icônes SVG sobres (Facebook / Instagram), jamais d'emoji. */
function platformIcon(platform) {
  if (platform === "Instagram") {
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4.5"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>';
  }
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H7.3V13h2.6v8h3.6Z"/></svg>';
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const activitiesGrid = $("#activities-grid");
const activitiesStatus = $("#activities-status");

function showActivitiesStatus(message, isError = false) {
  activitiesStatus.hidden = false;
  activitiesStatus.classList.toggle("is-error", isError);
  activitiesStatus.innerHTML = "<p>" + escapeHtml(message) + "</p>";
}

function renderActivities(items) {
  activitiesStatus.hidden = true;
  activitiesGrid.innerHTML = items
    .map((item) => {
      const platform = item.platform;
      const safeUrl = escapeHtml(item.url);
      return (
        '<article class="post-card">' +
        '<p class="post-platform">' +
        platformIcon(platform) +
        "<span>Publication " +
        platform +
        "</span></p>" +
        '<p class="post-domain">' +
        escapeHtml(urlDomain(item.url)) +
        "</p>" +
        '<a class="btn btn-primary" href="' +
        safeUrl +
        '" target="_blank" rel="noopener noreferrer">Voir la publication' +
        '<span class="visually-hidden"> sur ' +
        platform +
        " (nouvel onglet)</span></a>" +
        "</article>"
      );
    })
    .join("");
}

function activitiesFromCsv(text) {
  const rows = parseCSV(text);
  const dataRows = rows.slice(1); // on ignore l'en-tête
  const items = [];

  // Feuille lue de la fin vers le début : les publications récentes d'abord.
  for (let i = dataRows.length - 1; i >= 0; i--) {
    const cells = dataRows[i].map((c) => c.trim());
    if (!cells.some((c) => c !== "")) continue; // ligne vide

    const candidates = [
      { url: (cells[0] || "").replace(/\s+/g, ""), platform: "Facebook" },
      { url: (cells[1] || "").replace(/\s+/g, ""), platform: "Instagram" },
    ];

    candidates.forEach(({ url, platform }) => {
      if (url && isAllowedUrl(url)) items.push({ url, platform });
    });
  }
  return items;
}

async function loadActivities() {
  const cacheKey = "knb-activities-v1";

  // 1) Cache de session (courte durée)
  try {
    const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
    if (cached && Date.now() - cached.ts < ACTIVITIES_CACHE_TTL && Array.isArray(cached.items)) {
      if (cached.items.length) renderActivities(cached.items);
      else showActivitiesStatus("Aucune activité pour le moment.");
      return;
    }
  } catch {
    /* cache illisible : on repart de zéro */
  }

  // 2) Récupération du CSV réel
  try {
    const res = await fetch(ACTIVITIES_CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    const items = activitiesFromCsv(text);

    try {
      sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items }));
    } catch {
      /* stockage plein : sans conséquence */
    }

    if (items.length === 0) {
      showActivitiesStatus("Aucune activité pour le moment.");
      return;
    }
    renderActivities(items);
  } catch (err) {
    // 3) Repli : cache périmé s'il existe, sinon message de secours
    try {
      const stale = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
      if (stale && Array.isArray(stale.items) && stale.items.length) {
        renderActivities(stale.items);
        return;
      }
    } catch {
      /* ignoré */
    }
    showActivitiesStatus(
      "Impossible de charger les publications pour le moment. Réessayez plus tard ou consultez nos réseaux sociaux depuis la section Contact.",
      true
    );
  }
}

/* ==========================================================================
   7. ÉQUIPE : data/membres.json avec état de chargement et message de secours
   ========================================================================== */
const teamGrid = $("#team-grid");
const teamStatus = $("#team-status");

function renderMembers(members) {
  teamStatus.hidden = true;
  teamGrid.innerHTML = members
    .map((m, i) => {
      const featured = i === 0 ? " is-featured" : "";
      const src = escapeHtml(m.photo).replace(/\.jpg$/i, ".webp");
      const fallback = escapeHtml(m.photo);
      const alt = "Portrait de " + escapeHtml(m.nom) + " — " + escapeHtml(m.role);
      // Badge spécial Président : icône étoile, marine + bleu ciel
      const badge =
        i === 0
          ? '<span class="pres-badge" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="#00a8e8"><path d="M12 2.5l2.85 6.1 6.65.95-4.8 4.66 1.13 6.64L12 17.77 6.17 20.85 7.3 14.21 2.5 9.55l6.65-.95L12 2.5z"/></svg></span>'
          : "";
      return (
        '<article class="member-card' +
        featured +
        '">' +
        '<span class="member-photo-wrap">' +
        "<picture>" +
        '<source srcset="' +
        src +
        '" type="image/webp">' +
        '<img src="' +
        fallback +
        '" alt="' +
        alt +
        '" width="480" height="480" loading="lazy" decoding="async">' +
        "</picture>" +
        badge +
        "</span>" +
        '<h3 class="member-name">' +
        escapeHtml(m.nom) +
        "</h3>" +
        '<p class="member-role">' +
        escapeHtml(m.role) +
        "</p>" +
        "</article>"
      );
    })
    .join("");

  const count = members.length;
  const countEl = $("#team-count");
  if (countEl) {
    if ("IntersectionObserver" in window) {
      const co = new IntersectionObserver(
        (entries, obs) => {
          if (entries.some((e) => e.isIntersecting)) {
            animateCount(countEl, count);
            obs.disconnect();
          }
        },
        { threshold: 0.5 }
      );
      co.observe(countEl);
    } else {
      countEl.textContent = String(count);
    }
  }
}

async function loadMembers() {
  try {
    const res = await fetch(MEMBERS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const members = (Array.isArray(data) ? data : data.membres || [])
      .filter((m) => m && m.visible !== false)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));

    if (!members.length) throw new Error("liste vide");
    renderMembers(members);
  } catch (err) {
    teamGrid.innerHTML = "";
    teamStatus.hidden = false;
    teamStatus.classList.add("is-error");
    teamStatus.innerHTML =
      "<p>L'équipe n'a pas pu être chargée. Vous pouvez nous contacter directement : " +
      '<a href="mailto:kongonabiso01@gmail.com">kongonabiso01@gmail.com</a> ou +243 975 835 730.</p>';
  }
}

/* ==========================================================================
   8. FORMULAIRE D'ADHÉSION
   ========================================================================== */
const form = $("#adhesion-form");
const formStatus = $("#form-status");
const formSuccess = $("#form-success");
const submitBtn = $("#submit-btn");
const formLoadedAt = Date.now(); // « t » : horodatage au chargement (anti-robot)

let isSending = false; // protection anti-double-envoi
let turnstileToken = "";

const PHONE_RE = /^(?:\+243\d{9}|0\d{9}|\+[1-9]\d{7,14})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const NAME_RE = /^[\p{L}][\p{L}\s'’\-]{1,80}$/u;

function setFieldError(input, message) {
  const errorEl = document.getElementById("e-" + input.id.replace("f-", ""));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (errorEl) errorEl.textContent = message || "";
}

function validateField(input) {
  const value = (input.value || "").trim();
  let message = "";

  switch (input.id) {
    case "f-nom":
    case "f-postnom":
    case "f-prenom":
      if (!value) message = "Ce champ est obligatoire.";
      else if (!NAME_RE.test(value)) message = "Lettres uniquement (2 caractères minimum).";
      break;
    case "f-sexe":
      if (value !== "M" && value !== "F") message = "Veuillez choisir votre sexe.";
      break;
    case "f-telephone": {
      const cleaned = value.replace(/[\s.\-()]/g, "");
      if (!cleaned) message = "Ce champ est obligatoire.";
      else if (!PHONE_RE.test(cleaned))
        message = "Numéro invalide : +243XXXXXXXXX, 0XXXXXXXXX ou + international.";
      break;
    }
    case "f-email":
      if (value && !EMAIL_RE.test(value)) message = "Adresse email invalide.";
      break;
    case "f-adresse":
      if (!value) message = "Ce champ est obligatoire.";
      break;
    case "f-type":
      if (value !== "Actif" && value !== "Passif") message = "Veuillez choisir un type de membre.";
      break;
    case "f-consentement":
      if (!input.checked) message = "Votre accord est obligatoire pour adhérer.";
      break;
    default:
      break;
  }

  setFieldError(input, message);
  return !message;
}

function showFormStatus(message, type) {
  formStatus.hidden = false;
  formStatus.className = "form-status is-" + type;
  formStatus.textContent = message;
}

function hideFormStatus() {
  formStatus.hidden = true;
  formStatus.textContent = "";
}

// Validation à la sortie d'un champ (dès que l'erreur existe déjà)
$$(".field input, .field select, #f-consentement").forEach((input) => {
  input.addEventListener("blur", () => {
    if (input.getAttribute("aria-invalid") === "true") validateField(input);
  });
  input.addEventListener("change", () => {
    if (input.getAttribute("aria-invalid") === "true") validateField(input);
  });
});

/* ------------------------------------------------- Cloudflare Turnstile ---- */
async function setupTurnstile() {
  if (!TURNSTILE_SITE_KEY) return; // désactivé par défaut
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  }).catch(() => null);

  if (!window.turnstile) return;
  const slot = $("#turnstile-slot");
  if (!slot) return;
  const widgetId = window.turnstile.render(slot, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: (token) => {
      turnstileToken = token;
    },
    "expired-callback": () => {
      turnstileToken = "";
    },
  });
  form.dataset.turnstileWidget = String(widgetId);
}

/* --------------------------------------------------------- Envoi ---------- */
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isSending) return; // anti-double-envoi
  hideFormStatus();

  // Champ piège : si rempli, on fait semblant d'avoir réussi, sans rien envoyer.
  if ($("#f-website").value) {
    form.hidden = true;
    formSuccess.hidden = false;
    return;
  }

  const fields = [
    "#f-nom",
    "#f-postnom",
    "#f-prenom",
    "#f-sexe",
    "#f-telephone",
    "#f-email",
    "#f-adresse",
    "#f-type",
    "#f-consentement",
  ].map((s) => $(s));

  const results = fields.map(validateField);
  if (results.includes(false)) {
    const firstInvalid = fields.find((f) => f.getAttribute("aria-invalid") === "true");
    showFormStatus("Veuillez corriger les champs signalés ci-dessous.", "error");
    if (firstInvalid) firstInvalid.focus();
    return;
  }

  const payload = {
    nom: $("#f-nom").value.trim(),
    postnom: $("#f-postnom").value.trim(),
    prenom: $("#f-prenom").value.trim(),
    sexe: $("#f-sexe").value,
    telephone: $("#f-telephone").value.replace(/[\s.\-()]/g, ""),
    email: $("#f-email").value.trim(),
    adresse: $("#f-adresse").value.trim(),
    type_membre: $("#f-type").value,
    consentement: "oui",
    website: "",
    t: formLoadedAt,
    turnstile: turnstileToken || "",
  };

  isSending = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Envoi en cours…";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      // text/plain : évite la requête CORS préliminaire
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const data = await res.json().catch(() => null);

    if (data && data.ok) {
      form.hidden = true;
      formSuccess.hidden = false;
      formSuccess.focus?.();
      formSuccess.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "center" });
      return;
    }

    showFormStatus(
      (data && data.error) ||
        "L'envoi a échoué. Vérifiez votre connexion et réessayez dans un instant.",
      "error"
    );
  } catch (err) {
    showFormStatus(
      "Erreur de connexion : votre adhésion n'a pas été envoyée. Vérifiez votre réseau puis réessayez.",
      "error"
    );
  } finally {
    isSending = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Envoyer mon adhésion";
  }
});

/* ==========================================================================
   9. GALERIES EN DÉFILEMENT CONTINU + MACHINE À ÉCRIRE
   ========================================================================== */
function initMarquees() {
  if (reduceMotion()) return; // prefers-reduced-motion : défilement manuel (CSS)

  $$("[data-marquee]").forEach((marquee) => {
    const track = $(".marquee-track", marquee);
    if (!track || track.dataset.cloned === "1") return;

    // Duplication des figures pour une boucle sans couture
    Array.from(track.children).forEach((node) => {
      const clone = node.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      $$("img", clone).forEach((img) => {
        img.alt = "";
        img.loading = "lazy";
      });
      track.appendChild(clone);
    });
    track.dataset.cloned = "1";

    // Dès que la galerie approche, on charge toutes ses images d'un bloc
    // (évite qu'un visuel apparaisse en cours de défilement)
    if ("IntersectionObserver" in window) {
      const eager = new IntersectionObserver(
        (entries, obs) => {
          if (entries.some((e) => e.isIntersecting)) {
            $$("img", track).forEach((img) => {
              img.loading = "eager";
            });
            obs.disconnect();
          }
        },
        { rootMargin: "500px" }
      );
      eager.observe(marquee);
    }

    // Durée proportionnelle à la largeur (~45 px/s, doux et lisible)
    const halfWidth = track.scrollWidth / 2;
    marquee.style.setProperty("--marquee-dur", Math.max(24, Math.round(halfWidth / 45)) + "s");
    marquee.classList.add("is-running");

    // Bouton « Arrêter / Reprendre » (accessibilité : permettre l'arrêt)
    const tools = marquee.parentElement && marquee.parentElement.querySelector("[data-marquee-toggle]");
    if (tools) {
      tools.addEventListener("click", () => {
        const paused = marquee.classList.toggle("is-paused");
        tools.setAttribute("aria-pressed", String(paused));
        tools.textContent = paused ? "Reprendre le défilement" : "Arrêter le défilement";
      });
    }
  });
}

function initTypewriter() {
  const el = $("[data-typewriter]");
  if (!el) return;
  if (reduceMotion() || !("IntersectionObserver" in window)) return; // texte déjà affiché

  const io = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();

        const full = el.textContent;
        el.style.minHeight = el.offsetHeight + "px"; // on réserve la hauteur : pas de saut
        el.textContent = "";

        const caret = document.createElement("span");
        caret.className = "caret";
        caret.setAttribute("aria-hidden", "true");
        el.appendChild(caret);

        let i = 0;
        const tick = () => {
          if (i >= full.length) {
            caret.remove();
            el.style.minHeight = "";
            return;
          }
          caret.insertAdjacentText("beforebegin", full.charAt(i++));
          setTimeout(tick, 26); // ~26 ms par caractère
        };
        tick();
      });
    },
    { threshold: 0.4 }
  );
  io.observe(el);
}

/* ==========================================================================
   10. DÉMARRAGE
   ========================================================================== */
loadActivities();
loadMembers();
setupTurnstile();
initMarquees();
initTypewriter();

// Défilement doux sur les ancres (désactivé si prefers-reduced-motion)
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    if (history.pushState) history.pushState(null, "", id);
    // met à jour le focus pour les lecteurs d'écran
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
});

// Compactage du header au scroll (rAF pour ne pas surcharger)
let headerTicking = false;
window.addEventListener(
  "scroll",
  () => {
    if (!headerTicking) {
      headerTicking = true;
      requestAnimationFrame(() => {
        onScrollHeader();
        headerTicking = false;
      });
    }
  },
  { passive: true }
);
onScrollHeader();
