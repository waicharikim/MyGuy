"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const environment_1 = require("./config/environment");
async function bootstrap() {
    (0, environment_1.validateProductionEnvironment)(process.env);
    const app = await core_1.NestFactory.create(app_module_1.AppModule, { rawBody: true });
    app.use((_request, response, next) => {
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("X-Frame-Options", "DENY");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        if (process.env.NODE_ENV === "production") {
            response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        }
        next();
    });
    app.enableShutdownHooks();
    const port = Number(process.env.PORT || 3000);
    await app.listen(port);
    console.log(`Shauri API listening on ${port}`);
}
bootstrap();
