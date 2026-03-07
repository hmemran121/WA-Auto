module.exports = {
    testEnvironment: 'node',
    coverageThreshold: {
        global: {
            branches: 95,
            functions: 95,
            lines: 95,
            statements: 95,
        },
    },
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/jest.config.js',
        '!**/server.js', // We will test logic, server.js is often entry point
    ],
    testTimeout: 30000,
    verbose: true,
};
