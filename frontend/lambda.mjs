import awsServerlessExpress from 'aws-serverless-express';
import { app } from './server.js';

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

const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);

export const handler = (event, context) => {
    console.log('Lambda invocation event:', JSON.stringify({
        path: event.path,
        httpMethod: event.httpMethod,
        resource: event.resource,
        requestContext: event.requestContext ? {
            path: event.requestContext.path,
            stage: event.requestContext.stage
        } : 'No requestContext'
    }, null, 2));

    return awsServerlessExpress.proxy(server, event, context);
};
