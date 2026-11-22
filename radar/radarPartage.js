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
exports.SERVEUR_RADAR = void 0;
exports.exporterLot = exporterLot;
exports.fusionner = fusionner;
const fs = __importStar(require("node:fs"));
/**
 * Données partagées du radar : un serveur (dépôt GitHub `lupo-radar`, GitHub Actions) fait les relevés toutes les 30 min,
 * même Lupo fermé, et publie :
 * - `etat.json` : la liste des fichiers ci-dessous ;
 * - `radar.db.gz` : sa base complète (pour un Lupo qui n'a rien ou qui a été fermé plus de 2 jours) ;
 * - `lot-<t>.db.gz` : ce qui a changé pendant un relevé (gardés 48 h).
 * Lupo télécharge ce qui lui manque et le fusionne dans sa propre base (ses favoris et alertes restent chez lui).
 */
exports.SERVEUR_RADAR = process.env.LUPO_RADAR_SERVEUR ?? 'https://github.com/WithWolf098/lupo-radar/releases/download/donnees';
/** Colonnes d'un jeu échangées (les indicateurs calculés ne le sont pas : chaque Lupo les recalcule). */
const COLONNES = [
    'id', 'place', 'nom', 'createur', 'createurId', 'createurType', 'genre', 'cree', 'maj', 'visites', 'favoris', 'haut', 'bas',
    'joueurs', 'vu', 'decouvert', 'source', 'suivi', 'sponsor', 'record', 'votesLe', 'icone', 'iconeLe',
    'semblables', 'partN1', 'semblablesListe', 'semblablesLe',
];
/** Colonnes qui viennent du dernier relevé : prises au serveur seulement si son relevé est plus récent. */
const DU_RELEVE = ['nom', 'place', 'createur', 'createurId', 'createurType', 'genre', 'cree', 'maj', 'visites', 'favoris', 'joueurs', 'vu', 'suivi'];
const ceder = () => new Promise((ok) => setImmediate(ok));
function transaction(db, f) {
    db.exec('BEGIN');
    try {
        f();
        db.exec('COMMIT');
    }
    catch (e) {
        db.exec('ROLLBACK');
        throw e;
    }
}
/**
 * Serveur : écrit dans `fichier` (nouvelle base SQLite) ce qui a changé après `depuis`.
 * Icône et jeux semblables seulement s'ils ont été relus depuis (sinon vides : le client garde les siens).
 */
function exporterLot(db, fichier, depuis, jourMin) {
    fs.rmSync(fichier, { force: true });
    db.prepare('ATTACH DATABASE ? AS l').run(fichier);
    try {
        const frais = (le, col) => `CASE WHEN COALESCE(${le}, 0) > ${Number(depuis)} THEN ${col} END AS ${col}`;
        const cols = COLONNES.map((c) => c === 'icone' || c === 'iconeLe'
            ? frais('iconeLe', c)
            : ['semblables', 'partN1', 'semblablesListe', 'semblablesLe'].includes(c)
                ? frais('semblablesLe', c)
                : c);
        db.prepare(`CREATE TABLE l.jeux AS SELECT ${cols.join(', ')} FROM jeux
       WHERE vu > ? OR decouvert > ? OR votesLe > ? OR iconeLe > ? OR semblablesLe > ?`).run(depuis, depuis, depuis, depuis, depuis);
        db.prepare('CREATE TABLE l.releves AS SELECT jeu, t, joueurs, visites FROM releves WHERE t > ?').run(depuis);
        db.prepare('CREATE TABLE l.jours AS SELECT jeu, jour, mediane, max, n FROM jours WHERE jour >= ?').run(jourMin);
        db.prepare('CREATE TABLE l.createurs AS SELECT cle, verifieLe FROM createurs WHERE verifieLe > ?').run(depuis);
        db.exec("CREATE TABLE l.meta AS SELECT cle, valeur FROM meta WHERE cle = 'premierReleve'");
    }
    finally {
        db.exec('DETACH DATABASE l');
    }
}
/**
 * Lupo : fusionne une base du serveur (complète ou lot) dans la sienne. Le plus récent gagne, rien n'est effacé.
 * Par paquets (la base bloque Lupo pendant une écriture). Renvoie le premier relevé du serveur (âge de son historique).
 */
async function fusionner(db, fichier, relevesDepuis) {
    db.prepare('ATTACH DATABASE ? AS s').run(fichier);
    try {
        const tables = new Set(db.prepare("SELECT name FROM s.sqlite_master WHERE type = 'table'").all().map((r) => r.name));
        const condition = `COALESCE(excluded.vu, 0) >= COALESCE(jeux.vu, 0)`;
        const maj = [
            ...DU_RELEVE.map((c) => `${c} = CASE WHEN ${condition} THEN COALESCE(excluded.${c}, jeux.${c}) ELSE jeux.${c} END`),
            ...['haut', 'bas', 'votesLe'].map((c) => `${c} = CASE WHEN COALESCE(excluded.votesLe, 0) > COALESCE(jeux.votesLe, 0) THEN excluded.${c} ELSE jeux.${c} END`),
            ...['icone', 'iconeLe'].map((c) => `${c} = CASE WHEN excluded.icone IS NOT NULL AND COALESCE(excluded.iconeLe, 0) > COALESCE(jeux.iconeLe, 0) THEN excluded.${c} ELSE jeux.${c} END`),
            ...['semblables', 'partN1', 'semblablesListe', 'semblablesLe'].map((c) => `${c} = CASE WHEN COALESCE(excluded.semblablesLe, 0) > COALESCE(jeux.semblablesLe, 0) THEN excluded.${c} ELSE jeux.${c} END`),
            'decouvert = MIN(COALESCE(jeux.decouvert, excluded.decouvert), COALESCE(excluded.decouvert, jeux.decouvert))',
            'source = COALESCE(jeux.source, excluded.source)',
            'sponsor = NULLIF(MAX(COALESCE(jeux.sponsor, 0), COALESCE(excluded.sponsor, 0)), 0)',
            'record = MAX(COALESCE(jeux.record, 0), COALESCE(excluded.record, 0))',
        ];
        let jeux = 0;
        if (tables.has('jeux')) {
            const n = db.prepare('SELECT COUNT(*) AS n FROM s.jeux').get().n;
            transaction(db, () => {
                db.exec(`INSERT INTO jeux (${COLONNES.join(', ')}) SELECT ${COLONNES.join(', ')} FROM s.jeux WHERE true
                 ON CONFLICT(id) DO UPDATE SET ${maj.join(', ')}`);
                // Favoris : toujours suivis de près ici, même si le serveur ne les suit plus.
                db.exec("UPDATE jeux SET suivi = 1 WHERE suivi = 0 AND id IN (SELECT CAST(cle AS INTEGER) FROM favoris WHERE type = 'jeu')");
            });
            jeux = n;
            await ceder();
        }
        let releves = 0;
        if (tables.has('releves')) {
            const b = db.prepare('SELECT MIN(rowid) AS a, MAX(rowid) AS b FROM s.releves').get();
            const st = db.prepare(`INSERT INTO releves (jeu, t, joueurs, visites)
         SELECT r.jeu, r.t, r.joueurs, r.visites FROM s.releves r
         WHERE r.rowid BETWEEN ? AND ? AND r.t >= ? AND NOT EXISTS (SELECT 1 FROM releves x WHERE x.jeu = r.jeu AND x.t = r.t)`);
            for (let i = b.a ?? 1; b.b !== null && i <= b.b; i += 50_000) {
                transaction(db, () => {
                    releves += Number(st.run(i, i + 49_999, relevesDepuis).changes);
                });
                await ceder();
            }
        }
        if (tables.has('jours'))
            transaction(db, () => db.exec(`INSERT INTO jours (jeu, jour, mediane, max, n) SELECT jeu, jour, mediane, max, n FROM s.jours WHERE true
                 ON CONFLICT(jeu, jour) DO UPDATE SET mediane = excluded.mediane, max = excluded.max, n = excluded.n WHERE excluded.n > jours.n`));
        if (tables.has('createurs'))
            db.exec(`INSERT INTO createurs (cle, verifieLe) SELECT cle, verifieLe FROM s.createurs WHERE true
               ON CONFLICT(cle) DO UPDATE SET verifieLe = MAX(createurs.verifieLe, excluded.verifieLe)`);
        let premier = null;
        if (tables.has('meta')) {
            const p = db.prepare("SELECT valeur FROM s.meta WHERE cle = 'premierReleve'").get();
            premier = Number(p?.valeur) || null;
        }
        return { jeux, releves, premier };
    }
    finally {
        db.exec('DETACH DATABASE s');
    }
}
//# sourceMappingURL=radarPartage.js.map