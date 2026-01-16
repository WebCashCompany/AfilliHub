const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * MERCADO LIVRE - GERENCIADOR DE AUTENTICAÇÃO
 * 
 * Responsável por:
 * - Renovar access tokens automaticamente
 * - Gerenciar refresh tokens
 * - Salvar tokens no .env e em arquivo de backup
 */

class MLAuth {
  constructor() {
    this.clientId = process.env.ML_APP_ID;
    this.clientSecret = process.env.ML_CLIENT_SECRET;
    this.accessToken = process.env.ML_ACCESS_TOKEN;
    this.refreshToken = process.env.ML_REFRESH_TOKEN;
    this.envPath = path.resolve(__dirname, '../../.env');
    this.tokensFilePath = path.resolve(__dirname, '../../.ml_tokens.json');
  }

  /**
   * Renova o access token usando refresh token
   */
  async refreshAccessToken() {
    const url = 'https://api.mercadolibre.com/oauth/token';

    const payload = {
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken
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

      // Atualiza tokens em memória
      this.accessToken = access_token;
      this.refreshToken = refresh_token;

      // Salva no .env
      await this.updateEnvFile(access_token, refresh_token);

      // Salva no arquivo de backup
      await this.saveTokensToFile(access_token, refresh_token);

      // Atualiza process.env
      process.env.ML_ACCESS_TOKEN = access_token;
      process.env.ML_REFRESH_TOKEN = refresh_token;

      console.log('✅ Token renovado com sucesso!');
      return access_token;

    } catch (error) {
      // Se refresh token for TG (primeira vez)
      if (this.refreshToken && this.refreshToken.startsWith('TG-')) {
        return await this.exchangeInitialCode();
      }

      console.error('❌ Erro ao renovar token:', error.response?.data || error.message);
      throw new Error('Falha ao renovar access token');
    }
  }

  /**
   * Troca código inicial (TG) por tokens
   */
  async exchangeInitialCode() {
    const url = 'https://api.mercadolibre.com/oauth/token';

    const payload = {
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: this.refreshToken,
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

      // Atualiza tokens
      this.accessToken = access_token;
      this.refreshToken = refresh_token;

      // Salva
      await this.updateEnvFile(access_token, refresh_token);
      await this.saveTokensToFile(access_token, refresh_token);

      process.env.ML_ACCESS_TOKEN = access_token;
      process.env.ML_REFRESH_TOKEN = refresh_token;

      console.log('✅ Tokens iniciais gerados e salvos!');
      return access_token;

    } catch (error) {
      console.error('❌ Erro ao trocar código inicial:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Atualiza tokens no arquivo .env
   */
  async updateEnvFile(accessToken, refreshToken) {
    try {
      let envContent = fs.readFileSync(this.envPath, 'utf8');

      envContent = envContent.replace(
        /ML_ACCESS_TOKEN=.*/,
        `ML_ACCESS_TOKEN=${accessToken}`
      );

      envContent = envContent.replace(
        /ML_REFRESH_TOKEN=.*/,
        `ML_REFRESH_TOKEN=${refreshToken}`
      );

      fs.writeFileSync(this.envPath, envContent);

    } catch (error) {
      console.error('⚠️  Erro ao atualizar .env:', error.message);
    }
  }

  /**
   * Salva tokens em arquivo JSON (backup)
   */
  async saveTokensToFile(accessToken, refreshToken) {
    try {
      const tokens = {
        access_token: accessToken,
        refresh_token: refreshToken,
        updated_at: new Date().toISOString()
      };

      fs.writeFileSync(
        this.tokensFilePath,
        JSON.stringify(tokens, null, 2)
      );

    } catch (error) {
      console.error('⚠️  Erro ao salvar tokens em arquivo:', error.message);
    }
  }

  /**
   * Obtém access token válido (renova se necessário)
   */
  async getValidAccessToken() {
    // Se não tem token, renova
    if (!this.accessToken) {
      console.log('🔄 Token não encontrado, renovando...');
      return await this.refreshAccessToken();
    }

    // TODO: Adicionar verificação de expiração aqui se necessário
    return this.accessToken;
  }

  /**
   * Testa se o token está válido
   */
  async validateToken() {
    try {
      await this.getValidAccessToken();

      const response = await axios.get('https://api.mercadolibre.com/users/me', {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      console.log('✅ Token válido!');
      console.log(`   └─ Usuário: ${response.data.nickname} (ID: ${response.data.id})`);
      
      return true;
    } catch (error) {
      console.error('❌ Token inválido:', error.response?.data || error.message);
      
      // Tenta renovar
      try {
        await this.refreshAccessToken();
        return true;
      } catch (refreshError) {
        return false;
      }
    }
  }
}

module.exports = MLAuth;