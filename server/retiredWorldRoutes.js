'use strict';

// Other ship, nation, exploration and real-store routes remain available.
const RETIRED_WORLD_ROUTES = new Set([
    '/api/create-ship',
    '/api/consume-ship-broadside',
    '/api/respawn-ship',
    '/api/get-ship-position',
    '/api/start-ship-voyage',
    '/api/stop-ship',
    '/api/get-ships-in-view',
    '/api/get-capital-war-state',
    '/api/nation-war-capital-action',
    '/api/nation-war-deploy',
    '/api/nation-war-prepare-strike',
    '/api/nation-war-intercept',
    '/api/nation-war-raid-treasury',
    '/api/get-map-occupation',
    '/api/get-map-occupation-map',
    '/api/get-world-map-layout',
    '/api/swap-world-map-cells'
]);

function retiredWorldRoutes(req, res, next) {
    const path = String(req.path || '').toLowerCase().replace(/\/+$/, '');
    if (!RETIRED_WORLD_ROUTES.has(path)) return next();
    return res.status(410).json({ error: 'OnlineWorldRetired' });
}

module.exports = { retiredWorldRoutes, RETIRED_WORLD_ROUTES };
