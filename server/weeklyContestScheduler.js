// server/weeklyContestScheduler.js
// 週次争奪ウィンドウ自動スケジューラ
//
// 毎週日曜 21:00 JST (UTC 12:00) に /api/weekly-contest/open を呼び出し、
// 毎週日曜 22:00 JST (UTC 13:00) に /api/weekly-contest/close を呼び出す。

const cron  = require('node-cron');
const http  = require('http');
const https = require('https');

const OPEN_CRON  = '0 12 * * 0'; // 日曜 21:00 JST
const CLOSE_CRON = '0 13 * * 0'; // 日曜 22:00 JST

function getBaseUrl() {
    return process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
}

function adminHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_SECRET || '',
    };
}

function callContestEndpoint(path) {
    return new Promise((resolve) => {
        const base    = getBaseUrl();
        const isHttps = base.startsWith('https');
        const client  = isHttps ? https : http;
        const url     = `${base}${path}`;
        const headers = adminHeaders();

        const req = client.request(url, { method: 'POST', headers }, (res) => {
            let body = '';
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    if (res.statusCode >= 300) {
                        console.error(`[weekly-contest-scheduler] ${path} failed (${res.statusCode}):`, json);
                    } else {
                        console.log(`[weekly-contest-scheduler] ${path} OK:`, json);
                    }
                } catch {
                    console.error(`[weekly-contest-scheduler] ${path} parse error:`, body);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            console.error(`[weekly-contest-scheduler] ${path} error:`, err.message);
            resolve();
        });

        req.end();
    });
}

class WeeklyContestScheduler {
    constructor() {
        this._openJob  = null;
        this._closeJob = null;
    }

    start() {
        this._openJob = cron.schedule(OPEN_CRON, () => {
            console.log('[weekly-contest-scheduler] Opening weekly contest window...');
            callContestEndpoint('/api/weekly-contest/open');
        }, { timezone: 'UTC' });

        this._closeJob = cron.schedule(CLOSE_CRON, () => {
            console.log('[weekly-contest-scheduler] Closing weekly contest window...');
            callContestEndpoint('/api/weekly-contest/close');
        }, { timezone: 'UTC' });

        console.log('[weekly-contest-scheduler] Started — open: Sun 21:00 JST, close: Sun 22:00 JST');
    }

    stop() {
        this._openJob?.stop();
        this._closeJob?.stop();
    }
}

module.exports = { WeeklyContestScheduler };
