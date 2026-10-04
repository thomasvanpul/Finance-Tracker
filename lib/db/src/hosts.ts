// The Neon branch hostnames scripts and the API server guard against. No
// side effects here (unlike ./index.ts, which opens a Pool at import) so
// this can be imported without DATABASE_URL being set.
export const DEV_DB_HOST = "ep-withered-night-abucoq17";
export const PROD_DB_HOST = "ep-dark-hall-ab7g28of";
