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
const node_child_process_1 = require("node:child_process");
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const zlib = __importStar(require("node:zlib"));
const radar_1 = require("./radar");
/**
 * Serveur du radar (GitHub Actions, dépôt public `lupo-radar`, pas dans Lupo) : récupère la base publiée,
 * fait un relevé toutes les 30 min pendant ~5 h 30, et publie après chacun un lot + la base + `etat.json`
 * (assets de la release `donnees`, via `gh`). Le workflow se relance ensuite lui-même.
 * Lancement : `node radarCollecteur.js` (variables GH_TOKEN, GH_REPO ; DUREE_MIN facultatif).
 */
const MIN = 60_000;
const INTERVALLE = 30 * MIN;
/** Un relevé complet dure ~15 min : pas de nouveau relevé s'il reste moins que ça. */
const MARGE = 20 * MIN;
const LOTS_GARDES = 48 * 60 * MIN;
const ETIQUETTE = 'donnees';
const DOSSIER = path.resolve(process.env.DOSSIER_RADAR ?? 'donnees');
const gh = (args) => (0, node_child_process_1.execFileSync)('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
const attendre = (ms) => new Promise((ok) => setTimeout(ok, ms));
const heure = (t) => new Date(t).toISOString().slice(11, 16);
function telecharger(nom) {
    try {
        gh(['release', 'download', ETIQUETTE, '-p', nom, '-D', DOSSIER, '--clobber']);
        return true;
    }
    catch {
        return false;
    }
}
function gzip(source, cible) {
    const z = zlib.gzipSync(fs.readFileSync(source), { level: 6 });
    fs.writeFileSync(cible, z);
    fs.rmSync(source, { force: true });
    return z.length;
}
async function principal() {
    const debutTache = Date.now();
    const fin = debutTache + Number(process.env.DUREE_MIN ?? 330) * MIN;
    fs.mkdirSync(DOSSIER, { recursive: true });
    let etat = { v: 1, maj: 0, lots: [] };
    if (telecharger('etat.json'))
        etat = JSON.parse(fs.readFileSync(path.join(DOSSIER, 'etat.json'), 'utf8'));
    // Lots notés mais absents de la release (envoi raté autrefois) : retirés, sinon chaque Lupo bute dessus (404).
    try {
        const enLigne = new Set(JSON.parse(gh(['release', 'view', ETIQUETTE, '--json', 'assets'])).assets.map((a) => a.name));
        const manquants = etat.lots.filter((l) => !enLigne.has(l.fichier));
        if (manquants.length) {
            etat.lots = etat.lots.filter((l) => enLigne.has(l.fichier));
            console.log(`Lots absents retirés de etat.json : ${manquants.map((l) => l.fichier).join(', ')}.`);
        }
    }
    catch {
        /* release pas encore créée */
    }
    if (telecharger('radar.db.gz')) {
        fs.writeFileSync(path.join(DOSSIER, 'radar.db'), zlib.gunzipSync(fs.readFileSync(path.join(DOSSIER, 'radar.db.gz'))));
        fs.rmSync(path.join(DOSSIER, 'radar.db.gz'));
        console.log(`Base récupérée (relevé publié à ${heure(etat.maj)} UTC).`);
    }
    else
        console.log('Pas encore de base publiée : départ de zéro.');
    const radar = new radar_1.Radar(DOSSIER, undefined, (m) => console.log(m));
    radar.serveur = null;
    radar.manuel = true;
    for (;;) {
        const prochain = (etat.cycle ?? 0) + INTERVALLE;
        const depart = Math.max(Date.now(), prochain);
        if (depart + MARGE > fin)
            break;
        if (depart > Date.now()) {
            console.log(`Prochain relevé à ${heure(depart)} UTC.`);
            await attendre(depart - Date.now());
        }
        const debut = Date.now();
        await radar.cycle();
        const e = radar.lireEtat();
        const jusqua = Date.now();
        console.log(`Relevé fini en ${Math.round((jusqua - debut) / MIN)} min : ${e.jeuxSuivis} jeux suivis, ${e.jeuxConnus} connus.${e.erreur ? ` Erreurs : ${e.erreur}` : ''}`);
        const depuis = etat.maj || 0;
        const nomLot = `lot-${jusqua}.db.gz`;
        radar.exporterLot(path.join(DOSSIER, 'lot.db'), depuis);
        const tailleLot = gzip(path.join(DOSSIER, 'lot.db'), path.join(DOSSIER, nomLot));
        radar.copierBase(path.join(DOSSIER, 'base.db'));
        const tailleBase = gzip(path.join(DOSSIER, 'base.db'), path.join(DOSSIER, 'radar.db.gz'));
        const garder = etat.lots.filter((l) => l.jusqua > jusqua - LOTS_GARDES);
        const retires = etat.lots.filter((l) => !garder.includes(l));
        const nouvelEtat = {
            v: 1,
            maj: jusqua,
            cycle: debut,
            base: { fichier: 'radar.db.gz', jusqua, taille: tailleBase },
            lots: [...garder, { fichier: nomLot, depuis, jusqua }],
        };
        fs.writeFileSync(path.join(DOSSIER, 'etat.json'), JSON.stringify(nouvelEtat));
        let publie = false;
        try {
            // Dans cet ordre : un Lupo ne voit dans etat.json que des fichiers déjà en ligne.
            gh(['release', 'upload', ETIQUETTE, path.join(DOSSIER, nomLot), path.join(DOSSIER, 'radar.db.gz'), '--clobber']);
            gh(['release', 'upload', ETIQUETTE, path.join(DOSSIER, 'etat.json'), '--clobber']);
            publie = true;
            console.log(`Publié : lot ${Math.round(tailleLot / 1024)} Ko, base ${Math.round(tailleBase / 1024 / 1024)} Mo.`);
        }
        catch (err) {
            console.log(`Publication ratée : ${err.message}`);
        }
        fs.rmSync(path.join(DOSSIER, nomLot), { force: true });
        // Raté : l'état reste l'ancien (le prochain lot repart du dernier publié et couvre aussi ce relevé). Lot en trop retiré.
        if (!publie) {
            try {
                gh(['release', 'delete-asset', ETIQUETTE, nomLot, '-y']);
            }
            catch {
                /* jamais envoyé */
            }
            etat = { ...etat, cycle: debut };
            continue;
        }
        etat = nouvelEtat;
        for (const l of retires) {
            try {
                gh(['release', 'delete-asset', ETIQUETTE, l.fichier, '-y']);
            }
            catch {
                /* déjà retiré */
            }
        }
    }
    radar.arreter();
    console.log(`Fin de la tâche après ${Math.round((Date.now() - debutTache) / MIN)} min.`);
}
principal().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=radarCollecteur.js.map