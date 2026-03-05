# Выгрузка на сервер и запуск из Git

## Проверка сборки локально

Перед выкладкой убедитесь, что проект собирается:

```bash
npm ci
npm run build
```

Успешный вывод: `✓ Generating static pages (19/19)` и список маршрутов без ошибок.

---

## 1. Подготовка репозитория (если ещё не в Git)

```bash
cd /путь/к/buildera_data
git init
git add .
git commit -m "Initial: MacroData assistant"
# Создайте репозиторий на GitHub/GitLab и добавьте remote:
git remote add origin https://github.com/ВАШ_ЛОГИН/buildera_data.git
git branch -M main
git push -u origin main
```

**Важно:** В `.gitignore` уже есть `.env`, `.env.local`, `logs/` — секреты и логи не попадут в репозиторий.

---

## 2. На сервере: клонирование и первый запуск

Подключитесь к серверу по SSH, затем:

```bash
# Клонирование (подставьте свой URL репозитория)
git clone https://github.com/ВАШ_ЛОГИН/buildera_data.git
cd buildera_data

# Установка зависимостей и сборка
npm ci
npm run build

# Создание .env.local с переменными окружения (см. раздел ниже)
nano .env.local
# Вставьте ключи и сохраните (Ctrl+O, Enter, Ctrl+X).

# Запуск в продакшене (порт 3000)
npm start
```

Проверка: откройте в браузере `http://IP_СЕРВЕРА:3000`.

---

## 3. Переменные окружения на сервере

Создайте на сервере файл `.env.local` в корне проекта (рядом с `package.json`) со следующими переменными (значения подставьте свои):

```env
# Обязательно
OPENAI_API_KEY=sk-...
MACRODATA_SESSION_SECRET=ваш_секрет_не_менее_32_символов

# Доступ в приложение (если заданы — вход по логину/паролю)
MACRODATA_AUTH_LOGIN=ваш_логин
MACRODATA_AUTH_PASSWORD=ваш_пароль

# MySQL MacroData (когда есть доступ)
MACRODATA_HOST=хост
MACRODATA_PORT=3306
MACRODATA_DATABASE=имя_бд
MACRODATA_USER=пользователь
MACRODATA_PASSWORD=пароль

# Опционально
OPENAI_CHAT_MODEL=gpt-4o
DEBUG_LOG=0
```

Файл `.env.local` в Git не коммитить.

---

## 4. Обновление с Git (после изменений в репозитории)

На сервере в каталоге проекта:

```bash
cd /путь/к/buildera_data
git pull origin main
npm ci
npm run build
# Перезапустить приложение (см. ниже — PM2 или systemd)
```

---

## 5. Постоянный запуск (PM2 или systemd)

### Вариант A: PM2

```bash
npm install -g pm2
cd /путь/к/buildera_data
pm2 start npm --name "macrodata" -- start
pm2 save
pm2 startup   # выполнить команду, которую выведет pm2
```

Обновление после `git pull` и `npm run build`:

```bash
pm2 restart macrodata
```

### Вариант B: systemd

Создайте файл `/etc/systemd/system/macrodata.service`:

```ini
[Unit]
Description=MacroData Next.js App
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/путь/к/buildera_data
ExecStart=/usr/bin/npm start
Restart=on-failure
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Подставьте свой `WorkingDirectory` и при необходимости путь к `npm`. Затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable macrodata
sudo systemctl start macrodata
sudo systemctl status macrodata
```

---

## 6. Запуск через Docker

В корне проекта уже есть `Dockerfile`. Сборка и запуск:

```bash
docker build -t macrodata-app .
docker run -p 3000:3000 --env-file .env.local macrodata-app
```

Переменные окружения можно передать через `--env-file .env.local` или отдельными `-e KEY=value`. На сервере `.env.local` нужно создать вручную (в репозиторий не класть).

---

## Краткий чеклист выкладки

1. Локально: `npm run build` — без ошибок.
2. Закоммитить и запушить код в Git (без `.env.local`).
3. На сервере: `git clone` → `npm ci` → создать `.env.local` → `npm run build` → `npm start` (или PM2/systemd/Docker).
4. При обновлениях: `git pull` → `npm ci` → `npm run build` → перезапуск процесса.
