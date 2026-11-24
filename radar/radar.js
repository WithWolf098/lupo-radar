"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Radar = exports.cleTriee = exports.MOTS_DECOUVERTE = void 0;
exports.motsDuTitre = motsDuTitre;
exports.calculerIndicateurs = calculerIndicateurs;
exports.estimerPercer = estimerPercer;
exports.estimerBots = estimerBots;
exports.scoreTheme = scoreTheme;
exports.fusionnerThemes = fusionnerThemes;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_crypto_1 = require("node:crypto");
const node_sqlite_1 = require("node:sqlite");
const node_util_1 = require("node:util");
const zlib = __importStar(require("node:zlib"));
const radarPartage_1 = require("./radarPartage");
/**
 * Radar Roblox : relève les jeux publics de Roblox toutes les 30 minutes (seulement quand Lupo est ouvert),
 * garde l'historique dans une petite base SQLite locale et calcule des indicateurs (croissance, élan, pic, concurrence).
 * API publiques sans clé, non documentées par Roblox (elles peuvent changer) : chaque étape échoue sans tout arrêter.
 * Aucune dépendance à Electron : testable avec Node seul.
 */
const MIN = 60_000;
const HEURE = 60 * MIN;
const JOUR = 24 * HEURE;
const INTERVALLE = 30 * MIN;
const DECOUVERTE_TOUS = 6 * HEURE;
const VOTES_TOUS = 6 * HEURE;
const MAX_SUIVIS = 5000;
/** Relevés minimum pour qu'une journée compte (Lupo n'est pas ouvert toute la journée). */
const RELEVES_PAR_JOUR = 4;
/** Relevés gardés tels quels ; au-delà, résumés par jour (médiane, max). */
const JOURS_DETAILLES = 11;
/** Alertes des favoris : paliers (× joueurs de l'ajout), base comptée au moins 20 joueurs, une alerte par favori toutes les 6 h au plus. */
const PALIERS = [1.5, 2, 3, 5, 10];
const BASE_MIN = 20;
const ALERTE_ECART = 6 * HEURE;
/** Un « succès » : un jeu vu à 1 000 joueurs ou plus, ou qui a passé 10 M de visites. */
const SUCCES_JOUEURS = 1000;
const SUCCES_VISITES = 10_000_000;
/** Studios à succès (2 succès ou plus) dont on lit la liste de jeux toutes les 6 h, même sans favori. */
const CREATEURS_AUTO = 150;
const CREATEURS_TOUS = 6 * HEURE;
/** Un thème : au moins 3 jeux suivis et 50 joueurs. */
const THEME_JEUX_MIN = 3;
const THEME_JOUEURS_MIN = 50;
/** Récap « Depuis ta dernière visite » : après 3 h sans Lupo ouvert. */
const ABSENCE_RECAP = 3 * HEURE;
const ENTETES = { 'User-Agent': 'Lupo', Accept: 'application/json' };
/** Mots cherchés dans Roblox pour découvrir des jeux (genres, mécaniques, thèmes courants). */
exports.MOTS_DECOUVERTE = [
    'obby',
    'tycoon',
    'simulator',
    'tower defense',
    'rng',
    'steal',
    'grow',
    'escape',
    'survive',
    'horror',
    'anime',
    'ragdoll',
    'brainrot',
    'pet',
    'fishing',
    'mining',
    'farm',
    'clicker',
    'incremental',
    'battlegrounds',
    'pvp',
    'parkour',
    'racing',
    'car',
    'restaurant',
    'merge',
    'hatch',
    'troll',
    'tsunami',
    'zombie',
    'roleplay',
    'school',
    'prison',
    'hide and seek',
    'tag',
    'dodge',
    'sword',
    'gun',
    'shooter',
    'survival',
    'island',
    'lava',
    'flood',
    'slap',
    'punch',
    'throw',
    'break',
    'build',
    'craft',
    'dungeon',
    'rpg',
    'idle',
    'cooking',
    'cleaning',
    'fight',
    'catch',
    'collect',
    'evolution',
    'ball',
    'soccer',
    'basketball',
    'sniper',
    'spin',
    'gamble',
    'garden',
    'creature',
    'monster',
    'dragon',
    'cat',
    'dog',
    'river',
    'boat',
    'train',
    'plane',
    'climb',
    'jump',
    'run',
    'speed',
    'strongest',
    'war',
];
const TRIS = ['top-trending', 'up-and-coming', 'top-playing-now', 'top-revisited', 'fun-with-friends'];
const PAYS = ['all', 'us', 'br', 'ph', 'id', 'gb', 'fr', 'de', 'mx'];
const APPAREILS = ['computer', 'high_end_phone'];
const MOTS_VIDES = new Set(('the and for with from your you our are was not but all any can get got has have into its new now off one out over than that ' +
    'this too two use who why how what when where will just more most very very only also game games roblox update upd beta alpha ' +
    'release released test testing edition version free best event mode official classic remake remastered part chapter season ' +
    'down up day days time times them they their his her him she its ever been were bro').split(' '));
// ---------- Outils ----------
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ceder = () => new Promise((ok) => setImmediate(ok));
/** Espace les appels vers un même service (Roblox bloque les rafales). */
class Cadence {
    ecart;
    prochain = 0;
    constructor(ecart) {
        this.ecart = ecart;
    }
    async tour() {
        const maintenant = Date.now();
        const t = Math.max(maintenant, this.prochain);
        this.prochain = t + this.ecart;
        if (t > maintenant)
            await attendre(t - maintenant);
    }
}
class ErreurHttp extends Error {
    code;
    constructor(code) {
        super(`Roblox a répondu ${code}`);
        this.code = code;
    }
}
async function lireJson(url, cadence, arret) {
    for (let essai = 0;; essai++) {
        await cadence.tour();
        if (arret())
            throw new Error('arrêté');
        const r = await fetch(url, { headers: ENTETES, signal: AbortSignal.timeout(20_000) }).catch(() => null);
        if (r?.ok)
            return (await r.json());
        // Trop de demandes ou panne passagère : on attend un peu, une seule fois.
        if (essai === 0 && (!r || r.status === 429 || r.status >= 500)) {
            await attendre(r?.status === 429 ? 30_000 : 5_000);
            continue;
        }
        throw r ? new ErreurHttp(r.status) : new Error('Roblox ne répond pas (connexion ?)');
    }
}
/** Jour local (nombre de jours depuis 1970 à minuit, heure du PC). */
function jourDe(t) {
    return Math.floor((t - new Date(t).getTimezoneOffset() * MIN) / JOUR);
}
function debutJour(jour) {
    const approx = jour * JOUR;
    return approx + new Date(approx).getTimezoneOffset() * MIN;
}
function mediane(v) {
    const s = [...v].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const moyenne = (v) => v.reduce((a, b) => a + b, 0) / v.length;
/** Mots qui disent de quoi parle un titre (sans emojis, sans « [UPDATE] », sans mots vides, pluriel simple retiré). */
function motsDuTitre(nom) {
    const propre = nom
        .toLowerCase()
        .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, ' ');
    const mots = [];
    for (let m of propre.split(' ')) {
        if (m.length < 3 || /^\d+$/.test(m) || MOTS_VIDES.has(m))
            continue;
        if (m.length > 4 && m.endsWith('s') && !m.endsWith('ss'))
            m = m.slice(0, -1);
        if (!mots.includes(m))
            mots.push(m);
    }
    return mots;
}
/**
 * Indicateurs d'un jeu à partir de ses relevés des 11 derniers jours.
 * Journées complètes seulement (aujourd'hui exclu : à moitié relevé, sa médiane dépendrait des heures où Lupo était ouvert).
 * Médiane par jour = insensible aux pics d'une heure (pub, bots).
 */
function calculerIndicateurs(rel, cree, visites, maintenant) {
    const parJour = new Map();
    for (const r of rel) {
        const j = jourDe(r.t);
        let l = parJour.get(j);
        if (!l)
            parJour.set(j, (l = []));
        l.push(r.joueurs);
    }
    const auj = jourDe(maintenant);
    const valides = [...parJour]
        .filter(([j, l]) => j < auj && l.length >= RELEVES_PAR_JOUR)
        .map(([jour, l]) => ({ jour, med: mediane(l), max: Math.max(...l) }))
        .sort((a, b) => a.jour - b.jour);
    // Croissance : jours −3 à −1 contre jours −10 à −4.
    const recents = valides.filter((v) => v.jour >= auj - 3).map((v) => v.med);
    const anciens = valides.filter((v) => v.jour >= auj - 10 && v.jour <= auj - 4).map((v) => v.med);
    const base = anciens.length >= 2 ? moyenne(anciens) : 0;
    const croissance = recents.length >= 2 && base >= 3 ? (moyenne(recents) / base - 1) * 100 : null;
    const recente = recents.length >= 2 ? moyenne(recents) : null;
    const ancienne = anciens.length >= 2 ? base : null;
    // Pente : régression de ln(médiane) sur les 7 derniers jours complets.
    const sept = valides.filter((v) => v.jour >= auj - 7 && v.med > 0);
    let pente = null;
    if (sept.length >= 4) {
        const xs = sept.map((v) => v.jour);
        const ys = sept.map((v) => Math.log(v.med));
        const mx = moyenne(xs);
        const my = moyenne(ys);
        let num = 0;
        let den = 0;
        for (let i = 0; i < xs.length; i++) {
            num += (xs[i] - mx) * (ys[i] - my);
            den += (xs[i] - mx) ** 2;
        }
        if (den > 0)
            pente = (Math.exp(num / den) - 1) * 100;
    }
    // Jours de hausse de suite (au moins +2 % par jour, jours qui se suivent).
    let joursHausse = 0;
    for (let i = valides.length - 1; i > 0; i--) {
        const a = valides[i];
        const p = valides[i - 1];
        if (a.jour - p.jour !== 1 || a.med <= p.med * 1.02)
            break;
        joursHausse++;
    }
    const dernier = valides.at(-1);
    const pic = dernier && dernier.med > 0 ? dernier.max / dernier.med : null;
    // Élan : visites par heure sur les 6 dernières heures ÷ moyenne depuis la création.
    let elan = null;
    let rythme = null;
    const fenetre = rel.filter((r) => r.t >= maintenant - 6 * HEURE && r.visites > 0);
    if (fenetre.length >= 2) {
        const a = fenetre[0];
        const b = fenetre.at(-1);
        const duree = b.t - a.t;
        if (duree >= 25 * MIN)
            rythme = Math.max(0, b.visites - a.visites) / (duree / HEURE);
        const ageH = cree ? (maintenant - cree) / HEURE : 0;
        if (rythme !== null && cree && ageH >= 6 && visites > 0)
            elan = rythme / (visites / ageH);
    }
    // Joueurs 24 h plus tôt (même heure de la journée : le creux de la nuit ne fausse pas la comparaison).
    let j24 = null;
    const fin = rel.at(-1);
    if (fin && maintenant - fin.t < 2 * HEURE) {
        const cible = fin.t - JOUR;
        let mieux = null;
        for (const r of rel)
            if (Math.abs(r.t - cible) <= 90 * MIN && (!mieux || Math.abs(r.t - cible) < Math.abs(mieux.t - cible)))
                mieux = r;
        if (mieux)
            j24 = mieux.joueurs;
    }
    return { joursValides: valides.length, croissance, pente, joursHausse, elan, pic, recente, ancienne, j24, rythme };
}
const sigmoide = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));
/**
 * « Va percer ? » : barème de points (recherche du 2026-11-22), base 3 %, plafonné à 35 %.
 * Null tant qu'il n'y a pas 3 jours complets de relevés (« trop tôt »). Raisons = codes traduits par l'interface.
 */
function estimerPercer(ind, f, maintenant) {
    if (ind.joursValides < 3)
        return null;
    let score = 0;
    const raisons = [];
    const ajouter = (pts, code) => {
        score += pts;
        raisons.push(`${code}:${pts > 0 ? '+' : ''}${pts}`);
    };
    if (ind.croissance !== null) {
        if (ind.croissance > 50)
            ajouter(3, 'croissance');
        else if (ind.croissance > 10)
            ajouter(1, 'croissance');
        else if (ind.croissance < -10)
            ajouter(-2, 'baisse');
    }
    if (ind.pic !== null && ind.pic > 2.5)
        ajouter(-1, 'pic');
    else if (ind.joursHausse >= 2)
        ajouter(2, 'regulier');
    const votes = f.haut + f.bas;
    const likes = votes ? (100 * f.haut) / votes : null;
    if (likes !== null && votes >= 500 && likes >= 85)
        ajouter(2, 'likes');
    else if (likes !== null && votes >= 100 && likes < 70)
        ajouter(-3, 'likesBas');
    if (f.visites > 1000 && f.favoris / f.visites > f.favorisMedian)
        ajouter(1, 'favoris');
    if (f.maj && maintenant - f.maj < 14 * JOUR)
        ajouter(1, 'majRecente');
    else if (f.maj && maintenant - f.maj > 30 * JOUR)
        ajouter(-2, 'majVieille');
    if (f.createurASucces)
        ajouter(2, 'createur');
    if (ind.elan !== null && ind.elan > 1.5)
        ajouter(1, 'elan');
    const p = sigmoide(logit(0.03) + 0.35 * score) * 100;
    return { p: Math.min(35, Math.max(1, p)), raisons };
}
/**
 * « Pic de bots / artificiel ? » : points par signal suspect (0-30 faible, 30-60 suspect, > 60 probable).
 * Un jeu vu en pub sponsorisée : score divisé par 2 (ses joueurs viennent de la pub, pas forcément de bots).
 */
function estimerBots(rel, f, maintenant) {
    let p = 0;
    const raisons = [];
    const ajouter = (pts, code) => {
        p += pts;
        raisons.push(code);
    };
    // Courbe plate sur 48 h (pas de creux la nuit) : de vrais joueurs vont dormir.
    const recents = rel.filter((r) => r.t >= maintenant - 2 * JOUR);
    if (recents.length >= 20 && recents.at(-1).t - recents[0].t >= 20 * HEURE) {
        const v = recents.map((r) => r.joueurs);
        const m = moyenne(v);
        const ecart = Math.sqrt(moyenne(v.map((x) => (x - m) ** 2)));
        if (m > 50 && ecart / m < 0.1)
            ajouter(25, 'plat');
    }
    if (f.joueurs > 100 && f.visites > 10_000 && (f.haut + f.bas) / f.visites < f.votesSeuil)
        ajouter(20, 'votes');
    // Marche d'escalier : ×3 d'un relevé à l'autre, puis ça reste.
    for (let i = 1; i + 1 < rel.length; i++) {
        const a = rel[i - 1];
        const b = rel[i];
        const c = rel[i + 1];
        if (b.t - a.t <= 45 * MIN && a.joueurs >= 30 && b.joueurs >= 3 * a.joueurs && Math.abs(c.joueurs - b.joueurs) <= 0.2 * b.joueurs) {
            ajouter(15, 'escalier');
            break;
        }
    }
    if (f.cree && maintenant - f.cree < 14 * JOUR && f.joueurs > 1000)
        ajouter(15, 'jeuneGros');
    if (f.visites > 10_000 && f.favoris / f.visites < f.favorisSeuil)
        ajouter(10, 'favoris');
    // Chute brutale d'un relevé à l'autre (purge de bots, fin de pub).
    const [avant, dernier] = rel.slice(-2);
    if (avant && dernier && avant.joueurs >= 100 && dernier.joueurs < 0.2 * avant.joueurs)
        ajouter(10, 'chute');
    if (f.createurInconnu && f.cree && maintenant - f.cree < 30 * JOUR && f.joueurs > 500)
        ajouter(5, 'inconnu');
    if (f.sponsorise) {
        p /= 2;
        raisons.push('pub');
    }
    return { p: Math.min(100, p), raisons };
}
/** Pour classer les thèmes qui montent : croissance 7 j, sinon 24 h, sinon élan (×1,5 ≈ +50 %). */
function scoreTheme(th) {
    return th.croissance7 ?? th.croissance24 ?? (th.elan !== null ? (th.elan - 1) * 100 : -1000);
}
/** Clé d'un thème aux mots triés (« steal brainrot » = « brainrot steal »). */
const cleTriee = (cle) => cle.split(' ').sort().join(' ');
exports.cleTriee = cleTriee;
/**
 * Un mot presque toujours suivi du même autre (« defense » → « tower defense ») : on garde seulement les deux mots.
 * Un mot en favori (`proteges`) reste.
 */
function motsRedondants(themes, proteges) {
    const parCle = new Map(themes.map((a) => [a.cle, a]));
    const redondants = new Set();
    for (const a of themes) {
        const mots = a.cle.split(' ');
        if (mots.length < 2)
            continue;
        for (const m of mots) {
            const u = parCle.get(m);
            if (u && a.jeux >= 0.9 * u.jeux && !proteges.has(m))
                redondants.add(m);
        }
    }
    return redondants;
}
/** Part des joueurs d'un thème qui doivent jouer aux jeux d'un autre pour qu'on les fonde. */
const FUSION_THEMES = 0.7;
/** …et le petit thème doit peser au moins ça du gros : sinon c'est une niche dans un mot large (« bakso » dans « tower »). */
const FUSION_PART_MIN = 0.2;
/**
 * Fond les thèmes portés surtout par les mêmes jeux, pour ne pas montrer deux fois la même vague (« letter » = les jeux
 * « Thai … Letters » → rattaché à « thai »). En partant du plus gros : un thème dont au moins 70 % des joueurs jouent à des
 * jeux d'un thème déjà gardé y est rattaché (`aussi`), s'il pèse au moins 20 % de ce thème (sinon c'est une niche dans un
 * mot large : « bakso » reste à côté de « tower » ; essais du 2026-11-23 sur la vraie base). Si les mots de l'un sont dans ceux de l'autre (« hatcher divine » /
 * « hatcher »), il faut en plus que le petit pèse 70 % du gros (sinon c'est un vrai sous-genre et les deux restent), et
 * c'est alors le plus précis qui reste (« tower defense » plutôt que « defense »).
 * `poids` = joueurs du thème, `ids` = jeu → ses joueurs (mêmes chiffres que `poids`).
 * `proteges` (clés aux mots triés, voir `cleTriee`) : thèmes en favori, jamais rattachés à un autre ni remplacés par un plus précis.
 */
function fusionnerThemes(themes, proteges = new Set()) {
    const gardes = [];
    const parJeu = new Map(); // jeu → thèmes gardés qui le contiennent
    // Un mot passe juste après la paire de mots qui le porte (« defense » après « tower defense »), pour pouvoir y être rattaché.
    const paires = new Map(); // mot → joueurs de sa plus grosse paire
    for (const b of themes)
        for (const m of b.cle.includes(' ') ? b.cle.split(' ') : [])
            paires.set(m, Math.max(paires.get(m) ?? 0, b.poids));
    const rang = (x) => {
        const p = x.cle.includes(' ') ? 0 : (paires.get(x.cle) ?? 0);
        return p >= FUSION_THEMES * x.poids ? Math.min(p, x.poids) : x.poids;
    };
    const ordre = [...themes].sort((x, y) => rang(y) - rang(x) || y.cle.split(' ').length - x.cle.split(' ').length);
    for (const a of ordre) {
        const communs = new Map();
        for (const [id, j] of a.ids)
            for (const k of parJeu.get(id) ?? [])
                communs.set(k, (communs.get(k) ?? 0) + j);
        const motsA = a.cle.split(' ');
        let cible = -1;
        let meilleur = 0;
        let lie = false;
        // Thème en favori : toujours montré tel quel (il peut en revanche accueillir les autres).
        if (!proteges.has((0, exports.cleTriee)(a.cle)))
            for (const [k, c] of communs) {
                const b = gardes[k];
                const motsB = b.cle.split(' ');
                const lies = motsA.every((m) => motsB.includes(m)) || motsB.every((m) => motsA.includes(m));
                const part = c / Math.max(1, a.poids);
                if (part < FUSION_THEMES || a.poids < (lies ? FUSION_THEMES : FUSION_PART_MIN) * b.poids)
                    continue;
                // Un thème aux mots liés passe avant (« defense » va dans « tower defense », pas dans « tower »).
                if ((lies && !lie) || (lies === lie && part > meilleur))
                    [meilleur, cible, lie] = [part, k, lies];
            }
        if (cible >= 0) {
            const b = gardes[cible];
            // Le plus précis prend la place (avec ses propres chiffres, pour que la fiche montre les mêmes jeux).
            if (lie && motsA.length > b.cle.split(' ').length && !proteges.has((0, exports.cleTriee)(b.cle)))
                gardes[cible] = { ...a, aussi: [...b.aussi, b.libelle] };
            else
                b.aussi.push(a.libelle);
            continue;
        }
        for (const id of a.ids.keys()) {
            const l = parJeu.get(id);
            if (l)
                l.push(gardes.length);
            else
                parJeu.set(id, [gardes.length]);
        }
        gardes.push({ ...a, aussi: [] });
    }
    return gardes;
}
class Radar {
    dossier;
    signaler;
    journal;
    alerter;
    recapper;
    db;
    etat = { actif: true, enCours: null, jeuxSuivis: 0, jeuxConnus: 0 };
    minuterie = null;
    arrete = false;
    enMarche = false;
    /** Le dernier relevé suit une absence de plus de 24 h : pas d'alerte ce tour-ci. */
    apresTrou = false;
    c = {
        jeux: new Cadence(1200),
        votes: new Cadence(700),
        images: new Cadence(1000),
        recherche: new Cadence(600),
        tris: new Cadence(1500),
        createurs: new Cadence(1000),
    };
    /** Données changées (relevé, calcul, studios) : thèmes et studios recalculés à la prochaine demande. */
    version = 0;
    cacheThemes = null;
    cacheCreateurs = null;
    /** Nouveaux jeux des studios suivis : annoncés avec les autres alertes, après le relevé. */
    alertesCreateurs = [];
    /** Adresse des données partagées (null = tout relever soi-même, comme le serveur). */
    serveur = radarPartage_1.SERVEUR_RADAR;
    /** Vrai = pas de relevé automatique toutes les 30 min (le serveur appelle `cycle()` lui-même). */
    manuel = false;
    /** Dernière fois que Lupo était ouvert (lu au démarrage) : récap au premier relevé si c'est loin. */
    absentDepuis = null;
    /** Jeux de l'utilisateur (projets reliés à un jeu Roblox) : suivis de près, avec leurs alertes (concurrent devant, thème qui monte). */
    mesJeux = () => [];
    constructor(dossier, signaler = () => { }, journal = () => { }, alerter = () => { }, recapper = () => { }) {
        this.dossier = dossier;
        this.signaler = signaler;
        this.journal = journal;
        this.alerter = alerter;
        this.recapper = recapper;
        fs.mkdirSync(dossier, { recursive: true });
        this.db = new node_sqlite_1.DatabaseSync(path.join(dossier, 'radar.db'));
        this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS jeux (
        id INTEGER PRIMARY KEY, place INTEGER, nom TEXT, createur TEXT, createurId INTEGER, createurType TEXT, genre TEXT,
        cree INTEGER, maj INTEGER, visites INTEGER, favoris INTEGER, haut INTEGER, bas INTEGER, joueurs INTEGER, vu INTEGER,
        decouvert INTEGER, source TEXT, suivi INTEGER DEFAULT 1, sponsor INTEGER, icone TEXT, iconeLe INTEGER, votesLe INTEGER,
        semblables INTEGER, partN1 REAL, semblablesListe TEXT, semblablesLe INTEGER,
        joursValides INTEGER, croissance REAL, pente REAL, joursHausse INTEGER, elan REAL, pic REAL
      );
      CREATE INDEX IF NOT EXISTS jeux_suivi ON jeux(suivi);
      CREATE TABLE IF NOT EXISTS releves (jeu INTEGER NOT NULL, t INTEGER NOT NULL, joueurs INTEGER, visites INTEGER);
      CREATE INDEX IF NOT EXISTS releves_jeu ON releves(jeu, t);
      CREATE TABLE IF NOT EXISTS jours (jeu INTEGER, jour INTEGER, mediane REAL, max INTEGER, n INTEGER, PRIMARY KEY (jeu, jour));
      CREATE TABLE IF NOT EXISTS meta (cle TEXT PRIMARY KEY, valeur TEXT);
      CREATE TABLE IF NOT EXISTS favoris (
        type TEXT NOT NULL, cle TEXT NOT NULL, ajoute INTEGER, base REAL, palier REAL DEFAULT 0, precedent REAL,
        hausseVue INTEGER DEFAULT 0, alerteLe INTEGER, PRIMARY KEY (type, cle)
      );
      CREATE TABLE IF NOT EXISTS alertes (t INTEGER, type TEXT, cle TEXT, nom TEXT, sorte TEXT, ratio REAL, joueurs INTEGER);
      CREATE TABLE IF NOT EXISTS createurs (cle TEXT PRIMARY KEY, verifieLe INTEGER);
      CREATE TABLE IF NOT EXISTS mesjeux (id INTEGER PRIMARY KEY, nom TEXT, devant TEXT, alertes TEXT);
      CREATE INDEX IF NOT EXISTS jeux_createur ON jeux(createurId);
    `);
        // Colonnes ajoutées après la première version de la base.
        const colonnes = [
            ['jeux', 'percer REAL'],
            ['jeux', 'percerRaisons TEXT'],
            ['jeux', 'bots REAL'],
            ['jeux', 'botsRaisons TEXT'],
            ['jeux', 'record INTEGER'],
            ['jeux', 'recente REAL'],
            ['jeux', 'ancienne REAL'],
            ['jeux', 'j24 REAL'],
            ['jeux', 'rythme REAL'],
            ['favoris', 'nom TEXT'],
            ['favoris', 'ids TEXT'],
            ['alertes', 'jeu INTEGER'],
            ['alertes', 'auteur TEXT'],
        ];
        for (const [table, col] of colonnes) {
            try {
                this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${col}`);
            }
            catch {
                /* déjà là */
            }
        }
        // Record de joueurs de chaque jeu (succès des studios) : rempli une fois depuis l'historique.
        if (!this.meta('recordLe')) {
            this.db.exec(`UPDATE jeux SET record = MAX(COALESCE(joueurs, 0),
        COALESCE((SELECT MAX(joueurs) FROM releves WHERE jeu = jeux.id), 0),
        COALESCE((SELECT MAX(max) FROM jours WHERE jeu = jeux.id), 0))`);
            this.ecrireMeta('recordLe', Date.now());
        }
        this.etat.actif = this.meta('pause') !== '1';
        const p = Number(this.meta('premierReleve'));
        if (p)
            this.etat.premierReleve = p;
        const d = Number(this.meta('dernierReleve'));
        if (d)
            this.etat.dernierReleve = d;
        const s = Number(this.meta('serveurLe'));
        if (s)
            this.etat.serveurLe = s;
        this.absentDepuis = Number(this.meta('ouvertLe')) || null;
        this.ecrireMeta('ouvertLe', Date.now());
        this.compter();
    }
    // ----- Petits accès à la base -----
    meta(cle) {
        const r = this.db.prepare('SELECT valeur FROM meta WHERE cle = ?').get(cle);
        return r?.valeur;
    }
    ecrireMeta(cle, valeur) {
        this.db.prepare('INSERT INTO meta (cle, valeur) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET valeur = excluded.valeur').run(cle, String(valeur));
    }
    transaction(f) {
        this.db.exec('BEGIN');
        try {
            f();
            this.db.exec('COMMIT');
        }
        catch (e) {
            this.db.exec('ROLLBACK');
            throw e;
        }
    }
    compter() {
        const r = this.db.prepare('SELECT COUNT(*) AS n, SUM(suivi = 1) AS s FROM jeux').get();
        this.etat.jeuxConnus = r.n;
        this.etat.jeuxSuivis = r.s ?? 0;
    }
    publier(changement = {}) {
        Object.assign(this.etat, changement);
        this.signaler({ ...this.etat });
    }
    // ----- Démarrage, arrêt, pause -----
    /** Premier relevé peu après l'ouverture de Lupo, puis toutes les 30 minutes. */
    demarrer(delai = 20_000) {
        this.arrete = false;
        this.planifier(delai);
    }
    arreter() {
        this.arrete = true;
        if (this.minuterie)
            clearTimeout(this.minuterie);
        this.minuterie = null;
        try {
            this.ecrireMeta('ouvertLe', Date.now());
            this.db.close();
        }
        catch {
            /* déjà fermée */
        }
    }
    lireEtat() {
        return { ...this.etat };
    }
    mettreEnPause(pause) {
        this.ecrireMeta('pause', pause ? '1' : '0');
        this.publier({ actif: !pause });
        if (!pause && !this.enMarche)
            this.planifier(1000);
        return this.lireEtat();
    }
    /** Relevé tout de suite (bouton « Relever maintenant »). */
    releverMaintenant() {
        if (this.enMarche)
            return;
        this.planifier(0);
    }
    planifier(delai) {
        if (this.arrete || this.manuel)
            return;
        if (this.minuterie)
            clearTimeout(this.minuterie);
        this.minuterie = setTimeout(() => void this.cycle(), delai);
        this.publier({ prochainReleve: Date.now() + delai });
    }
    // ----- Un cycle complet -----
    async cycle() {
        if (this.enMarche || this.arrete)
            return;
        if (!this.etat.actif)
            return this.planifier(INTERVALLE);
        this.enMarche = true;
        const debut = Date.now();
        const erreurs = [];
        const etape = async (nom, f) => {
            if (this.arrete)
                return;
            this.compter();
            this.publier({ enCours: nom, avance: 0 });
            try {
                await f();
            }
            catch (e) {
                const m = e.message;
                if (m === 'arrêté')
                    return;
                erreurs.push(`${nom} : ${m}`);
                this.journal(`Radar, ${nom} : ${m}`);
            }
        };
        // Données du serveur Lupo : s'il a relevé il y a moins de 75 min, on ne relève soi-même que ce qu'il ne suit pas
        // (favoris, thèmes et studios suivis, jeux trouvés ici). Serveur injoignable : tout est relevé ici, comme avant.
        let partage = false;
        if (this.serveur) {
            this.publier({ enCours: 'Données partagées', avance: 0 });
            try {
                partage = await this.importerServeur();
            }
            catch (e) {
                this.journal(`Radar, données partagées : ${e.message}`);
            }
        }
        const maintenant = Date.now();
        // Premier relevé après une absence de 3 h ou plus : récap au lieu des notifications d’alertes (pas sur le serveur, sans adresse de partage).
        const absence = this.serveur !== null && this.absentDepuis && maintenant - this.absentDepuis >= ABSENCE_RECAP ? this.absentDepuis : null;
        this.absentDepuis = null;
        let alertesAbsence = [];
        if (maintenant - Number(this.meta('decouverteLe') ?? 0) >= DECOUVERTE_TOUS)
            await etape('Recherche de nouveaux jeux', async () => {
                await this.decouvrir(partage);
                this.ecrireMeta('decouverteLe', maintenant);
            });
        await etape('Nouveaux jeux des studios', () => this.verifierCreateurs(!partage && maintenant - Number(this.meta('createursLe') ?? 0) >= CREATEURS_TOUS));
        await etape('Tes jeux et leurs concurrents', () => this.suivreMesJeux());
        await etape('Relevé des joueurs', () => this.relever(partage));
        if (!partage && maintenant - Number(this.meta('votesLe') ?? 0) >= VOTES_TOUS)
            await etape('Lecture des votes', async () => {
                await this.lireVotes();
                this.ecrireMeta('votesLe', maintenant);
            });
        await etape('Calcul des tendances', () => this.calculer());
        await etape('Vérification des favoris', async () => {
            const a = [...this.alertesCreateurs, ...this.verifierFavoris()];
            this.alertesCreateurs = [];
            if (absence)
                alertesAbsence = a;
            else if (a.length)
                this.alerter(a);
            // Ton propre jeu : prévenu même au retour d'une absence (le récap ne parle que des favoris).
            const miens = this.verifierMesJeux();
            if (miens.length)
                this.alerter(miens);
        });
        await etape('Icônes', () => this.lireIcones());
        if (absence)
            await etape('Récap de ton absence', async () => {
                const r = this.calculerRecap(absence, alertesAbsence);
                this.ecrireMeta('recap', JSON.stringify(r));
                if (r.favoris.length || r.studios.length || r.jeunes.length || r.nouveaux.length || r.gros.length || r.themes.length)
                    this.recapper(r);
            });
        // Jeux semblables : 3 recherches par jeu, faites par le serveur quand il est là (moins de demandes à Roblox par Lupo).
        if (!partage)
            await etape('Recherche des jeux semblables', () => this.chercherSemblables());
        if (maintenant - Number(this.meta('maintenanceLe') ?? 0) >= JOUR)
            await etape('Rangement de l’historique', async () => {
                this.ranger();
                this.ecrireMeta('maintenanceLe', maintenant);
            });
        this.enMarche = false;
        if (this.arrete)
            return;
        this.compter();
        this.publier({ enCours: null, avance: undefined, erreur: erreurs.length ? erreurs.join(' · ') : undefined });
        if (this.serveur !== null)
            this.ecrireMeta('ouvertLe', Date.now());
        this.planifier(Math.max(5 * MIN, debut + INTERVALLE - Date.now()));
    }
    stop = () => this.arrete;
    // ----- Découverte -----
    /** Ajoute (ou met à jour) des jeux vus dans un classement ou une recherche. */
    ajouterVus(jeux, source) {
        const t = Date.now();
        const st = this.db.prepare(`
      INSERT INTO jeux (id, place, nom, joueurs, haut, bas, genre, decouvert, source, suivi, sponsor, record)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nom = excluded.nom, place = excluded.place, record = MAX(COALESCE(record, 0), COALESCE(excluded.record, 0)),
        haut = COALESCE(excluded.haut, haut), bas = COALESCE(excluded.bas, bas),
        genre = COALESCE(excluded.genre, genre),
        sponsor = COALESCE(excluded.sponsor, sponsor),
        suivi = CASE WHEN suivi = 0 AND excluded.joueurs >= 100 THEN 1 ELSE suivi END`);
        this.transaction(() => {
            for (const j of jeux) {
                if (!j.universeId || !j.name)
                    continue;
                const joueurs = j.playerCount ?? 0;
                st.run(j.universeId, j.rootPlaceId ?? 0, j.name, joueurs, j.totalUpVotes ?? null, j.totalDownVotes ?? null, j.genreL1 ?? null, t, source, joueurs >= 20 ? 1 : 0, j.isSponsored ? t : null, joueurs);
            }
        });
    }
    /** `themesSeulement` : le serveur fait déjà classements et recherches courantes, il reste les thèmes en favori. */
    async decouvrir(themesSeulement = false) {
        const session = (0, node_crypto_1.randomUUID)();
        const combinaisons = themesSeulement ? [] : TRIS.flatMap((tri) => PAYS.flatMap((pays) => APPAREILS.map((app) => ({ tri, pays, app }))));
        const courants = themesSeulement ? [] : exports.MOTS_DECOUVERTE;
        let total = combinaisons.length + courants.length;
        let fait = 0;
        for (const { tri, pays, app } of combinaisons) {
            const u = `https://apis.roblox.com/explore-api/v1/get-sort-content?sessionId=${session}&sortId=${tri}&device=${app}&country=${pays}`;
            try {
                const r = await lireJson(u, this.c.tris, this.stop);
                this.ajouterVus(r.games ?? [], `classement:${tri}`);
            }
            catch (e) {
                if (e.message === 'arrêté')
                    throw e;
            }
            this.publier({ avance: ++fait / total });
        }
        // Thèmes en favori : cherchés aussi, pour trouver leurs nouveaux jeux.
        const themes = this.db.prepare("SELECT cle FROM favoris WHERE type = 'theme'").all().map((r) => r.cle);
        const mots = [...new Set([...courants, ...themes])];
        total += mots.length - courants.length;
        for (const mot of mots) {
            await this.rechercher(mot, 2, session, `recherche:${mot}`).catch((e) => {
                if (e.message === 'arrêté')
                    throw e;
            });
            this.publier({ avance: ++fait / total });
        }
    }
    /** Recherche Roblox (40 jeux par page) ; les jeux trouvés sont ajoutés au radar. */
    async rechercher(texte, pages, session, source) {
        const tous = [];
        let jeton = '';
        for (let p = 0; p < pages; p++) {
            const q = new URLSearchParams({ searchQuery: texte, sessionId: session, pageType: 'all' });
            if (jeton)
                q.set('pageToken', jeton);
            const r = await lireJson(`https://apis.roblox.com/search-api/omni-search?${q}`, this.c.recherche, this.stop);
            for (const g of r.searchResults ?? [])
                if (g.contentGroupType === 'Game')
                    tous.push(...(g.contents ?? []));
            jeton = r.nextPageToken ?? '';
            if (!jeton)
                break;
        }
        this.ajouterVus(tous, source);
        return tous;
    }
    // ----- Relevé -----
    /** `partage` : seulement les jeux suivis que le serveur n'a pas relevés depuis 40 min (le reste vient de lui). */
    async relever(partage = false) {
        const t = Date.now();
        const ids = (partage
            ? this.db.prepare('SELECT id FROM jeux WHERE suivi = 1 AND (vu IS NULL OR vu < ?)').all(t - 40 * MIN)
            : this.db
                .prepare(`SELECT id FROM jeux WHERE suivi = 1
               UNION ALL SELECT id FROM (SELECT id FROM jeux WHERE suivi = 0 AND (vu IS NULL OR vu < ?) ORDER BY vu LIMIT 800)`)
                .all(t - JOUR)).map((r) => r.id);
        const maj = this.db.prepare(`
      UPDATE jeux SET nom = ?, place = ?, createur = ?, createurId = ?, createurType = ?, genre = COALESCE(?, genre),
        cree = ?, maj = ?, visites = ?, favoris = ?, joueurs = ?, record = MAX(COALESCE(record, 0), ?), vu = ? WHERE id = ?`);
        const releve = this.db.prepare('INSERT INTO releves (jeu, t, joueurs, visites) VALUES (?, ?, ?, ?)');
        const disparu = this.db.prepare('UPDATE jeux SET suivi = 0, vu = ? WHERE id = ?');
        const avant = Number(this.meta('dernierReleve') ?? 0);
        // Trou de plus de 24 h dans nos relevés : pas d'alerte ce tour-ci (avec le serveur, pas de trou dans les données).
        this.apresTrou = !partage && !!avant && t - avant > JOUR;
        for (let i = 0; i < ids.length; i += 50) {
            const lot = ids.slice(i, i + 50);
            const r = await lireJson(`https://games.roblox.com/v1/games?universeIds=${lot.join(',')}`, this.c.jeux, this.stop);
            const recus = new Set();
            this.transaction(() => {
                for (const g of r.data ?? []) {
                    recus.add(g.id);
                    const joueurs = g.playing ?? 0;
                    maj.run(g.name, g.rootPlaceId, g.creator?.name ?? '', g.creator?.id ?? null, g.creator?.type ?? null, g.genre_l1 ?? null, g.created ? Date.parse(g.created) : null, g.updated ? Date.parse(g.updated) : null, g.visits ?? 0, g.favoritedCount ?? 0, joueurs, joueurs, t, g.id);
                    releve.run(g.id, t, joueurs, g.visits ?? 0);
                }
                for (const id of lot)
                    if (!recus.has(id))
                        disparu.run(t, id); // jeu privé ou supprimé
            });
            this.publier({ avance: Math.min(1, (i + 50) / ids.length) });
        }
        if (!this.meta('premierReleve')) {
            this.ecrireMeta('premierReleve', t);
            this.etat.premierReleve = t;
        }
        this.ecrireMeta('dernierReleve', Date.now());
        this.etat.dernierReleve = Date.now();
        this.trier(t);
        this.version++;
    }
    /** Qui suivre toutes les 30 minutes : jeunes, gros ou en train de monter. Les autres sont relevés une fois par jour. */
    trier(t) {
        this.transaction(() => {
            // Morts ou vieux petits jeux : plus suivis de près.
            this.db.prepare('UPDATE jeux SET suivi = 0 WHERE suivi = 1 AND joueurs < 10 AND cree < ?').run(t - 14 * JOUR);
            this.db.prepare('UPDATE jeux SET suivi = 0 WHERE suivi = 1 AND joueurs < 2000 AND cree < ?').run(t - 365 * JOUR);
            // Ça remonte : suivi à nouveau.
            this.db.prepare('UPDATE jeux SET suivi = 1 WHERE suivi = 0 AND joueurs >= 100 AND (cree > ? OR joueurs >= 5000)').run(t - 120 * JOUR);
            // Trop de jeux suivis : on garde les plus jeunes et les plus gros.
            const n = this.db.prepare('SELECT COUNT(*) AS n FROM jeux WHERE suivi = 1').get().n;
            if (n > MAX_SUIVIS)
                this.db
                    .prepare(`UPDATE jeux SET suivi = 0 WHERE id IN (
               SELECT id FROM jeux WHERE suivi = 1 AND joueurs < 5000 ORDER BY (cree > ?) ASC, joueurs ASC LIMIT ?)`)
                    .run(t - 60 * JOUR, n - MAX_SUIVIS);
            // Favoris : toujours suivis de près.
            this.db.prepare("UPDATE jeux SET suivi = 1 WHERE suivi = 0 AND id IN (SELECT CAST(cle AS INTEGER) FROM favoris WHERE type = 'jeu')").run();
        });
    }
    async lireVotes() {
        const ids = this.db.prepare('SELECT id FROM jeux WHERE suivi = 1').all().map((r) => r.id);
        const st = this.db.prepare('UPDATE jeux SET haut = ?, bas = ?, votesLe = ? WHERE id = ?');
        for (let i = 0; i < ids.length; i += 50) {
            const r = await lireJson(`https://games.roblox.com/v1/games/votes?universeIds=${ids.slice(i, i + 50).join(',')}`, this.c.votes, this.stop);
            const t = Date.now();
            this.transaction(() => {
                for (const v of r.data ?? [])
                    st.run(v.upVotes, v.downVotes, t, v.id);
            });
            this.publier({ avance: Math.min(1, (i + 50) / ids.length) });
        }
    }
    async lireIcones() {
        const ids = this.db
            .prepare('SELECT id FROM jeux WHERE suivi = 1 AND (iconeLe IS NULL OR iconeLe < ?) ORDER BY iconeLe IS NOT NULL, cree DESC LIMIT 3000')
            .all(Date.now() - 7 * JOUR).map((r) => r.id);
        const st = this.db.prepare('UPDATE jeux SET icone = ?, iconeLe = ? WHERE id = ?');
        for (let i = 0; i < ids.length; i += 50) {
            const r = await lireJson(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${ids.slice(i, i + 50).join(',')}&size=150x150&format=Png&isCircular=false`, this.c.images, this.stop);
            const t = Date.now();
            this.transaction(() => {
                for (const im of r.data ?? [])
                    if (im.state === 'Completed' && im.imageUrl?.startsWith('https://'))
                        st.run(im.imageUrl, t, im.targetId);
            });
            this.publier({ avance: Math.min(1, (i + 50) / ids.length) });
        }
    }
    // ----- Calcul -----
    async calculer() {
        const maintenant = Date.now();
        const jeux = this.db.prepare('SELECT id, cree, maj, visites, favoris, haut, bas, joueurs, sponsor, createurId FROM jeux WHERE suivi = 1').all();
        // Repères communs : favoris / visites médian, jeux connus de chaque créateur.
        const grands = jeux.filter((j) => (j.visites ?? 0) > 10_000);
        const ratios = grands.map((j) => (j.favoris ?? 0) / (j.visites ?? 1));
        const votes = grands.filter((j) => j.haut !== null).map((j) => ((j.haut ?? 0) + (j.bas ?? 0)) / (j.visites ?? 1));
        const centile = (v, p, defaut) => (v.length >= 200 ? [...v].sort((a, b) => a - b)[Math.floor(p * (v.length - 1))] : defaut);
        const favorisMedian = centile(ratios, 0.5, 0.006);
        const favorisSeuil = centile(ratios, 0.02, 0.0006);
        const votesSeuil = centile(votes, 0.02, 0.0001);
        const parCreateur = new Map();
        for (const r of this.db.prepare('SELECT createurId, joueurs FROM jeux WHERE createurId IS NOT NULL').all()) {
            let l = parCreateur.get(r.createurId);
            if (!l)
                parCreateur.set(r.createurId, (l = []));
            l.push(r.joueurs ?? 0);
        }
        const lire = this.db.prepare('SELECT t, joueurs, visites FROM releves WHERE jeu = ? AND t >= ? ORDER BY t');
        const ecrire = this.db.prepare(`UPDATE jeux SET joursValides = ?, croissance = ?, pente = ?, joursHausse = ?, elan = ?, pic = ?,
         percer = ?, percerRaisons = ?, bots = ?, botsRaisons = ?, recente = ?, ancienne = ?, j24 = ?, rythme = ? WHERE id = ?`);
        for (let i = 0; i < jeux.length; i += 40) {
            this.transaction(() => {
                for (const j of jeux.slice(i, i + 40)) {
                    const rel = lire.all(j.id, maintenant - JOURS_DETAILLES * JOUR);
                    const ind = calculerIndicateurs(rel, j.cree, j.visites ?? 0, maintenant);
                    const autres = j.createurId ? (parCreateur.get(j.createurId) ?? []) : [];
                    const fiche = {
                        joueurs: j.joueurs ?? 0,
                        visites: j.visites ?? 0,
                        favoris: j.favoris ?? 0,
                        haut: j.haut ?? 0,
                        bas: j.bas ?? 0,
                        cree: j.cree,
                        maj: j.maj,
                        sponsorise: (j.sponsor ?? 0) > maintenant - 7 * JOUR,
                        // Un autre jeu du créateur à 10 000 joueurs (le jeu lui-même ne compte pas).
                        createurASucces: autres.filter((x) => x >= 10_000).length - ((j.joueurs ?? 0) >= 10_000 ? 1 : 0) > 0,
                        createurInconnu: autres.length <= 1,
                        favorisMedian,
                        votesSeuil,
                        favorisSeuil,
                    };
                    const percer = estimerPercer(ind, fiche, maintenant);
                    const bots = estimerBots(rel, fiche, maintenant);
                    ecrire.run(ind.joursValides, ind.croissance, ind.pente, ind.joursHausse, ind.elan, ind.pic, percer?.p ?? null, percer ? percer.raisons.join(' ') : null, bots.p, bots.raisons.join(' '), ind.recente, ind.ancienne, ind.j24, ind.rythme, j.id);
                }
            });
            this.publier({ avance: Math.min(1, (i + 40) / jeux.length) });
            await ceder(); // SQLite bloque : on laisse respirer l'interface entre deux paquets
            if (this.arrete)
                return;
        }
        this.version++;
    }
    // ----- Concurrence -----
    async chercherSemblables() {
        const t = Date.now();
        const jeux = this.db
            .prepare(`SELECT id, nom FROM jeux WHERE suivi = 1 AND cree > ? AND joueurs BETWEEN 30 AND 100000 AND (semblablesLe IS NULL OR semblablesLe < ?)
         ORDER BY semblablesLe IS NOT NULL, semblablesLe, joueurs BETWEEN 100 AND 20000 DESC, cree DESC LIMIT 120`)
            .all(t - 180 * JOUR, t - JOUR);
        const session = (0, node_crypto_1.randomUUID)();
        let fait = 0;
        for (const j of jeux) {
            await this.semblablesDe(j, session);
            this.publier({ avance: ++fait / jeux.length });
        }
    }
    /** Jeux semblables d'un jeu (3 pages de recherche sur les mots de son titre), rangés dans sa ligne. */
    async semblablesDe(j, session) {
        const st = this.db.prepare('UPDATE jeux SET semblables = ?, partN1 = ?, semblablesListe = ?, semblablesLe = ? WHERE id = ?');
        const mots = motsDuTitre(j.nom);
        if (!mots.length) {
            st.run(null, null, null, Date.now(), j.id);
            return;
        }
        const trouves = await this.rechercher(mots.slice(0, 4).join(' '), 3, session, 'semblables');
        const vus = new Set([j.id]);
        const semblables = [];
        for (const g of trouves) {
            if (!g.universeId || !g.name || vus.has(g.universeId))
                continue;
            vus.add(g.universeId);
            const autres = motsDuTitre(g.name);
            if (autres.some((m) => mots.includes(m)))
                semblables.push({ id: g.universeId, placeId: g.rootPlaceId ?? 0, nom: g.name, joueurs: g.playerCount ?? 0 });
        }
        const moi = this.db.prepare('SELECT joueurs FROM jeux WHERE id = ?').get(j.id)?.joueurs ?? 0;
        const tous = [moi, ...semblables.map((s) => s.joueurs)];
        const somme = tous.reduce((a, b) => a + b, 0);
        semblables.sort((a, b) => b.joueurs - a.joueurs);
        st.run(semblables.length, somme > 0 ? Math.max(...tous) / somme : null, JSON.stringify(semblables.slice(0, 12)), Date.now(), j.id);
    }
    // ----- Tes jeux (projets reliés) -----
    /** Concurrents directs d'un de tes jeux : ses jeux semblables (même mot dans le titre), du plus gros au plus petit. */
    concurrentsDe(id) {
        const r = this.db.prepare('SELECT semblablesListe FROM jeux WHERE id = ?').get(id);
        try {
            return r?.semblablesListe ? JSON.parse(r.semblablesListe).map((s) => s.id) : [];
        }
        catch {
            return [];
        }
    }
    /**
     * Avant chaque relevé : tes jeux (et leurs concurrents) rejoignent les jeux suivis de près, même petits ou vieux ;
     * leurs jeux semblables sont recherchés une fois par jour. Un jeu délié de son projet n'est plus surveillé.
     */
    async suivreMesJeux() {
        const miens = this.mesJeux().filter((j) => Number.isSafeInteger(j.id) && j.id > 0);
        const t = Date.now();
        const ids = miens.map((j) => j.id);
        this.transaction(() => {
            if (ids.length)
                this.db.prepare(`DELETE FROM mesjeux WHERE id NOT IN (${ids.map(() => '?').join(',')})`).run(...ids);
            else
                this.db.exec('DELETE FROM mesjeux');
            const ajout = this.db.prepare('INSERT INTO mesjeux (id, nom) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET nom = excluded.nom');
            const jeu = this.db.prepare(`INSERT INTO jeux (id, nom, decouvert, source, suivi) VALUES (?, ?, ?, 'mien', 1)
        ON CONFLICT(id) DO UPDATE SET suivi = 1`);
            for (const j of miens) {
                ajout.run(j.id, j.nom);
                jeu.run(j.id, j.nom, t);
            }
        });
        if (!miens.length)
            return;
        const session = (0, node_crypto_1.randomUUID)();
        for (const j of miens) {
            const r = this.db.prepare('SELECT nom, semblablesLe FROM jeux WHERE id = ?').get(j.id);
            if (!r?.semblablesLe || r.semblablesLe < t - JOUR) {
                await this.semblablesDe({ id: j.id, nom: r?.nom || j.nom }, session).catch((e) => {
                    if (e.message === 'arrêté')
                        throw e;
                    this.journal(`Radar, concurrents de « ${j.nom} » : ${e.message}`);
                });
            }
            const concurrents = this.concurrentsDe(j.id);
            if (concurrents.length)
                this.db.prepare(`UPDATE jeux SET suivi = 1 WHERE suivi = 0 AND id IN (${concurrents.map(() => '?').join(',')})`).run(...concurrents);
        }
    }
    /**
     * Après chaque relevé, pour chacun de tes jeux :
     * - un concurrent direct passe devant (il était sous 90 % de tes joueurs, il est maintenant au-dessus de 110 %) ;
     * - un thème de ton titre monte de 40 % ou plus sur 7 jours.
     * Une alerte par concurrent ou par thème tous les 7 jours au plus ; rien juste après un trou de plus de 24 h ni si les alertes sont coupées.
     */
    verifierMesJeux() {
        const miens = this.db.prepare('SELECT id, nom, devant, alertes FROM mesjeux').all();
        if (!miens.length)
            return [];
        const t = Date.now();
        const { actives } = this.reglagesAlertes();
        const prevenir = actives && !this.apresTrou;
        const jeuDe = this.db.prepare('SELECT nom, joueurs, vu, bots FROM jeux WHERE id = ?');
        const maj = this.db.prepare('UPDATE mesjeux SET devant = ?, alertes = ? WHERE id = ?');
        const noter = this.db.prepare('INSERT INTO alertes (t, type, cle, nom, sorte, ratio, joueurs, jeu, auteur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        const lire = (texte, defaut) => {
            try {
                return texte ? JSON.parse(texte) : defaut;
            }
            catch {
                return defaut;
            }
        };
        let themes = null;
        const nouvelles = [];
        this.transaction(() => {
            for (const m of miens) {
                const moi = jeuDe.get(m.id);
                if (!moi?.vu || moi.vu < t - 2 * HEURE)
                    continue; // pas encore relevé (ou jeu privé)
                const nom = moi.nom || m.nom || String(m.id);
                const mesJoueurs = moi.joueurs ?? 0;
                const dejaVu = m.devant !== null; // premier passage : on note qui est devant, sans prévenir
                const devant = new Set(lire(m.devant, []));
                const alertes = lire(m.alertes, {});
                const libre = (cle) => prevenir && t - (alertes[cle] ?? 0) >= 7 * JOUR;
                const alerter = (a, cle) => {
                    alertes[cle] = t;
                    noter.run(a.t, a.type, a.cle, a.nom, a.sorte, a.ratio, a.joueurs, a.jeu ?? null, a.auteur ?? null);
                    nouvelles.push(a);
                };
                // Concurrents directs : hystérésis 90 % / 110 % pour ne pas prévenir à chaque petit va-et-vient.
                for (const id of this.concurrentsDe(m.id)) {
                    const c = jeuDe.get(id);
                    if (!c?.vu || c.vu < t - 2 * HEURE || (c.bots ?? 0) > 60)
                        continue;
                    const j = c.joueurs ?? 0;
                    if (j < 0.9 * mesJoueurs)
                        devant.delete(id);
                    else if (j > 1.1 * mesJoueurs && !devant.has(id)) {
                        devant.add(id);
                        // Ton jeu doit avoir un peu de monde, et le concurrent au moins 20 joueurs : sinon ce n'est que du bruit.
                        if (dejaVu && mesJoueurs >= 5 && j >= 20 && libre(`d:${id}`))
                            alerter({ t, type: 'mien', cle: String(m.id), nom, sorte: 'depasse', ratio: j / Math.max(1, mesJoueurs), joueurs: j, jeu: id, auteur: c.nom ?? String(id) }, `d:${id}`);
                    }
                }
                // Thèmes de ton titre qui montent (le plus fort seulement, pour ne pas prévenir deux fois pour « tower » et « tower defense »).
                const mots = motsDuTitre(nom);
                if (mots.length) {
                    themes ??= this.themes();
                    const monte = themes
                        .filter((th) => th.croissance7 !== null && th.croissance7 >= 40 && th.joueurs >= 200 && th.partN1 < 0.95)
                        .filter((th) => th.cle.split(' ').every((w) => mots.includes(w)))
                        .sort((a, b) => (b.croissance7 ?? 0) - (a.croissance7 ?? 0))[0];
                    const cle = monte ? `t:${(0, exports.cleTriee)(monte.cle)}` : '';
                    if (monte && libre(cle))
                        alerter({ t, type: 'mien', cle: String(m.id), nom, sorte: 'themeMonte', ratio: monte.croissance7 ?? 0, joueurs: monte.joueurs, auteur: monte.cle }, cle);
                }
                maj.run(JSON.stringify([...devant]), JSON.stringify(alertes), m.id);
            }
        });
        return nouvelles;
    }
    // ----- Données partagées (serveur Lupo) -----
    /**
     * Télécharge ce qui manque depuis le serveur (sa base complète la première fois ou après 2 jours d'absence, sinon les lots)
     * et le fusionne ici. Vrai = le serveur a relevé il y a moins de 75 min.
     */
    async importerServeur() {
        const demander = (nom) => fetch(`${this.serveur}/${nom}`, {
            headers: { 'User-Agent': 'Lupo' },
            signal: AbortSignal.timeout(nom.startsWith('etat.json') ? 20_000 : 600_000),
        }).catch(() => null);
        const lire = async (nom) => {
            let r = await demander(nom);
            // Coupure passagère ou GitHub lent : une seconde chance 10 s plus tard avant d'avertir.
            if ((!r || r.status >= 500) && !this.arrete) {
                await new Promise((ok) => setTimeout(ok, 10_000));
                r = await demander(nom);
            }
            if (!r?.ok)
                throw new Error(r ? `le serveur a répondu ${r.status} (${nom})` : 'serveur injoignable (connexion ?)');
            return Buffer.from(await r.arrayBuffer());
        };
        const e = JSON.parse((await lire('etat.json')).toString('utf8'));
        if (e?.v !== 1 || !Array.isArray(e.lots))
            return false;
        let jusqua = Number(this.meta('serveurJusqua') ?? 0);
        const lots = e.lots.filter((l) => l.jusqua > jusqua).sort((a, b) => a.jusqua - b.jusqua);
        const fichiers = [];
        // Base complète : rien d'importé encore, ou un trou entre notre dernier import et le plus vieux lot gardé.
        if (e.base && e.base.jusqua > jusqua && (!jusqua || !lots.length || lots[0].depuis > jusqua))
            fichiers.push({ nom: e.base.fichier, jusqua: e.base.jusqua });
        const apresBase = fichiers[0]?.jusqua ?? jusqua;
        for (const l of lots)
            if (l.jusqua > apresBase)
                fichiers.push({ nom: l.fichier, jusqua: l.jusqua });
        const temp = path.join(this.dossier, 'serveur.db');
        const limite = debutJour(jourDe(Date.now()) - JOURS_DETAILLES + 1);
        for (let i = 0; i < fichiers.length; i++) {
            const f = fichiers[i];
            const brut = await lire(f.nom);
            if (this.arrete)
                return false;
            fs.writeFileSync(temp, f.nom.endsWith('.gz') ? await (0, node_util_1.promisify)(zlib.gunzip)(brut) : brut);
            try {
                const r = await (0, radarPartage_1.fusionner)(this.db, temp, limite);
                if (r.premier && (!this.etat.premierReleve || r.premier < this.etat.premierReleve)) {
                    this.ecrireMeta('premierReleve', r.premier);
                    this.etat.premierReleve = r.premier;
                }
            }
            finally {
                fs.rmSync(temp, { force: true });
            }
            jusqua = f.jusqua;
            this.ecrireMeta('serveurJusqua', jusqua);
            this.version++;
            this.publier({ avance: (i + 1) / fichiers.length });
        }
        if (e.maj) {
            this.ecrireMeta('serveurLe', e.maj);
            this.publier({ serveurLe: e.maj });
        }
        return !!e.maj && Date.now() - e.maj < 75 * MIN && jusqua >= e.maj;
    }
    /** Serveur : ce qui a changé depuis `depuis`, dans une nouvelle base `fichier`. */
    exporterLot(fichier, depuis) {
        (0, radarPartage_1.exporterLot)(this.db, fichier, depuis, jourDe(Date.now()) - JOURS_DETAILLES - 2);
    }
    /** Serveur : copie compacte de toute la base (pour les Lupo qui n'ont rien). */
    copierBase(fichier) {
        fs.rmSync(fichier, { force: true });
        this.db.prepare('VACUUM INTO ?').run(fichier);
    }
    // ----- Récap « Depuis ta dernière visite » -----
    /** Dernier récap calculé (null s'il n'y en a jamais eu). */
    dernierRecap() {
        try {
            const r = this.meta('recap');
            return r ? JSON.parse(r) : null;
        }
        catch {
            return null;
        }
    }
    /**
     * Ce qui a bougé depuis `depuis` (dernière fois que Lupo était ouvert) : favoris (en %), nouveaux jeux des studios suivis,
     * jeunes jeux, nouveaux jeux, gros jeux et thèmes qui ont le plus monté. « Avant » = relevé le plus proche de `depuis`
     * (1 h 30 avant à 3 h après) ; un jeu sans relevé à ce moment n'est comparé que s'il est sorti depuis.
     */
    calculerRecap(depuis, alertes) {
        const t = Date.now();
        const ref = Math.max(depuis, t - (JOURS_DETAILLES - 1) * JOUR);
        const avant = new Map();
        for (const r of this.db.prepare('SELECT jeu, t, joueurs FROM releves WHERE t BETWEEN ? AND ?').all(ref - 90 * MIN, ref + 3 * HEURE)) {
            const e = Math.abs(r.t - ref);
            const v = avant.get(r.jeu);
            if (!v || e < v.e)
                avant.set(r.jeu, { j: r.joueurs, e });
        }
        const jeux = this.db.prepare('SELECT id, nom, createur, icone, cree, joueurs, bots FROM jeux WHERE vu > ?').all(t - 3 * HEURE).filter((g) => g.nom);
        const vers = (g) => ({
            id: g.id,
            nom: g.nom ?? '',
            createur: g.createur ?? '',
            ...(g.icone ? { icone: g.icone } : {}),
            cree: g.cree ?? 0,
            avant: avant.get(g.id)?.j ?? null,
            apres: g.joueurs ?? 0,
        });
        const sains = jeux.filter((g) => (g.bots ?? 0) <= 60);
        const hausse = (g) => (g.joueurs ?? 0) / Math.max(1, avant.get(g.id)?.j ?? 0) - 1;
        const jeunes = sains
            .filter((g) => g.cree && g.cree > t - 120 * JOUR && g.cree <= ref && (avant.get(g.id)?.j ?? 0) >= 30 && (g.joueurs ?? 0) >= 100 && hausse(g) >= 0.2)
            .sort((a, b) => hausse(b) - hausse(a))
            .slice(0, 10)
            .map(vers);
        const gros = sains
            .filter((g) => (avant.get(g.id)?.j ?? 0) >= 5000 && hausse(g) >= 0.05)
            .sort((a, b) => hausse(b) - hausse(a))
            .slice(0, 6)
            .map(vers);
        const nouveaux = sains
            .filter((g) => g.cree && g.cree > ref && (g.joueurs ?? 0) >= 100)
            .sort((a, b) => (b.joueurs ?? 0) - (a.joueurs ?? 0))
            .slice(0, 8)
            .map(vers);
        const parTheme = new Map();
        for (const g of sains) {
            const a = avant.get(g.id)?.j;
            const neuf = !!g.cree && g.cree > ref;
            if (a === undefined && !neuf)
                continue;
            const mots = motsDuTitre(g.nom ?? '');
            const cles = new Map(mots.map((m) => [m, m]));
            for (let i = 0; i + 1 < mots.length; i++)
                cles.set([mots[i], mots[i + 1]].sort().join(' '), `${mots[i]} ${mots[i + 1]}`);
            for (const [cle, libelle] of cles) {
                let th = parTheme.get(cle);
                if (!th)
                    parTheme.set(cle, (th = { cle, libelle, jeux: 0, avant: 0, apres: 0, top: [], ids: new Map() }));
                th.jeux++;
                th.avant += a ?? 0;
                th.apres += g.joueurs ?? 0;
                th.top.push({ j: g.joueurs ?? 0, ...(g.icone ? { icone: g.icone } : {}) });
                th.ids.set(g.id, g.joueurs ?? 0);
            }
        }
        const gardes = [...parTheme.values()].filter((th) => th.jeux >= THEME_JEUX_MIN && th.avant >= 200);
        const proteges = this.themesProteges();
        const redondants = motsRedondants(gardes, proteges);
        const themes = fusionnerThemes(gardes
            .filter((th) => !redondants.has(th.cle) && th.apres > th.avant * 1.1)
            .map((th) => ({ ...th, poids: th.apres, top: th.top.sort((a, b) => b.j - a.j) }))
            .filter((th) => th.top[0].j < 0.8 * th.apres), // pas un thème porté par un seul jeu
        proteges)
            .sort((a, b) => b.apres / b.avant - a.apres / a.avant)
            .slice(0, 8)
            .map((th) => ({
            cle: th.libelle,
            jeux: th.jeux,
            avant: th.avant,
            apres: th.apres,
            icones: th.top.slice(0, 3).flatMap((x) => (x.icone ? [x.icone] : [])),
            ...(th.aussi.length ? { aussi: th.aussi } : {}),
        }));
        // Favoris : % depuis ton départ, ×N depuis l'étoile, palier franchi.
        const favs = this.db.prepare('SELECT type, cle, ajoute, base, nom FROM favoris').all();
        const tousJeux = favs.some((f) => f.type === 'theme') ? this.jeuxPourThemes() : [];
        const jeuDe = this.db.prepare('SELECT nom, joueurs, icone FROM jeux WHERE id = ?');
        const favoris = [];
        for (const f of favs) {
            const alerte = alertes.find((a) => a.type === f.type && a.cle === f.cle);
            const marques = { ...(alerte?.sorte === 'palier' ? { palier: alerte.ratio } : {}), ...(alerte?.sorte === 'regulier' ? { regulier: true } : {}) };
            if (f.type === 'jeu') {
                const j = jeuDe.get(Number(f.cle));
                if (!j)
                    continue;
                const apres = j.joueurs ?? 0;
                favoris.push({
                    type: 'jeu',
                    cle: f.cle,
                    nom: j.nom ?? f.cle,
                    ...(j.icone ? { icone: j.icone } : {}),
                    avant: avant.get(Number(f.cle))?.j ?? null,
                    apres,
                    ratioEtoile: apres / Math.max(BASE_MIN, f.base ?? 0),
                    ...marques,
                });
            }
            else if (f.type === 'theme') {
                const cherches = f.cle.split(' ');
                let a = 0;
                let p = 0;
                let comparables = 0;
                for (const g of sains) {
                    const av = avant.get(g.id)?.j;
                    if (av === undefined && !(g.cree && g.cree > ref))
                        continue;
                    const mots = motsDuTitre(g.nom ?? '');
                    if (!cherches.every((m) => mots.includes(m)))
                        continue;
                    a += av ?? 0;
                    p += g.joueurs ?? 0;
                    comparables++;
                }
                const niveau = this.niveauTheme(f.cle, f.ajoute, tousJeux).joueurs;
                favoris.push({
                    type: 'theme',
                    cle: f.cle,
                    nom: f.cle,
                    avant: comparables ? a : null,
                    apres: comparables ? p : niveau,
                    ratioEtoile: niveau / Math.max(BASE_MIN, f.base ?? 0),
                    ...marques,
                });
            }
        }
        // Plus gros changements d'abord.
        const ecart = (x) => (x.avant ? Math.abs(x.apres / x.avant - 1) : 0);
        favoris.sort((a, b) => Number(!!b.palier || !!b.regulier) - Number(!!a.palier || !!a.regulier) || ecart(b) - ecart(a));
        const studios = [];
        const neufsDe = this.db.prepare('SELECT id, nom FROM jeux WHERE createurId = ? AND createurType = ? AND cree > ? ORDER BY cree DESC LIMIT 10');
        for (const f of favs.filter((x) => x.type === 'createur')) {
            const [type, id] = f.cle.split(':');
            const l = neufsDe.all(Number(id), type, ref);
            if (l.length)
                studios.push({ cle: f.cle, nom: f.nom || f.cle, jeux: l });
        }
        return { depuis, le: t, favoris, studios, jeunes, nouveaux, gros, themes };
    }
    // ----- Rangement -----
    /** Relevés de plus de 11 jours : résumés par jour (médiane, max), puis effacés. */
    ranger() {
        const limite = debutJour(jourDe(Date.now()) - JOURS_DETAILLES + 1);
        const vieux = this.db.prepare('SELECT jeu, t, joueurs FROM releves WHERE t < ? ORDER BY jeu, t').all(limite);
        const groupes = new Map();
        for (const r of vieux) {
            const jour = jourDe(r.t);
            const k = `${r.jeu}|${jour}`;
            let g = groupes.get(k);
            if (!g)
                groupes.set(k, (g = { jeu: r.jeu, jour, v: [] }));
            g.v.push(r.joueurs);
        }
        const st = this.db.prepare('INSERT OR REPLACE INTO jours (jeu, jour, mediane, max, n) VALUES (?, ?, ?, ?, ?)');
        this.transaction(() => {
            for (const g of groupes.values())
                st.run(g.jeu, g.jour, mediane(g.v), Math.max(...g.v), g.v.length);
            this.db.prepare('DELETE FROM releves WHERE t < ?').run(limite);
        });
    }
    // ----- Lecture pour l'interface -----
    liste() {
        const t = Date.now();
        const rangs = this.db.prepare('SELECT * FROM jeux WHERE suivi = 1 AND vu IS NOT NULL').all();
        return rangs.map((r) => this.versLigne(r, t));
    }
    /** Jeux connus du radar (suivis ou non) parmi ces ids. */
    lignes(ids) {
        const t = Date.now();
        const st = this.db.prepare('SELECT * FROM jeux WHERE id = ?');
        return ids
            .map((id) => st.get(id))
            .filter((r) => !!r)
            .map((r) => this.versLigne(r, t));
    }
    /** Id du jeu (universe) d'une place, s'il est connu du radar. */
    jeuDeLaPlace(place) {
        return this.db.prepare('SELECT id FROM jeux WHERE place = ?').get(place)?.id ?? null;
    }
    /** Recherche Roblox pour un agent (les jeux trouvés rejoignent le radar). */
    async chercher(texte, pages) {
        const r = await this.rechercher(texte, Math.max(1, Math.min(5, pages)), (0, node_crypto_1.randomUUID)(), `agent:${texte}`);
        const vus = new Set();
        return r
            .filter((g) => g.universeId && g.name && !vus.has(g.universeId) && vus.add(g.universeId))
            .map((g) => ({
            id: g.universeId,
            place: g.rootPlaceId ?? 0,
            nom: g.name,
            joueurs: g.playerCount ?? 0,
            haut: g.totalUpVotes ?? 0,
            bas: g.totalDownVotes ?? 0,
        }));
    }
    /** Détails en direct (Roblox) de jeux par id : créateur, visites, favoris, dates. */
    async detailsEnDirect(ids) {
        const tous = [];
        for (let i = 0; i < ids.length; i += 50) {
            const r = await lireJson(`https://games.roblox.com/v1/games?universeIds=${ids.slice(i, i + 50).join(',')}`, this.c.jeux, this.stop);
            tous.push(...(r.data ?? []));
        }
        return tous;
    }
    /** Id du jeu d'une place (Roblox en direct). */
    async jeuDeLaPlaceEnDirect(place) {
        const r = await lireJson(`https://apis.roblox.com/universes/v1/places/${place}/universe`, this.c.jeux, this.stop);
        return r.universeId ?? null;
    }
    /** Jeux qui montent selon le radar (pour les agents) : petits, jeunes, en hausse, peu de concurrence. */
    tendances(mot, nombre) {
        const cherches = mot ? motsDuTitre(mot) : [];
        const t = Date.now();
        return this.liste()
            .filter((l) => (!cherches.length || cherches.every((m) => motsDuTitre(l.nom).includes(m))) && l.bots <= 60 && l.joueurs >= 100)
            .filter((l) => (l.croissance !== null && l.croissance > 10) || (l.elan !== null && l.elan >= 1.5))
            .filter((l) => cherches.length || (l.cree > t - 120 * JOUR && l.joueurs <= 20_000))
            .sort((a, b) => (b.croissance ?? (b.elan ?? 0) * 20) - (a.croissance ?? (a.elan ?? 0) * 20))
            .slice(0, nombre);
    }
    /** Thèmes suivis en favori (pour les agents). */
    themesSuivis() {
        return this.favoris().themes;
    }
    /** Âge de l'historique (premier relevé, ms) et nombre de jeux suivis. */
    resume() {
        this.compter();
        return { premierReleve: this.etat.premierReleve, jeuxSuivis: this.etat.jeuxSuivis };
    }
    versLigne(r, t) {
        const haut = Number(r.haut ?? 0);
        const bas = Number(r.bas ?? 0);
        const n = (v) => (v === null || v === undefined ? null : Number(v));
        return {
            id: Number(r.id),
            placeId: Number(r.place ?? 0),
            nom: String(r.nom ?? ''),
            createur: String(r.createur ?? ''),
            genre: String(r.genre ?? ''),
            joueurs: Number(r.joueurs ?? 0),
            visites: Number(r.visites ?? 0),
            favoris: Number(r.favoris ?? 0),
            likes: haut + bas > 0 ? (100 * haut) / (haut + bas) : null,
            votes: haut + bas,
            cree: Number(r.cree ?? 0),
            maj: Number(r.maj ?? 0),
            icone: r.icone ? String(r.icone) : undefined,
            sponsorise: Number(r.sponsor ?? 0) > t - 7 * JOUR,
            record: Number(r.record ?? 0),
            createurCle: r.createurId ? `${r.createurType === 'Group' ? 'Group' : 'User'}:${r.createurId}` : '',
            joursValides: Number(r.joursValides ?? 0),
            croissance: n(r.croissance),
            pente: n(r.pente),
            joursHausse: Number(r.joursHausse ?? 0),
            elan: n(r.elan),
            pic: n(r.pic),
            semblables: n(r.semblables),
            partN1: n(r.partN1),
            percer: n(r.percer),
            percerRaisons: r.percerRaisons ? String(r.percerRaisons).split(' ') : [],
            bots: Number(r.bots ?? 0),
            botsRaisons: r.botsRaisons ? String(r.botsRaisons).split(' ') : [],
        };
    }
    detail(id) {
        const rel = this.db.prepare('SELECT t, joueurs FROM releves WHERE jeu = ? ORDER BY t').all(id);
        const jours = this.db.prepare('SELECT jour, mediane, max FROM jours WHERE jeu = ? ORDER BY jour').all(id);
        const j = this.db.prepare('SELECT nom, semblablesListe FROM jeux WHERE id = ?').get(id);
        let semblables = [];
        try {
            semblables = j?.semblablesListe ? JSON.parse(j.semblablesListe) : [];
        }
        catch {
            /* liste abîmée : vide */
        }
        return {
            id,
            releves: rel.map((r) => [r.t, r.joueurs]),
            jours: jours.map((d) => [debutJour(d.jour), d.mediane, d.max]),
            semblables,
            mots: motsDuTitre(j?.nom ?? ''),
        };
    }
    // ----- Thèmes qui montent -----
    /** Thèmes (un mot du titre, ou deux mots qui se suivent) des jeux suivis, avec leur croissance. */
    themes() {
        const suivis = this.themesProteges();
        // Les favoris changent la fusion (un thème suivi n'est jamais fondu) : ils font partie de la clé du cache.
        const v = `${this.version}|${[...suivis].sort().join(',')}`;
        if (this.cacheThemes?.v !== v)
            this.cacheThemes = { v, l: this.calculerThemes(suivis) };
        return this.cacheThemes.l.map((th) => ({ ...th, suivi: suivis.has((0, exports.cleTriee)(th.cle)) }));
    }
    /** Thèmes en favori (clés aux mots triés) : jamais fondus dans un autre. */
    themesProteges() {
        return new Set(this.db.prepare("SELECT cle FROM favoris WHERE type = 'theme'").all().map((r) => (0, exports.cleTriee)(r.cle)));
    }
    /**
     * Un thème additionne ses jeux, mais seulement ce qui est comparable : la croissance 7 j prend les jeux qui ont des relevés
     * dans les deux périodes (plus les jeux nés entre-temps), la croissance 24 h ceux relevés à la même heure la veille
     * (plus ceux nés depuis). Un vieux jeu découvert tard ne fait donc pas croire à une hausse. Jeux aux bots probables exclus.
     */
    calculerThemes(proteges) {
        const t = Date.now();
        const rangs = this.db
            .prepare('SELECT id, nom, joueurs, cree, visites, icone, recente, ancienne, j24, rythme FROM jeux WHERE suivi = 1 AND vu IS NOT NULL AND COALESCE(bots, 0) <= 60')
            .all();
        const par = new Map();
        for (const g of rangs) {
            const mots = motsDuTitre(g.nom ?? '');
            // Clé = mots triés (« brainrot steal » = « steal brainrot »), libellé = l'ordre du premier titre vu.
            const cles = new Map();
            for (const m of mots)
                cles.set(m, m);
            for (let i = 0; i + 1 < mots.length; i++)
                cles.set([mots[i], mots[i + 1]].sort().join(' '), `${mots[i]} ${mots[i + 1]}`);
            const j = g.joueurs ?? 0;
            const jeune = !!g.cree && g.cree > t - 30 * JOUR;
            for (const [cle, libelle] of cles) {
                let a = par.get(cle);
                if (!a) {
                    a = {
                        cle,
                        libelle,
                        jeux: 0,
                        joueurs: 0,
                        jeunes: 0,
                        joueursJeunes: 0,
                        rec: 0,
                        anc: 0,
                        n7: 0,
                        apres: 0,
                        avant: 0,
                        n24: 0,
                        rythme: 0,
                        moyen: 0,
                        top: [],
                        ids: new Map(),
                    };
                    par.set(cle, a);
                }
                a.jeux++;
                a.joueurs += j;
                a.ids.set(g.id, j);
                if (jeune) {
                    a.jeunes++;
                    a.joueursJeunes += j;
                }
                if (g.recente !== null && g.ancienne !== null) {
                    a.rec += g.recente;
                    a.anc += g.ancienne;
                    a.n7++;
                }
                else if (g.recente !== null && g.cree && g.cree > t - 10 * JOUR) {
                    a.rec += g.recente;
                    a.n7++;
                }
                if (g.j24 !== null) {
                    a.apres += j;
                    a.avant += g.j24;
                    a.n24++;
                }
                else if (g.cree && g.cree > t - JOUR) {
                    a.apres += j;
                    a.n24++;
                }
                if (g.rythme !== null && g.cree && t - g.cree >= 6 * HEURE && (g.visites ?? 0) > 0) {
                    a.rythme += g.rythme;
                    a.moyen += (g.visites ?? 0) / ((t - g.cree) / HEURE);
                }
                if (a.top.length < 3 || j > a.top[a.top.length - 1].joueurs) {
                    a.top.push({ id: g.id, nom: g.nom ?? '', joueurs: j, icone: g.icone ?? undefined });
                    a.top.sort((x, y) => y.joueurs - x.joueurs);
                    if (a.top.length > 3)
                        a.top.pop();
                }
            }
        }
        const gardes = [...par.values()].filter((a) => a.jeux >= THEME_JEUX_MIN && a.joueurs >= THEME_JOUEURS_MIN);
        const redondants = motsRedondants(gardes, proteges);
        // Thèmes portés par les mêmes jeux (« letter » dans « thai ») : fondus, comme dans le récap (sauf les thèmes en favori).
        return fusionnerThemes(gardes.filter((a) => !redondants.has(a.cle)).map((a) => ({ ...a, poids: a.joueurs })), proteges)
            .map((a) => ({
            cle: a.libelle,
            jeux: a.jeux,
            joueurs: a.joueurs,
            jeunes: a.jeunes,
            partJeunes: a.joueurs ? a.joueursJeunes / a.joueurs : 0,
            croissance24: a.n24 >= 2 && a.avant >= 20 ? (a.apres / a.avant - 1) * 100 : null,
            croissance7: a.n7 >= 2 && a.anc >= 20 ? (a.rec / a.anc - 1) * 100 : null,
            elan: a.moyen > 0 ? a.rythme / a.moyen : null,
            n1: a.top[0],
            partN1: a.joueurs ? a.top[0].joueurs / a.joueurs : 0,
            icones: a.top.map((x) => x.icone).filter((x) => !!x),
            suivi: false,
            ...(a.aussi.length ? { aussi: a.aussi } : {}),
        }));
    }
    /** Fiche d'un thème : ses jeux (du plus gros au plus petit) et la courbe de ses joueurs. */
    detailTheme(cle) {
        const cherches = motsDuTitre(cle);
        const t = Date.now();
        const rangs = this.db.prepare('SELECT id, nom, joueurs, decouvert, cree FROM jeux WHERE suivi = 1 AND vu IS NOT NULL AND COALESCE(bots, 0) <= 60').all()
            .filter((r) => {
            const m = motsDuTitre(r.nom ?? '');
            return cherches.length > 0 && cherches.every((c) => m.includes(c));
        })
            .sort((a, b) => (b.joueurs ?? 0) - (a.joueurs ?? 0));
        // Courbe : jeux déjà connus au début de l'historique (ou nés depuis), pour qu'une découverte tardive ne fasse pas un saut.
        const debut = Math.max(t - JOURS_DETAILLES * JOUR, Number(this.meta('premierReleve') ?? 0));
        const stables = rangs.filter((r) => (r.decouvert ?? 0) <= debut + 3 * HEURE || (r.cree ?? 0) >= debut);
        const sommes = new Map();
        for (let i = 0; i < stables.length; i += 400) {
            const lot = stables.slice(i, i + 400).map((r) => r.id);
            const res = this.db
                .prepare(`SELECT t, SUM(joueurs) AS s, COUNT(*) AS n FROM releves WHERE t >= ? AND jeu IN (${lot.map(() => '?').join(',')}) GROUP BY t`)
                .all(debut, ...lot);
            for (const r of res) {
                const v = sommes.get(r.t) ?? { s: 0, n: 0 };
                v.s += r.s;
                v.n += r.n;
                sommes.set(r.t, v);
            }
        }
        // Relevés où il manque beaucoup de jeux (relevé interrompu) : retirés, sinon faux creux.
        const nMax = Math.max(0, ...[...sommes.values()].map((v) => v.n));
        const courbe = [...sommes]
            .filter(([, v]) => v.n >= 0.6 * nMax)
            .sort((a, b) => a[0] - b[0])
            .map(([tt, v]) => [tt, v.s]);
        return { cle, mots: cherches, jeux: rangs.slice(0, 200).map((r) => r.id), courbe, jeuxCourbe: stables.length };
    }
    /** Thèmes qui montent (pour les agents) : croissance 7 j, sinon 24 h, sinon élan. */
    themesQuiMontent(n) {
        return this.themes()
            .filter((th) => th.joueurs >= 200 && th.n1.joueurs / Math.max(1, th.joueurs) < 0.95)
            .sort((a, b) => scoreTheme(b) - scoreTheme(a))
            .slice(0, n);
    }
    // ----- Studios -----
    /** Jeux publics d'un studio (groupe) ou d'un joueur : les 50 plus récents, ajoutés au radar (relevés au prochain tour). */
    async lireJeuxCreateur(cle, nom) {
        const m = /^(Group|User):(\d+)$/.exec(cle);
        if (!m)
            return [];
        const [, type, id] = m;
        const u = type === 'Group'
            ? `https://games.roblox.com/v2/groups/${id}/gamesV2?accessFilter=Public&limit=50&sortOrder=Desc`
            : `https://games.roblox.com/v2/users/${id}/games?accessFilter=Public&limit=50&sortOrder=Desc`;
        const r = await lireJson(u, this.c.createurs, this.stop);
        const t = Date.now();
        const jeux = (r.data ?? []).filter((g) => g.id && g.name);
        const st = this.db.prepare(`
      INSERT INTO jeux (id, place, nom, createur, createurId, createurType, cree, maj, visites, decouvert, source, suivi)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nom = excluded.nom, place = excluded.place,
        createur = CASE WHEN createur IS NULL OR createur = '' THEN excluded.createur ELSE createur END,
        createurId = excluded.createurId, createurType = excluded.createurType,
        cree = COALESCE(excluded.cree, cree), maj = COALESCE(excluded.maj, maj),
        visites = MAX(COALESCE(visites, 0), excluded.visites)`);
        this.transaction(() => {
            for (const g of jeux) {
                const cree = g.created ? Date.parse(g.created) : null;
                st.run(g.id, g.rootPlace?.id ?? 0, g.name, nom, Number(id), type, cree, g.updated ? Date.parse(g.updated) : null, g.placeVisits ?? 0, t, `createur:${cle}`, cree && cree > t - 120 * JOUR ? 1 : 0);
            }
            this.db.prepare('INSERT INTO createurs (cle, verifieLe) VALUES (?, ?) ON CONFLICT(cle) DO UPDATE SET verifieLe = excluded.verifieLe').run(cle, t);
        });
        this.version++;
        return jeux.map((g) => ({ id: g.id, nom: g.name }));
    }
    static idsVus(texte) {
        if (!texte)
            return null;
        try {
            return new Set(JSON.parse(texte));
        }
        catch {
            return null;
        }
    }
    /**
     * Studios suivis : leur liste de jeux à chaque tour ; un jeu qu'on n'y avait jamais vu = alerte « nouveau jeu »
     * (le premier passage sert de référence, sans alerte). Toutes les 6 h : aussi les 150 studios à succès non suivis
     * (leurs nouveaux jeux rejoignent le radar, sans alerte).
     */
    async verifierCreateurs(auto) {
        const suivis = this.db.prepare("SELECT cle, nom, ids FROM favoris WHERE type = 'createur'").all();
        const t = Date.now();
        const verifie = new Map(this.db.prepare('SELECT cle, verifieLe FROM createurs').all().map((r) => [r.cle, r.verifieLe]));
        const autres = auto
            ? this.createurs()
                .filter((c) => !c.suivi && c.succes >= 2 && t - (verifie.get(c.cle) ?? 0) >= CREATEURS_TOUS)
                .slice(0, CREATEURS_AUTO)
            : [];
        const total = suivis.length + autres.length;
        if (!total) {
            if (auto)
                this.ecrireMeta('createursLe', t);
            return;
        }
        const { actives } = this.reglagesAlertes();
        const noter = this.db.prepare("INSERT INTO alertes (t, type, cle, nom, sorte, ratio, joueurs, jeu, auteur) VALUES (?, 'createur', ?, ?, 'nouveau', 0, 0, ?, ?)");
        let fait = 0;
        for (const f of suivis) {
            const nom = f.nom || f.cle;
            try {
                const jeux = await this.lireJeuxCreateur(f.cle, nom);
                const connus = Radar.idsVus(f.ids);
                const neufs = connus ? jeux.filter((j) => !connus.has(j.id)) : [];
                this.transaction(() => {
                    for (const j of neufs) {
                        this.db.prepare('UPDATE jeux SET suivi = 1 WHERE id = ?').run(j.id);
                        if (!actives)
                            continue;
                        noter.run(t, f.cle, j.nom, j.id, nom);
                        this.alertesCreateurs.push({ t, type: 'createur', cle: f.cle, nom: j.nom, sorte: 'nouveau', ratio: 0, joueurs: 0, jeu: j.id, auteur: nom });
                    }
                    const ids = [...new Set([...jeux.map((j) => j.id), ...(connus ?? [])])].slice(0, 300);
                    this.db.prepare("UPDATE favoris SET ids = ? WHERE type = 'createur' AND cle = ?").run(JSON.stringify(ids), f.cle);
                });
            }
            catch (e) {
                if (e.message === 'arrêté')
                    throw e;
                this.journal(`Radar, jeux du studio « ${nom} » : ${e.message}`);
            }
            this.publier({ avance: ++fait / total });
        }
        for (const c of autres) {
            await this.lireJeuxCreateur(c.cle, c.nom).catch((e) => {
                if (e.message === 'arrêté')
                    throw e;
            });
            this.publier({ avance: ++fait / total });
        }
        if (auto)
            this.ecrireMeta('createursLe', t);
    }
    /** Studios et joueurs créateurs connus du radar, ceux qui ont le plus de succès d'abord. */
    createurs() {
        if (this.cacheCreateurs?.v !== this.version)
            this.cacheCreateurs = { v: this.version, l: this.calculerCreateurs() };
        const suivis = new Set(this.db.prepare("SELECT cle FROM favoris WHERE type = 'createur'").all().map((r) => r.cle));
        return this.cacheCreateurs.l.filter((c) => c.succes >= 1 || c.joueurs >= 200 || suivis.has(c.cle)).map((c) => ({ ...c, suivi: suivis.has(c.cle) }));
    }
    calculerCreateurs() {
        const t = Date.now();
        const rangs = this.db
            .prepare('SELECT id, nom, createur, createurId, createurType, joueurs, record, visites, cree, icone FROM jeux WHERE createurId IS NOT NULL')
            .all();
        const par = new Map();
        for (const r of rangs) {
            const type = r.createurType === 'Group' ? 'Group' : 'User';
            const cle = `${type}:${r.createurId}`;
            const joueurs = r.joueurs ?? 0;
            let c = par.get(cle);
            if (!c) {
                c = {
                    cle,
                    id: r.createurId,
                    type,
                    nom: r.createur ?? '',
                    jeux: 0,
                    succes: 0,
                    joueurs: 0,
                    record: 0,
                    visites: 0,
                    meilleur: { id: r.id, nom: r.nom ?? '', joueurs, icone: r.icone ?? undefined },
                    dernier: null,
                    nouveaux: 0,
                    suivi: false,
                };
                par.set(cle, c);
            }
            if (!c.nom && r.createur)
                c.nom = r.createur;
            c.jeux++;
            c.joueurs += joueurs;
            c.visites += r.visites ?? 0;
            const record = Math.max(r.record ?? 0, joueurs);
            if (record >= SUCCES_JOUEURS || (r.visites ?? 0) >= SUCCES_VISITES)
                c.succes++;
            c.record = Math.max(c.record, record);
            if (joueurs > c.meilleur.joueurs)
                c.meilleur = { id: r.id, nom: r.nom ?? '', joueurs, icone: r.icone ?? undefined };
            if (r.cree && (!c.dernier || r.cree > c.dernier.cree))
                c.dernier = { id: r.id, nom: r.nom ?? '', cree: r.cree };
            if (r.cree && r.cree > t - 30 * JOUR)
                c.nouveaux++;
        }
        return [...par.values()].filter((c) => c.nom).sort((a, b) => b.succes - a.succes || b.joueurs - a.joueurs);
    }
    /** Fiche d'un studio : tous ses jeux connus, les plus récents d'abord (sa liste est relue sur Roblox si elle a plus de 6 h). */
    async detailCreateur(cle) {
        const m = /^(Group|User):(\d+)$/.exec(cle);
        if (!m)
            throw new Error('Studio inconnu.');
        const id = Number(m[2]);
        let erreur;
        const verifie = this.db.prepare('SELECT verifieLe FROM createurs WHERE cle = ?').get(cle)?.verifieLe ?? 0;
        if (Date.now() - verifie > CREATEURS_TOUS) {
            const nom = this.db.prepare("SELECT createur FROM jeux WHERE createurId = ? AND createurType = ? AND createur <> '' LIMIT 1").get(id, m[1])?.createur;
            await this.lireJeuxCreateur(cle, nom ?? '').catch((e) => {
                erreur = e.message;
            });
        }
        const t = Date.now();
        const rangs = this.db.prepare('SELECT * FROM jeux WHERE createurId = ? AND createurType = ? ORDER BY cree DESC LIMIT 100').all(id, m[1]);
        return { cle, jeux: rangs.map((r) => this.versLigne(r, t)), erreur };
    }
    // ----- Favoris et alertes -----
    reglagesAlertes() {
        const seuil = Number(this.meta('seuilAlerte'));
        return { actives: this.meta('alertes') !== '0', seuil: PALIERS.includes(seuil) ? seuil : 1.5 };
    }
    reglerAlertes(m) {
        if (m.actives !== undefined)
            this.ecrireMeta('alertes', m.actives ? '1' : '0');
        if (m.seuil !== undefined && PALIERS.includes(m.seuil))
            this.ecrireMeta('seuilAlerte', m.seuil);
        return this.favoris();
    }
    /** Jeux connus avec les mots de leur titre (pour les thèmes). */
    jeuxPourThemes() {
        const rangs = this.db.prepare('SELECT nom, joueurs, decouvert, cree FROM jeux WHERE joueurs IS NOT NULL').all();
        return rangs.map((r) => ({ joueurs: r.joueurs, decouvert: r.decouvert ?? 0, cree: r.cree ?? 0, mots: motsDuTitre(r.nom ?? '') }));
    }
    /**
     * Joueurs d'un thème : jeux qui ont tous ses mots dans le titre, déjà connus à l'instant de référence, plus ceux créés depuis.
     * (Un vieux jeu découvert plus tard ne compte pas : sinon une simple découverte ferait croire à une hausse.)
     */
    niveauTheme(mot, reference, jeux) {
        const cherches = mot.split(' ');
        let joueurs = 0;
        let n = 0;
        let nouveaux = 0;
        for (const j of jeux) {
            if (!cherches.every((m) => j.mots.includes(m)))
                continue;
            const neuf = j.cree > reference;
            if (j.decouvert > reference && !neuf)
                continue;
            joueurs += j.joueurs;
            n++;
            if (neuf)
                nouveaux++;
        }
        return { joueurs, jeux: n, nouveaux };
    }
    favoris() {
        const favs = this.db.prepare('SELECT type, cle, ajoute, base, nom FROM favoris ORDER BY ajoute DESC').all();
        const createurs = [];
        const neufsDe = this.db.prepare('SELECT COUNT(*) AS n FROM jeux WHERE createurId = ? AND createurType = ? AND cree > ?');
        const joueursDe = this.db.prepare('SELECT joueurs FROM jeux WHERE id = ?');
        const tousJeux = favs.some((f) => f.type === 'theme') ? this.jeuxPourThemes() : [];
        const jeux = [];
        const themes = [];
        for (const f of favs) {
            const base = f.base ?? 0;
            if (f.type === 'jeu') {
                const j = joueursDe.get(Number(f.cle));
                jeux.push({ id: Number(f.cle), ajoute: f.ajoute, base, ratio: (j?.joueurs ?? 0) / Math.max(BASE_MIN, base) });
            }
            else if (f.type === 'createur') {
                const [type, id] = f.cle.split(':');
                const n = neufsDe.get(Number(id), type, f.ajoute).n;
                createurs.push({ cle: f.cle, nom: f.nom || f.cle, ajoute: f.ajoute, nouveaux: n });
            }
            else {
                const n = this.niveauTheme(f.cle, f.ajoute, tousJeux);
                themes.push({ mot: f.cle, ajoute: f.ajoute, base, ...n, ratio: n.joueurs / Math.max(BASE_MIN, base) });
            }
        }
        const alertes = this.db.prepare('SELECT t, type, cle, nom, sorte, ratio, joueurs, jeu, auteur FROM alertes ORDER BY t DESC LIMIT 30').all().map(({ jeu, auteur, ...a }) => ({ ...a, ...(jeu ? { jeu } : {}), ...(auteur ? { auteur } : {}) }));
        return { jeux, themes, createurs, alertes, reglages: this.reglagesAlertes() };
    }
    /** Ajoute ou retire un favori. Un thème est cherché tout de suite dans Roblox, puis sa base est recalculée. */
    basculerFavori(type, cleBrute, actif) {
        let cle = cleBrute.trim();
        if (type === 'theme') {
            cle = motsDuTitre(cle).slice(0, 3).join(' ');
            if (!cle)
                throw new Error('Mot trop court ou trop courant : choisis un mot de 3 lettres ou plus (ex. « tsunami »).');
        }
        else if (type === 'createur') {
            if (!/^(Group|User):\d+$/.test(cle))
                throw new Error('Studio inconnu.');
        }
        else if (!/^\d+$/.test(cle))
            throw new Error('Jeu inconnu.');
        if (!actif) {
            this.db.prepare('DELETE FROM favoris WHERE type = ? AND cle = ?').run(type, cle);
            return this.favoris();
        }
        const t = Date.now();
        if (type === 'createur') {
            const [ct, id] = cle.split(':');
            const nom = this.db.prepare("SELECT createur FROM jeux WHERE createurId = ? AND createurType = ? AND createur <> '' LIMIT 1").get(Number(id), ct)?.createur ?? cle;
            this.db
                .prepare("INSERT INTO favoris (type, cle, ajoute, base, palier, nom) VALUES ('createur', ?, ?, 0, 0, ?) ON CONFLICT(type, cle) DO NOTHING")
                .run(cle, t, nom);
            // Liste de jeux de départ (référence) : seuls les jeux publiés ensuite préviendront.
            void this.lireJeuxCreateur(cle, nom)
                .then((jeux) => {
                if (this.arrete)
                    return;
                this.db.prepare("UPDATE favoris SET ids = ? WHERE type = 'createur' AND cle = ? AND ids IS NULL").run(JSON.stringify(jeux.map((j) => j.id)), cle);
            })
                .catch((e) => this.journal(`Radar, jeux du studio « ${nom} » : ${e.message}`));
            return this.favoris();
        }
        const jeu = type === 'jeu'
            ? this.db.prepare('SELECT joueurs, joursHausse FROM jeux WHERE id = ?').get(Number(cle))
            : undefined;
        const base = type === 'jeu' ? (jeu?.joueurs ?? 0) : this.niveauTheme(cle, t, this.jeuxPourThemes()).joueurs;
        // Déjà en hausse depuis 3 jours à l'ajout : pas d'alerte « monte depuis 3 jours » pour ce qu'on vient de voir.
        const hausseVue = (jeu?.joursHausse ?? 0) >= 3 ? 1 : 0;
        this.db
            .prepare('INSERT INTO favoris (type, cle, ajoute, base, palier, precedent, hausseVue) VALUES (?, ?, ?, ?, 0, NULL, ?) ON CONFLICT(type, cle) DO NOTHING')
            .run(type, cle, t, base, hausseVue);
        if (type === 'jeu')
            this.db.prepare('UPDATE jeux SET suivi = 1 WHERE id = ?').run(Number(cle));
        else
            void this.rechercher(cle, 3, (0, node_crypto_1.randomUUID)(), `theme:${cle}`)
                .then(() => {
                if (this.arrete)
                    return;
                const maintenant = Date.now();
                const n = this.niveauTheme(cle, maintenant, this.jeuxPourThemes());
                this.db.prepare("UPDATE favoris SET ajoute = ?, base = ? WHERE type = 'theme' AND cle = ?").run(maintenant, n.joueurs, cle);
            })
                .catch((e) => this.journal(`Radar, recherche du thème « ${cle} » : ${e.message}`));
        return this.favoris();
    }
    /**
     * Après chaque relevé : un favori qui franchit un palier (×1,5, ×2, ×3, ×5, ×10 les joueurs de l'ajout, à partir du seuil choisi),
     * confirmé sur 2 relevés de suite, ou un jeu favori qui monte depuis 3 jours → alerte.
     * Une alerte par palier (réarmée si on retombe sous 80 % du palier), une par favori toutes les 6 h au plus,
     * aucune juste après une absence de plus de 24 h ni sur un jeu au pic suspect (bots probables).
     */
    verifierFavoris() {
        const favs = this.db.prepare('SELECT * FROM favoris').all();
        if (!favs.length)
            return [];
        const t = Date.now();
        const { actives, seuil } = this.reglagesAlertes();
        const tousJeuxSiTheme = favs.some((f) => f.type === 'theme');
        const paliers = PALIERS.filter((p) => p >= seuil).reverse(); // du plus haut au plus bas
        const tousJeux = tousJeuxSiTheme ? this.jeuxPourThemes() : [];
        const jeuDe = this.db.prepare('SELECT nom, joueurs, joursHausse, bots FROM jeux WHERE id = ?');
        const maj = this.db.prepare('UPDATE favoris SET palier = ?, precedent = ?, hausseVue = ?, alerteLe = ? WHERE type = ? AND cle = ?');
        const noter = this.db.prepare('INSERT INTO alertes (t, type, cle, nom, sorte, ratio, joueurs) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const nouvelles = [];
        this.transaction(() => {
            for (const f of favs) {
                if (f.type === 'createur')
                    continue; // studios : vérifiés par verifierCreateurs
                let nom = f.cle;
                let joueurs;
                let hausse = 0;
                let suspect = false;
                if (f.type === 'jeu') {
                    const j = jeuDe.get(Number(f.cle));
                    if (!j)
                        continue;
                    nom = j.nom;
                    joueurs = j.joueurs ?? 0;
                    hausse = j.joursHausse ?? 0;
                    suspect = (j.bots ?? 0) > 60;
                }
                else
                    joueurs = this.niveauTheme(f.cle, f.ajoute, tousJeux).joueurs;
                const ratio = joueurs / Math.max(BASE_MIN, f.base ?? 0);
                let palier = f.palier ?? 0;
                let hausseVue = f.hausseVue ?? 0;
                let alerteLe = f.alerteLe;
                // Retombé sous 80 % du palier atteint : ce palier pourra prévenir à nouveau.
                if (palier && ratio < 0.8 * palier)
                    palier = paliers.find((p) => ratio >= 0.8 * p) ?? 0;
                const atteint = paliers.find((p) => ratio >= p && (f.precedent ?? 0) >= p) ?? 0;
                const libre = !this.apresTrou && !suspect && !(alerteLe && t - alerteLe < ALERTE_ECART);
                let sorte = null;
                if (atteint > palier) {
                    if (!actives)
                        palier = atteint; // coupées : on avance sans prévenir (pas de vieilles alertes à la reprise)
                    else if (libre) {
                        palier = atteint;
                        sorte = 'palier';
                    }
                }
                if (hausse === 0)
                    hausseVue = 0;
                else if (hausse >= 3 && !hausseVue && !sorte) {
                    if (!actives)
                        hausseVue = 1;
                    else if (libre) {
                        hausseVue = 1;
                        sorte = 'regulier';
                    }
                }
                if (sorte) {
                    alerteLe = t;
                    noter.run(t, f.type, f.cle, nom, sorte, sorte === 'palier' ? palier : ratio, joueurs);
                    nouvelles.push({ t, type: f.type, cle: f.cle, nom, sorte, ratio: sorte === 'palier' ? palier : ratio, joueurs });
                }
                maj.run(palier, ratio, hausseVue, alerteLe ?? null, f.type, f.cle);
            }
            this.db.prepare('DELETE FROM alertes WHERE t < (SELECT MIN(t) FROM (SELECT t FROM alertes ORDER BY t DESC LIMIT 100))').run();
        });
        return nouvelles;
    }
}
exports.Radar = Radar;
//# sourceMappingURL=radar.js.map