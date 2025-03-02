import awsServerlessExpress from 'aws-serverless-express';
import { app } from './server.js';

process.env.AWS_EXECUTION_ENV = 'true';

const server = awsServerlessExpress.createServer(app, null, [
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
]);

export const handler = (event, context) => {
    console.log('Lambda invocation event:', JSON.stringify({
        path: event.path,
        httpMethod: event.httpMethod,
        headers: event.headers
    }));

    return awsServerlessExpress.proxy(server, event, context);
};
