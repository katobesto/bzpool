// Servidor Node.js + Express para el juego de billar.
// Sirve los archivos estáticos (html, js, css) de la carpeta public/
// y la carpeta music/ (mp3 de música de fondo) a través del puerto 3000.
const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Sirve los archivos estáticos (index.html, js, css, imágenes) desde public/
app.use(express.static(path.join(__dirname, "public")));

// Música de fondo: carpeta music/ en la raíz del servidor
const MUSIC_DIR = path.join(__dirname, "music");
app.use("/music", express.static(MUSIC_DIR));

// Web service dinámico: lista los MP3 disponibles en music/
// (cualquier mp3 nuevo que se ponga en esa carpeta aparece aquí sin reiniciar)
app.get("/api/music", (req, res) => {
  try {
    const files = fs
      .readdirSync(MUSIC_DIR)
      .filter((f) => f.toLowerCase().endsWith(".mp3"))
      .sort((a, b) => a.localeCompare(b));
    res.json(files);
  } catch (e) {
    res.json([]); // carpeta inexistente o sin permisos → lista vacía
  }
});

// Redirige cualquier otra ruta a la página del juego (SPA-like)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n  🎱  Billar 8 en marcha`);
  console.log(`  Abre en el navegador:  http://localhost:${PORT}`);
  console.log(`  Música de fondo:      http://localhost:${PORT}/music/  (pon tus MP3 en ./music)\n`);
});