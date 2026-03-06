// back/services/useDatabaseAuthState.js
//
// Substitui o `useMultiFileAuthState` do Baileys por uma implementação
// que lê e escreve as chaves criptográficas diretamente no MongoDB,
// com isolamento total por userId.

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

function serialize(value) {
  return JSON.stringify(value, BufferJSON.replacer);
}

function deserialize(value) {
  if (value === null || value === undefined) return undefined;
  try {
    return JSON.parse(value, BufferJSON.reviver);
  } catch (e) {
    return undefined;
  }
}

/**
 * @param {string} userId    - auth.uid() do Supabase — OBRIGATÓRIO para isolamento
 * @param {string} sessionId - ID da sessão WA
 * @param {Model}  CredsModel
 * @param {Model}  KeysModel
 */
async function useDatabaseAuthState(userId, sessionId, CredsModel, KeysModel) {
  if (!userId) throw new Error('[useDatabaseAuthState] userId é obrigatório');

  // ── Carregar ou criar credenciais ──────────────────────────────────
  let creds;
  const savedCreds = await CredsModel.findOne({ userId, sessionId });

  if (savedCreds?.creds) {
    try {
      creds = deserialize(savedCreds.creds);
      console.log(`🔑 [Auth] Creds carregadas: userId=${userId} session=${sessionId}`);
    } catch (e) {
      console.warn(`⚠️ [Auth] Erro ao desserializar creds, reiniciando sessão`);
      creds = initAuthCreds();
    }
  } else {
    creds = initAuthCreds();
    console.log(`🆕 [Auth] Novas creds criadas: userId=${userId} session=${sessionId}`);
  }

  // ── Salvar credenciais ─────────────────────────────────────────────
  const saveCreds = async () => {
    try {
      await CredsModel.findOneAndUpdate(
        { userId, sessionId },
        { userId, sessionId, creds: serialize(creds), updatedAt: new Date() },
        { upsert: true, new: true }
      );
    } catch (error) {
      console.error(`❌ [Auth] Erro ao salvar creds userId=${userId} session=${sessionId}:`, error.message);
    }
  };

  // ── Key Store com filtro por userId ───────────────────────────────
  const keys = {
    get: async (type, ids) => {
      const result = {};
      try {
        const docs = await KeysModel.find({
          userId,
          sessionId,
          type,
          keyId: { $in: ids.map(String) }
        }).lean();

        for (const doc of docs) {
          const value = deserialize(doc.data);
          if (value !== undefined) result[doc.keyId] = value;
        }
      } catch (error) {
        console.error(`❌ [Auth] Erro ao ler chaves (${type}) userId=${userId}:`, error.message);
      }
      return result;
    },

    set: async (data) => {
      const bulkOps = [];

      for (const [type, typeData] of Object.entries(data)) {
        for (const [keyId, value] of Object.entries(typeData)) {
          if (value === null || value === undefined) {
            bulkOps.push({
              deleteOne: {
                filter: { userId, sessionId, type, keyId: String(keyId) }
              }
            });
          } else {
            bulkOps.push({
              updateOne: {
                filter: { userId, sessionId, type, keyId: String(keyId) },
                update: {
                  $set: {
                    userId,
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
          if (error.code !== 11000) {
            console.error(`❌ [Auth] Erro ao salvar chaves userId=${userId}:`, error.message);
          }
        }
      }
    }
  };

  return { state: { creds, keys }, saveCreds };
}

async function deleteAuthState(userId, sessionId, CredsModel, KeysModel) {
  try {
    await Promise.all([
      CredsModel.deleteOne({ userId, sessionId }),
      KeysModel.deleteMany({ userId, sessionId })
    ]);
    console.log(`🗑️ [Auth] Chaves removidas: userId=${userId} session=${sessionId}`);
  } catch (error) {
    console.error(`❌ [Auth] Erro ao deletar auth state:`, error.message);
  }
}

async function hasAuthState(userId, sessionId, CredsModel) {
  try {
    const doc = await CredsModel.findOne({ userId, sessionId }).lean();
    return !!doc;
  } catch (e) {
    return false;
  }
}

module.exports = { useDatabaseAuthState, deleteAuthState, hasAuthState };