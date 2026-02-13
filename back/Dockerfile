# Use a imagem oficial do Playwright que já tem tudo instalado
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

# Definir diretório de trabalho
WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar TODAS as dependências (incluindo dev)
RUN npm ci

# Copiar todo o código
COPY . .

# Expor porta (Render usa variável PORT)
EXPOSE 10000

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV PORT=10000

# Comando de inicialização
CMD ["npm", "start"]