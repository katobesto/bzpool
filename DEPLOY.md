# Despliegue en VPS con Docker + Coolify

Esta guía explica cómo desplegar bzPool (billar 8 para dos jugadores) en un
servidor VPS usando [Coolify](https://coolify.io), la alternativa auto-hospedada a
Heroku/Railway.

## Requisitos previos

- Un **VPS** con Ubuntu 20.04+ (o similar) con al menos **1 GB de RAM**
- Docker y Docker Compose instalados en el VPS
- Una cuenta de [Coolify](https://coolify.io) o Coolify instalado en tu propio servidor
- El repositorio de GitHub: `github.com/katobesto/bzpool`

---

## Arquitectura

Un **único contenedor** que sirve todo:

```
┌───────────────  Contenedor (puerto 3000) ───────────────┐
│                                                         │
│   Node.js (server.js)                                   │
│   ├── /*           → Frontend estático (public/)       │
│   ├── /music       → MP3 de música de fondo             │
│   ├── /api/music   → Lista dinámica de canciones        │
│   └── /health      → Healthcheck JSON                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
        ↑
    https://billar.tudominio.com   (ajusta a tu dominio)
```

El servidor Node sirve el juego estático, la carpeta de música y el listado de
canciones. Coolify gestiona un solo contenedor — sin nginx intermedio, sin
docker-compose, sin complicaciones.

> **Música de fondo:** las canciones son los `.mp3` que haya en la carpeta
> `music/` **dentro de la imagen Docker** (Coolify construye el contenedor a
> partir del repositorio de GitHub). Para que una canción suene en el deploy
> debe estar **commiteada en el repo** (si usas un repo privado no es problema;
> si prefieres no subirla, quítala de `.gitignore` solo para ese archivo).

---

## Paso 1: Instalar Coolify (si no lo tienes ya)

```bash
ssh root@tu-servidor-ip

# Instala Coolify automáticamente
curl -fsSL https://get.coollabs.io/coolify/install.sh | bash
```

La instalación instalará Docker, Docker Compose y configurará toda la
infraestructura. Al finalizar tendrás acceso al dashboard en `https://<tu-servidor-ip>`.

---

## Paso 2: Conectar tu servidor a Coolify

1. Abre el dashboard de Coolify
2. Ve a **Servers** → **Add Server**
3. Si Coolify está en el mismo servidor, usa la conexión local (localhost)
4. Si usas Coolify cloud, introduce la IP del VPS y las credenciales SSH

---

## Paso 3: Conectar tu cuenta de GitHub

1. En Coolify ve a **Settings** → **Git Providers**
2. Selecciona **GitHub** y conecta tu cuenta (o usa un token personal)
3. Asegúrate de que el repositorio `katobesto/bzpool` es visible

---

## Paso 4: Crear el recurso de despliegue

1. Ve a **Projects** → crea o selecciona un proyecto
2. Haz clic en **Add Resource** → **Application**
3. Selecciona tu repositorio GitHub y la rama `main`
4. En **Build Pack**, selecciona manualmente **Dockerfile** (Coolify lo detecta
   automáticamente al ver el `Dockerfile` en la raíz)
5. Haz clic en **Deploy**

---

## Paso 5: Configurar Container Port y dominio

En la página del recurso de Coolify:

### A) General → Container Port → `3000`

Esto es **crítico**: le dice al proxy interno (Traefik) que enrute el tráfico
HTTP al puerto 3000 donde escucha Node dentro del contenedor. Sin esto, no
podrás acceder a la app.

### B) Variables de entorno

No se necesitan. El servidor usa `PORT` (ya fijada a 3000 en el Dockerfile) y
no requiere secretos.

### C) Dominio → `https://billar.tudominio.com` (ajusta al tuyo)

- El dominio debe ser SOLO el FQDN, **sin puerto**
- Coolify enruta automáticamente del 443 al Container Port (3000)
- Configura el DNS apuntando al IP de tu VPS (registro A)
- Coolify generará automáticamente el certificado SSL con Let's Encrypt

---

## Paso 6: Desplegar

Haz clic en **Deploy** y observa los logs. Los primeros despliegues tardan más
porque deben construir la imagen Docker.

Cuando termine, deberías ver algo como:

```
🎱  Billar 8 en marcha
  Abre en el navegador:  http://localhost:3000
```

---

## Redeploy / Actualizar

Cada vez que hagas push a `main` en GitHub:
- Si has activado **Auto Deploy**, Coolify reconstruirá y desplegará solo
- Si no, ve a la página del recurso y haz clic en **Redeploy**

> Para añadir **música nueva al deploy**: sube el `.mp3` a `music/` en el
> repositorio, haz push, y el redploy incluirá la canción en `/api/music`.

---

## Logs y monitorización

Coolify incluye un visor de logs integrado. El endpoint `/health` responde con
JSON indicando si el servidor está operativo:

```bash
curl https://billar.tudominio.com/health
# {"ok":true,"game":"billar-8","mp3":2}
```

---

## Troubleshooting

### La página no carga / pantalla en blanco / error 502
- **Container Port**: es el paso más importante. Debe ser `3000` en
  General → Container Port. Sin esto, Traefik no sabe dónde enrutar el tráfico.
- **Dominio sin puerto**: solo `https://billar.tudominio.com`, nunca `:3000`.
- Revisa los logs del contenedor en Coolify para ver errores al arrancar.

### No suena la música
- Comprueba que el `.mp3` está en el repo: Coolify construye la imagen a partir
  de GitHub, no de tu máquina local.
- Verifica con `curl https://tu-dominio/api/music` que la lista no está vacía.
- El navegador puede bloquear el autoplay hasta que el usuario pulsa
  "Empezar" en la pantalla de inicio (comportamiento normal).

### SSL no funciona
Coolify configura Let's Encrypt automáticamente. Asegúrate de que el DNS
apunta a tu servidor antes de activar SSL.

---

## Comandos útiles

```bash
# Acceder al shell del contenedor para debug:
docker exec -it <container-id> sh

# Reiniciar el servicio:
docker restart <container-id>

# Ver logs del contenedor:
docker logs -f <container-id>
```