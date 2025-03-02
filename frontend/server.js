import express from "express";
import {installGlobals} from "@remix-run/node";
import process from "process";
import {createServer as viteServer} from "vite";
import compression from "compression";
import fs from "node:fs/promises";
import sirv from "sirv";
import cookieParser from "cookie-parser";
import path from "node:path";
import {fileURLToPath} from "node:url";
import * as nodePath from "node:path";
import * as nodeUrl from "node:url";

installGlobals();

// Get the current file directory
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Environment configuration
const base = process.env.BASE || "/";
const port = process.argv.includes("--port")
    ? process.argv[process.argv.indexOf("--port") + 1]
    : process.env.NODE_PORT || 5678;
const isProduction = process.env.NODE_ENV === "production";
const isAWSLambda = process.env.AWS_EXECUTION_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME;

// Handle paths differently between local dev, production, and AWS Lambda
const resolvePath = (relativePath) => {
    // In AWS Lambda, the working directory structure might be different
    if (isAWSLambda) {
        return path.join(process.cwd(), relativePath);
    }
    return path.join(__dirname, relativePath);
};

// Read template and manifest files
const getTemplateHtml = async () => {
    if (isProduction) {
        try {
            return await fs.readFile(resolvePath("./dist/client/index.html"), "utf-8");
        } catch (err) {
            // Fallback to direct path if the above fails
            return await fs.readFile(resolvePath("./client/index.html"), "utf-8");
        }
    }
    return "";
};

const getSsrManifest = async () => {
    if (isProduction) {
        try {
            const manifestPath = resolvePath("./dist/client/.vite/ssr-manifest.json");
            return await fs.readFile(manifestPath, "utf-8");
        } catch (err) {
            try {
                // Fallback to direct path if the above fails
                const manifestPath = resolvePath("./client/.vite/ssr-manifest.json");
                return await fs.readFile(manifestPath, "utf-8");
            } catch (secondErr) {
                console.warn("Could not find SSR manifest:", secondErr.message);
                return undefined;
            }
        }
    }
    return undefined;
};

// Initialize template and manifest
let templateHtml = "";
let ssrManifest = undefined;

// Function to dynamically import modules (works in different environments)
const dynamicImport = async (importPath) => {
    const resolvedPath = nodePath.isAbsolute(importPath)
        ? nodeUrl.pathToFileURL(importPath).toString()
        : importPath;

    try {
        return await import(resolvedPath);
    } catch (error) {
        console.error(`Failed to import from ${resolvedPath}:`, error);
        throw error;
    }
};

// Create Express app
const app = express();
app.use(cookieParser());

// Configure well-known paths
app.use('/.well-known', express.static(resolvePath('public/.well-known')));

// Initialize Vite or set up production middleware
let vite;

// Get environment variables for Vite
const getViteEnvironmentVariables = () => {
    const envVars = {};
    for (const key in process.env) {
        if (key.startsWith('VITE_')) {
            envVars[key] = process.env[key];
        }
    }
    return JSON.stringify(envVars);
};

// Initialize app
const initializeApp = async () => {
    // Load template and manifest
    templateHtml = await getTemplateHtml();
    ssrManifest = await getSsrManifest();

    if (!isProduction) {
        vite = await viteServer({
            server: {middlewareMode: true},
            appType: "custom",
            base,
        });

        app.use(vite.middlewares);
    } else {
        app.use(compression());

        // Try different client paths for serving static files
        const clientPaths = [
            "./dist/client",
            "./client",
        ];

        // Use the first path that exists
        for (const clientPath of clientPaths) {
            try {
                await fs.access(resolvePath(clientPath));
                app.use(base, sirv(resolvePath(clientPath), {extensions: []}));
                console.log(`Static files served from: ${clientPath}`);
                break;
            } catch (err) {
                console.log(`Path ${clientPath} not accessible, trying next...`);
            }
        }
    }

    // Set up the main route handler
    app.use("*", async (req, res) => {
        const url = req.originalUrl.replace(base, "");

        try {
            let template;
            let render;

            if (!isProduction) {
                template = await fs.readFile(resolvePath("./index.html"), "utf-8");
                template = await vite.transformIndexHtml(url, template);
                render = (await vite.ssrLoadModule("/src/entry.server.tsx")).render;
            } else {
                template = templateHtml;

                // Try different server paths for importing
                const serverPaths = [
                    resolvePath("./dist/server/entry.server.js"),
                    resolvePath("./server/entry.server.js"),
                    "./dist/server/entry.server.js",
                    "./server/entry.server.js",
                ];

                let serverModule = null;
                let loadedPath = null;

                // Try each path until one works
                for (const serverPath of serverPaths) {
                    try {
                        serverModule = await dynamicImport(serverPath);
                        loadedPath = serverPath;
                        break;
                    } catch (err) {
                        console.log(`Failed to import from ${serverPath}, trying next...`);
                    }
                }

                if (!serverModule) {
                    throw new Error("Could not load server entry module from any path");
                }

                console.log(`Server module loaded from: ${loadedPath}`);
                render = serverModule.render;
            }

            const {appHtml, dehydratedState, helmetContext} = await render(
                {req, res},
                ssrManifest ? JSON.parse(ssrManifest) : undefined
            );

            const stringifiedState = JSON.stringify(dehydratedState || {});

            const helmetHtml = helmetContext && helmetContext.helmet
                ? Object.values(helmetContext.helmet)
                    .map((value) => value.toString() || "")
                    .join(" ")
                : "";

            const envVariablesHtml = `<script>window.hievents = ${getViteEnvironmentVariables()};</script>`;

            const headSnippets = [];
            if (process.env.VITE_FATHOM_SITE_ID) {
                headSnippets.push(`
                    <script src="https://cdn.usefathom.com/script.js" data-spa="auto" data-site="${process.env.VITE_FATHOM_SITE_ID}" defer></script>
                `);
            }

            const html = template
                .replace("<!--head-snippets-->", headSnippets.join("\n"))
                .replace("<!--app-html-->", appHtml)
                .replace("<!--dehydrated-state-->", `<script>window.__REHYDRATED_STATE__ = ${stringifiedState}</script>`)
                .replace("<!--environment-variables-->", envVariablesHtml)
                .replace(/<!--render-helmet-->.*?<!--\/render-helmet-->/s, helmetHtml);

            res.setHeader("Content-Type", "text/html");
            return res.status(200).end(html);
        } catch (error) {
            if (error instanceof Response) {
                if (error.status >= 300 && error.status < 400) {
                    return res.redirect(error.status, error.headers.get("Location") || "/");
                } else {
                    return res.status(error.status).send(await error.text());
                }
            }

            console.error("Error rendering page:", error);
            res.status(500).send("Internal Server Error");
        }
    });

    // Start the server if not running in AWS Lambda
    if (isAWSLambda) {
        console.info("Running in AWS Lambda mode");
    } else {
        app.listen(port, () => {
            console.info(`SSR Serving at http://localhost:${port}`);
        });
    }
};

// Initialize the application
initializeApp().catch(console.error);

export { app };
