const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function refreshMLToken() {
    const url = 'https://api.mercadolibre.com/oauth/token'; // ✅ DOMÍNIO CORRETO
    const envPath = path.resolve(__dirname, '../../.env');

    const payload = {
        grant_type: 'refresh_token',
        client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        refresh_token: process.env.ML_REFRESH_TOKEN
    };

    try {
        const response = await axios.post(
            url,
            new URLSearchParams(payload).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, refresh_token } = response.data;

        let envContent = fs.readFileSync(envPath, 'utf8');

        envContent = envContent.replace(
            /ML_ACCESS_TOKEN=.*/,
            `ML_ACCESS_TOKEN=${access_token}`
        );

        envContent = envContent.replace(
            /ML_REFRESH_TOKEN=.*/,
            `ML_REFRESH_TOKEN=${refresh_token}`
        );

        fs.writeFileSync(envPath, envContent);

        process.env.ML_ACCESS_TOKEN = access_token;
        process.env.ML_REFRESH_TOKEN = refresh_token;

        console.log('✅ AUTO-TOKEN: Renovado com sucesso!');
        return access_token;
    } catch (error) {
        if (
            process.env.ML_REFRESH_TOKEN &&
            process.env.ML_REFRESH_TOKEN.startsWith('TG-')
        ) {
            return await exchangeInitialCode();
        }

        console.error('❌ Falha ao renovar token:', error.response?.data || error.message);
        return null;
    }
}

async function exchangeInitialCode() {
    const url = 'https://api.mercadolibre.com/oauth/token'; // ✅ DOMÍNIO CORRETO
    const envPath = path.resolve(__dirname, '../../.env');

    const payload = {
        grant_type: 'authorization_code',
        client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_CLIENT_SECRET,
        code: process.env.ML_REFRESH_TOKEN,
        redirect_uri: 'https://www.google.com'
    };

    try {
        const response = await axios.post(
            url,
            new URLSearchParams(payload).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const { access_token, refresh_token } = response.data;

        let envContent = fs.readFileSync(envPath, 'utf8');

        envContent = envContent.replace(
            /ML_ACCESS_TOKEN=.*/,
            `ML_ACCESS_TOKEN=${access_token}`
        );

        envContent = envContent.replace(
            /ML_REFRESH_TOKEN=.*/,
            `ML_REFRESH_TOKEN=${refresh_token}`
        );

        fs.writeFileSync(envPath, envContent);

        process.env.ML_ACCESS_TOKEN = access_token;
        process.env.ML_REFRESH_TOKEN = refresh_token;

        console.log('✅ TOKEN INICIAL GERADO E SALVO!');
        return access_token;
    } catch (e) {
        console.error('❌ Erro na geração inicial:', e.response?.data || e.message);
        return null;
    }
}

module.exports = { refreshMLToken };
