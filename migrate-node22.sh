#!/bin/bash

echo "🚀 Iniciando migración a Node.js 22..."

# Verificar si nvm está instalado
if ! command -v nvm &> /dev/null; then
    echo "❌ nvm no está instalado. Por favor instala nvm primero."
    echo "📖 Guía: https://github.com/nvm-sh/nvm#installing-and-updating"
    exit 1
fi

# Instalar y usar Node.js 22
echo "📦 Instalando Node.js 22..."
nvm install 22
nvm use 22

# Verificar versión
NODE_VERSION=$(node --version)
echo "✅ Node.js instalado: $NODE_VERSION"

# Limpiar dependencias existentes
echo "🧹 Limpiando dependencias existentes..."
rm -rf node_modules package-lock.json

# Reinstalar dependencias
echo "📥 Reinstalando dependencias..."
npm install

# Verificar que el servidor inicie
echo "🔍 Verificando que el servidor inicie correctamente..."
timeout 10s npm run dev &
SERVER_PID=$!

sleep 5

if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Servidor iniciado correctamente"
    kill $SERVER_PID
else
    echo "❌ Error al iniciar el servidor"
    exit 1
fi

echo ""
echo "🎉 ¡Migración completada exitosamente!"
echo "📋 Próximos pasos:"
echo "   1. Hacer commit de los cambios: git add . && git commit -m 'Migración a Node.js 22'"
echo "   2. Hacer push: git push"
echo "   3. Verificar el build en Vercel"
echo ""
echo "📚 Documentación completa en: migrate-to-node22.md"
