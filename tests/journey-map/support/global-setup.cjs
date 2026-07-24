const { startServer } = require('./static-server.cjs');

module.exports = async function globalSetup() {
  const server = await startServer();

  return async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => {
      server.close(resolve);
    });
  };
};
