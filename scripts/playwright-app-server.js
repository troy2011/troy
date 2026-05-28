const port = Number(process.argv[2] || process.env.PORT || 4173);

process.env.PORT = String(port);

require('../server.js');
