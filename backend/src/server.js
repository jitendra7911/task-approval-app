const config = require('./config');
const { createApp } = require('./app');

config.getJwtSecret(); // fail fast if not configured
createApp().listen(config.port, () => console.log(`Server listening on port ${config.port}`));
