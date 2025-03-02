import awsServerlessExpress from 'aws-serverless-express';
import { app } from './server.js';

// Flag that we're running in AWS Lambda environment
process.env.AWS_EXECUTION_ENV = 'true';

// Special handling for AWS Lambda API Gateway events
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

// Log the current working directory and files for debugging
console.log('Current working directory:', process.cwd());
try {
    const fs = require('fs');
    console.log('Directory contents:', fs.readdirSync(process.cwd()));
} catch (err) {
    console.error('Could not read directory:', err);
}

// Create the AWS Lambda server
const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);

// Export the handler for AWS Lambda
export const handler = (event, context) => {
    // Log request for debugging
    console.log('Lambda invocation event:', JSON.stringify({
        path: event.path,
        httpMethod: event.httpMethod,
        resource: event.resource,
        requestContext: event.requestContext ? {
            path: event.requestContext.path,
            stage: event.requestContext.stage
        } : 'No requestContext'
    }, null, 2));

    // Detect if this is an Amplify Hosting event and modify if needed
    if (event.requestContext && event.requestContext.path) {
        console.log("Detected Amplify Hosting event");
    }

    // Return a promise to properly handle Lambda async context
    return awsServerlessExpress.proxy(server, event, context);
};
