const axios = require('axios');
require('dotenv').config();

(async () => {
    const url = 'https://api.mercadolibre.com/oauth/token';

    const payload = {
        grant_type: 'authorization_code',
        client_id: process.env.ML_APP_ID,
        client_secret: process.env.ML_CLIENT_SECRET,

        // 👇 TG NOVO (O SEU)
        code: 'TG-69697c0d0662eb000186a3a0-1608350914',

        redirect_uri: 'https://www.google.com',

        // 👇 CODE VERIFIER QUE VOCÊ GEROU
        code_verifier: 'fzZDT15w4FTW2ns315OTwCozr3b3LklGUSoFp0WDl-0'
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

        console.log('\n✅ TOKEN GERADO COM SUCESSO');
        console.log(response.data);

    } catch (err) {
        console.error('\n❌ ERRO AO TROCAR TG');
        console.error(err.response?.data || err.message);
    }
})();
