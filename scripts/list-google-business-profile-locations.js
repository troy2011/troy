require('dotenv').config();

const {
    createGoogleBusinessProfileClient,
    readGoogleBusinessProfileConfig
} = require('../server/googleBusinessProfile');

function formatAddress(address) {
    if (!address || typeof address !== 'object') return '';
    return [
        ...(Array.isArray(address.addressLines) ? address.addressLines : []),
        address.locality,
        address.administrativeArea,
        address.postalCode,
        address.regionCode
    ].map((value) => String(value || '').trim()).filter(Boolean).join(' ');
}

async function main() {
    const discoveryEnv = {
        ...process.env,
        GOOGLE_BUSINESS_PROFILE_SYNC_ENABLED: 'true',
        GOOGLE_BUSINESS_PROFILE_LOCATION_NAME: process.env.GOOGLE_BUSINESS_PROFILE_LOCATION_NAME
            || process.env.GOOGLE_BUSINESS_PROFILE_LOCATION_ID
            || 'locations/discovery'
    };
    const config = readGoogleBusinessProfileConfig(discoveryEnv);
    const credentialKeys = [
        'GOOGLE_OAUTH_CLIENT_ID',
        'GOOGLE_OAUTH_CLIENT_SECRET',
        'GOOGLE_OAUTH_REFRESH_TOKEN'
    ];
    const missingCredentials = credentialKeys.filter((key) => !String(process.env[key] || '').trim());
    if (missingCredentials.length > 0) {
        throw new Error(`OAuth環境変数が不足しています: ${missingCredentials.join(', ')}`);
    }

    const client = createGoogleBusinessProfileClient({ config });
    const locations = [];
    let pageToken = '';
    for (let page = 0; page < 20; page += 1) {
        const response = await client.listLocations({ pageSize: 100, pageToken });
        locations.push(...(Array.isArray(response?.locations) ? response.locations : []));
        pageToken = String(response?.nextPageToken || '').trim();
        if (!pageToken) break;
    }

    if (locations.length === 0) {
        console.log('このGoogleアカウントで管理できるBusiness Profile店舗は見つかりませんでした。');
        return;
    }

    const output = locations.map((location) => ({
        name: String(location?.name || ''),
        title: String(location?.title || ''),
        storeCode: String(location?.storeCode || ''),
        placeId: String(location?.metadata?.placeId || ''),
        address: formatAddress(location?.storefrontAddress)
    }));
    console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
    console.error(`Google Business Profile店舗一覧の取得に失敗しました: ${error?.message || error}`);
    process.exitCode = 1;
});
