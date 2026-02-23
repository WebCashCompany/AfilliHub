// back/services/useDatabaseAuthState.js
//
// Substitui o `useMultiFileAuthState` do Baileys por uma implementação
// que lê e escreve as chaves criptográficas diretamente no MongoDB.
//
// RESULTADO: A sessão WhatsApp sobrevive a:
//   - Reinicializações do servidor
//   - Redeploys
//   - Múltiplos PCs/instâncias acessando o mesmo servidor
//
// USO:
//   const { state, saveCreds } = await useDatabaseAuthState(sessionId, CredsModel, KeysModel);
//   const sock = makeWASocket({ auth: state, ... });
//   sock.ev.on('creds.update', saveCreds);

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

/**
 * Serializa um valor para string segura para o MongoDB.
 * Converte Buffers para base64 e mantém outros tipos intactos.
 */
function serialize(value) {
  return JSON.stringify(value, BufferJSON.replacer);
}

/**
 * Desserializa um valor armazenado no MongoDB.
 * Converte strings base64 de volta para Buffer onde necessário.
 */
function deserialize(value) {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.parse(value, BufferJSON.reviver);
  } catch (e) {
    return undefined;
  }
}

/**
 * Cria um auth state persistido no MongoDB, compatível com o Baileys.
 *
 * @param {string} sessionId - Identificador único da sessão
 * @param {Model}  CredsModel - Mongoose model para credenciais (whatsapp_creds)
 * @param {Model}  KeysModel  - Mongoose model para chaves de sinal (whatsapp_keys)
 * @returns {{ state: AuthenticationState, saveCreds: Function }}
 */
async function useDatabaseAuthState(sessionId, CredsModel, KeysModel) {

  // ─────────────────────────────────────────────────────────
  // CARREGAR CREDENCIAIS EXISTENTES (ou criar novas)
  // ─────────────────────────────────────────────────────────
  let creds;
  const savedCreds = await CredsModel.findOne({ sessionId });

  if (savedCreds && savedCreds.creds) {
    try {
      // As creds foram salvas como objeto JSON serializado
      creds = deserialize(savedCreds.creds);
      console.log(`🔑 [Auth] Credenciais carregadas do banco para sessão: ${sessionId}`);
    } catch (e) {
      console.warn(`⚠️ [Auth] Erro ao desserializar creds de ${sessionId}, iniciando do zero`);
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
    console.log(`🆕 [Auth] Novas credenciais criadas para sessão: ${sessionId}`);
  }

  // ─────────────────────────────────────────────────────────
  // FUNÇÃO: SALVAR CREDENCIAIS
  // ─────────────────────────────────────────────────────────
  const saveCreds = async () => {
    try {
      await CredsModel.findOneAndUpdate(
        { sessionId },
        {
          sessionId,
          creds: serialize(creds),
          updatedAt: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`❌ [Auth] Erro ao salvar creds de ${sessionId}:`, error.message);
    }
  };

  // ─────────────────────────────────────────────────────────
  // KEY STORE — Interface que o Baileys espera
  // ─────────────────────────────────────────────────────────
  // O Baileys chama keys.get(type, ids) e keys.set({ [type]: { [id]: value } })
  const keys = {
    /**
     * Lê chaves do banco.
     * @param {string}   type - Tipo da chave (ex: 'pre-key', 'session', etc.)
     * @param {string[]} ids  - IDs das chaves a buscar
     * @returns {Object} Mapa { [id]: value }
     */
    get: async (type, ids) => {
      const result = {};

      try {
        const docs = await KeysModel.find({
          sessionId,
          type,
          keyId: { $in: ids.map(String) }
        }).lean();

        for (const doc of docs) {
          const value = deserialize(doc.data);
          if (value !== undefined) {
            // Para session e sender-key: o Baileys espera proto decodificado
            if (type === 'session') {
              result[doc.keyId] = value;
            } else {
              result[doc.keyId] = value;
            }
          }
        }
      } catch (error) {
        console.error(`❌ [Auth] Erro ao ler chaves (${type}) de ${sessionId}:`, error.message);
      }

      return result;
    },

    /**
     * Escreve chaves no banco.
     * @param {Object} data - { [type]: { [id]: value } }
     */
    set: async (data) => {
      const bulkOps = [];

      for (const [type, typeData] of Object.entries(data)) {
        for (const [keyId, value] of Object.entries(typeData)) {
          if (value === null || value === undefined) {
            // null = deletar a chave
            bulkOps.push({
              deleteOne: {
                filter: { sessionId, type, keyId: String(keyId) }
              }
            });
          } else {
            bulkOps.push({
              updateOne: {
                filter: { sessionId, type, keyId: String(keyId) },
                update: {
                  $set: {
                    sessionId,
                    type,
                    keyId: String(keyId),
                    data: serialize(value),
                    updatedAt: new Date()
                  }
                },
                upsert: true
              }
            });
          }
        }
      }

      if (bulkOps.length > 0) {
        try {
          await KeysModel.bulkWrite(bulkOps, { ordered: false });
        } catch (error) {
          // ignora erros de duplicação (código 11000) pois upsert é idempotente
          if (error.code !== 11000) {
            console.error(`❌ [Auth] Erro ao salvar chaves de ${sessionId}:`, error.message);
          }
        }
      }
    }
  };

  // ─────────────────────────────────────────────────────────
  // RETORNO COMPATÍVEL COM O BAILEYS
  // ─────────────────────────────────────────────────────────
  return {
    state: {
      creds,
      keys
    },
    saveCreds
  };
}

/**
 * Remove todas as chaves e credenciais de uma sessão do banco.
 * Equivalente a deletar a pasta baileys_sessions/<sessionId>.
 *
 * @param {string} sessionId
 * @param {Model}  CredsModel
 * @param {Model}  KeysModel
 */
async function deleteAuthState(sessionId, CredsModel, KeysModel) {
  try {
    await Promise.all([
      CredsModel.deleteOne({ sessionId }),
      KeysModel.deleteMany({ sessionId })
    ]);
    console.log(`🗑️ [Auth] Chaves da sessão ${sessionId} removidas do banco`);
  } catch (error) {
    console.error(`❌ [Auth] Erro ao deletar auth state de ${sessionId}:`, error.message);
  }
}

/**
 * Verifica se existem credenciais salvas para uma sessão.
 * Usado para decidir se o servidor pode tentar reconectar automaticamente.
 *
 * @param {string} sessionId
 * @param {Model}  CredsModel
 * @returns {boolean}
 */
async function hasAuthState(sessionId, CredsModel) {
  try {
    const doc = await CredsModel.findOne({ sessionId }).lean();
    return !!doc;
  } catch (e) {
    return false;
  }
}

module.exports = { useDatabaseAuthState, deleteAuthState, hasAuthState };