import { defineConfig } from "drizzle-kit";
import env from "./env";

export default defineConfig({
    //db connection
    dialect: "postgresql",
    dbCredentials: {
        url: env.DATABASE_URL
    },
    //schema acepta todos los archivos ts dentro de la carpeta schemas, no es necesario importarlos en el connection.ts
    schema: "./src/db/schemas/*.ts",
    //migrations
    out: "./migrations",
    //sql verbose logging
    verbose: true,
    //strict mode
    strict: true
});