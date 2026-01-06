// c:/Users/ikeda/my-liff-app/public/js/playfabClient.js

import { callApiWithLoader } from './api.js';

export { callApiWithLoader };

export async function playfabRequest(endpoint, body, options) {
    return callApiWithLoader(endpoint, body, options);
}
