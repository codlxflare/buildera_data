# Пошаговая инструкция: выгрузка проекта с GitHub и запуск на сервере

Проект: **macrodata-assistant** (Next.js 14, Node.js).

---

## Что понадобится

- Сервер с SSH-доступом (например, VPS или облачный сервер Beget).
- На сервере: **Node.js 18+** (лучше 20) и **npm** (или **Docker**).
- Репозиторий проекта на GitHub (публичный или с настроенным доступом по SSH-ключу).

---

## Быстрый старт: вы уже на Ubuntu 24.04 и подключены по SSH

Выполняйте команды по порядку **на сервере** в терминале.

### 1. Обновление системы и установка Git (если ещё не стоит)

```bash
sudo apt update && sudo apt install -y git
```

### 2. Установка Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # должно быть v20.x.x
```

### 3. Клонирование репозитория

Подставьте свой репозиторий. Если клонируете в отдельную папку (например, `project`):

```bash
mkdir -p ~/project
cd ~/project
git clone https://github.com/codlxflare/buildera_data.git buildera_data
cd buildera_data
```

Если проект уже лежит в `/root/project/buildera_data`, переходите туда:
```bash
cd /root/project/buildera_data
```

### 4. Создание .env.local

Создайте файл с переменными окружения (ключи и пароли с вашего локального `.env.local`):

```bash
nano .env.local
```

Вставьте те же строки, что и локально (OPENAI_API_KEY, MACRODATA_*, и т.д.), сохраните: **Ctrl+O**, Enter, **Ctrl+X**. Затем:

```bash
chmod 600 .env.local
```

### 5. Сборка и запуск

```bash
npm ci
npm run build
npm run start
```

Проверьте в браузере: `http://IP_ВАШЕГО_СЕРВЕРА:3000`. Остановка — **Ctrl+C**.

### 6. Постоянный запуск через PM2

```bash
sudo npm install -g pm2
pm2 start npm --name "macrodata-assistant" -- start
pm2 save
pm2 startup
```

Команду, которую выведет `pm2 startup`, выполните (она будет вида `sudo env PATH=...`). После перезагрузки сервера приложение поднимется само.

Дальше: обновление кода — [Часть 5](#часть-5-обновление-проекта-с-github), домен и Nginx — [Часть 6](#часть-6-доступ-по-домену-nginx-опционально).

---

## Часть 1. Получить код с GitHub на сервер

### Способ A: Клонирование через Git (рекомендуется)

Подключаемся к серверу по SSH (подставьте свой логин и хост):

```bash
ssh ВАШ_ЛОГИН@ВАШ_СЕРВЕР
```

Устанавливаем Git, если его нет (на Ubuntu/Debian):

```bash
sudo apt update
sudo apt install -y git
```

Клонируем репозиторий. Замените `ССЫЛКА_НА_РЕПО` на реальный URL:

**Публичный репозиторий (HTTPS):**
```bash
cd ~
git clone https://github.com/ВАШ_USERNAME/ВАШ_РЕПОЗИТОРИЙ.git buildera_data
cd buildera_data
```

**Публичный репозиторий (SSH, если ключ уже добавлен на GitHub):**
```bash
cd ~
git clone git@github.com:ВАШ_USERNAME/ВАШ_РЕПОЗИТОРИЙ.git buildera_data
cd buildera_data
```

**Приватный репозиторий:** на сервере должен быть настроен SSH-ключ и добавлен в GitHub (Settings → SSH and GPG keys), затем используйте `git clone git@github.com:...`.

Проверка:
```bash
ls -la
# Должны быть: package.json, app/, next.config.js, Dockerfile и т.д.
```

---

### Способ B: Загрузка архива или файлов вручную

Если на сервере нет Git или репозиторий приватный без доступа с сервера:

1. **Локально** (на своём компьютере) создайте архив **без** `node_modules`, `.next`, `.env.local`:

   ```bash
   cd /Users/coldxflare/Desktop/buildera_data
   tar --exclude='node_modules' --exclude='.next' --exclude='.git' --exclude='.env*' --exclude='logs' -czvf buildera_data.tar.gz .
   ```

2. Загрузите архив на сервер (подставьте логин и хост):

   ```bash
   scp buildera_data.tar.gz ВАШ_ЛОГИН@ВАШ_СЕРВЕР:~/
   ```

3. На сервере распакуйте и перейдите в каталог:

   ```bash
   ssh ВАШ_ЛОГИН@ВАШ_СЕРВЕР
   mkdir -p ~/buildera_data
   cd ~/buildera_data
   tar -xzvf ~/buildera_data.tar.gz
   ```

---

## Часть 2. Настройка окружения на сервере

### Шаг 1. Node.js

Проверка:
```bash
node -v   # должно быть v18 или v20
npm -v
```

Если Node нет (Ubuntu/Debian), установите Node 20:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Шаг 2. Переменные окружения (.env)

Секреты в репозиторий не попадают. Создайте на сервере файл `.env.local` в корне проекта:

```bash
cd ~/buildera_data   # или путь, куда положили проект
nano .env.local
```

Вставьте те же переменные, что и локально (из вашего `.env.local`), с **продакшен-значениями**:

- `OPENAI_API_KEY=...`
- `MACRODATA_AUTH_LOGIN=...`
- `MACRODATA_AUTH_PASSWORD=...`
- `MACRODATA_SESSION_SECRET=...`
- `MACRODATA_HOST=...`, `MACRODATA_PORT=...`, `MACRODATA_DATABASE=...`, `MACRODATA_USER=...`, `MACRODATA_PASSWORD=...`
- при необходимости: `DEBUG_LOG=0`, модели OpenAI и т.д.

Сохраните (в nano: Ctrl+O, Enter, Ctrl+X).

Права (чтобы только вы могли читать):
```bash
chmod 600 .env.local
```

---

## Часть 3. Сборка и запуск (без Docker)

Выполняйте в каталоге проекта на сервере:

```bash
cd ~/buildera_data
```

### Шаг 1. Установка зависимостей

```bash
npm ci
```

(Или `npm install`, если нет `package-lock.json`.)

### Шаг 2. Сборка проекта

```bash
npm run build
```

Сборка создаст папку `.next/standalone` (режим `output: "standalone"` в `next.config.js`).

### Шаг 3. Запуск

**Однократный запуск (для проверки):**
```bash
npm run start
```

Приложение будет доступно на `http://ВАШ_СЕРВЕР:3000`. Остановка — Ctrl+C.

**Постоянный запуск через PM2 (рекомендуется):**

Установка PM2:
```bash
sudo npm install -g pm2
```

Запуск и автозапуск при перезагрузке:
```bash
cd ~/buildera_data
pm2 start npm --name "macrodata-assistant" -- start
pm2 save
pm2 startup
# выполните команду, которую выведет pm2 startup (sudo ...)
```

Полезные команды:
```bash
pm2 status
pm2 logs macrodata-assistant
pm2 restart macrodata-assistant
pm2 stop macrodata-assistant
```

---

## Часть 4. Запуск через Docker (альтернатива)

Если на сервере установлен Docker:

```bash
cd ~/buildera_data
docker build -t macrodata-assistant .
docker run -d --name macrodata -p 3000:3000 --env-file .env.local macrodata-assistant
```

Проверка:
```bash
docker ps
curl http://localhost:3000
```

Остановка и удаление контейнера:
```bash
docker stop macrodata
docker rm macrodata
```

---

## Часть 5. Обновление проекта с GitHub

Если использовали **способ A (git clone)**:

```bash
cd ~/buildera_data
git pull
npm ci
npm run build
pm2 restart macrodata-assistant
```

Если использовали **способ B (архив)** — повторите создание архива локально, загрузку `scp` и распаковку, затем снова `npm ci`, `npm run build` и перезапуск (или пересоберите Docker-образ и перезапустите контейнер).

---

## Часть 6. Доступ по домену (Nginx, опционально)

Чтобы открывать сайт по домену (например, `https://yourdomain.com`) и не светить порт 3000 наружу:

1. Установите Nginx (если ещё не установлен):
   ```bash
   sudo apt install -y nginx
   ```

2. Создайте конфиг сайта:
   ```bash
   sudo nano /etc/nginx/sites-available/macrodata
   ```

   Пример (замените `yourdomain.com` на свой домен):

   ```nginx
   server {
       listen 80;
       server_name yourdomain.com;
       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. Включите сайт и перезапустите Nginx:
   ```bash
   sudo ln -s /etc/nginx/sites-available/macrodata /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```

4. При необходимости настройте SSL (Let's Encrypt):
   ```bash
   sudo apt install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d yourdomain.com
   ```

---

## Краткий чеклист

| Шаг | Действие |
|-----|----------|
| 1 | Подключиться по SSH к серверу |
| 2 | Клонировать репозиторий (`git clone`) или загрузить архив и распаковать |
| 3 | Установить Node.js 18+ при необходимости |
| 4 | Создать `.env.local` с секретами и настройками БД |
| 5 | Выполнить `npm ci` и `npm run build` |
| 6 | Запустить `npm run start` (проверка) или настроить PM2/Docker |
| 7 | При необходимости настроить Nginx и SSL |

После этого проект будет работать на сервере; для обновлений — `git pull` (или новая загрузка архива), пересборка и перезапуск приложения.
