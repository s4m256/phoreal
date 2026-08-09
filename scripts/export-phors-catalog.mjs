import { exportCatalog, openCatalog } from "../lib/phors/database.mjs";

const dbPath = process.argv[2] ?? "data/phors-full.sqlite";
const outputPath = process.argv[3] ?? "data/phors-full.json";
const db = openCatalog(dbPath);
exportCatalog(db, outputPath);
db.close();
console.log(JSON.stringify({ db: dbPath, export: outputPath }, null, 2));
