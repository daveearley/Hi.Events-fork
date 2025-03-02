import { createServer } from 'aws-serverless-express';

async function loadApp() {
    const { app } = await import('./server.js'); // Dynamically import ESM module

    const binaryMimeTypes = [
        'application/javascript',
        'application/json',
        'application/octet-stream',
        'application/xml',
        'font/eot',
        'font/opentype',
        'font/otf',
        'font/woff',
        'font/woff2',
        'image/jpeg',
        'image/png',
        'image/svg+xml',
        'text/css',
        'text/html',
        'text/javascript',
        'text/plain',
    ];

    const server = createServer(app, null, binaryMimeTypes);

    return async function handler(event, context) {
        console.log('Lambda invocation event:', JSON.stringify({
            path: event.path,
            httpMethod: event.httpMethod,
            resource: event.resource,
            requestContext: event.requestContext ? {
                path: event.requestContext.path,
                stage: event.requestContext.stage
            } : 'No requestContext'
        }, null, 2));

        return createServer.proxy(server, event, context);
    };
}

// Export a dynamically loaded handler
export const handler = async (event, context) => {
    const lambdaHandler = await loadApp();
    return lambdaHandler(event, context);
};
