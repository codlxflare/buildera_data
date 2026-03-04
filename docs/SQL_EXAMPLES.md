# Few-Shot SQL Примеры для MacroData ИИ

Используй эти примеры как образцы правильного SQL для типичных запросов.
Всегда соблюдай эти JOIN-паттерны и имена полей.

---

## 1. Завершённые сделки за период
Вопрос: Проведённые сделки за февраль 2026
```sql
SELECT ed.deal_id, c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, s.geo_flatnum, ed.deal_sum, ed.deal_date
FROM estate_deals ed
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE ed.deal_status = 150
  AND ed.deal_date >= '2026-02-01' AND ed.deal_date < '2026-03-01'
ORDER BY ed.deal_date DESC
LIMIT 500
```

---

## 2. Долги — кто должен заплатить в конкретном месяце
Вопрос: Кто должен заплатить в марте 2026 (с именами и телефонами)
```sql
SELECT c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, s.geo_flatnum,
       DATE(f.date_to) AS payment_date,
       SUM(f.summa) AS summa
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE f.deal_id IS NOT NULL
  AND DATE(f.date_to) >= '2026-03-01' AND DATE(f.date_to) <= '2026-03-31'
GROUP BY ed.contacts_buy_id, f.estate_sell_id, DATE(f.date_to)
ORDER BY payment_date, c.contacts_buy_name
LIMIT 500
```

---

## 3. Просроченная дебиторка (уже должны были заплатить)
Вопрос: Просроченная задолженность — кто должен был заплатить, но не заплатил
```sql
SELECT c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, s.geo_flatnum,
       DATE(f.date_to) AS due_date,
       SUM(f.summa) AS overdue_summa
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE f.deal_id IS NOT NULL
  AND DATE(f.date_to) < CURDATE()
  AND (f.status_name IS NULL OR f.status_name NOT IN ('Проведено', 'Оплачено', 'Paid'))
GROUP BY ed.contacts_buy_id, f.estate_sell_id, DATE(f.date_to)
ORDER BY due_date
LIMIT 500
```

---

## 4. Дебиторка по домам (итог по дому)
Вопрос: Задолженность по домам — сколько должен каждый дом
```sql
SELECT COALESCE(h.name, h.public_house_name) AS house_name,
       COUNT(DISTINCT ed.contacts_buy_id) AS debtors_count,
       SUM(f.summa) AS total_debt
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE f.deal_id IS NOT NULL
  AND (f.status_name IS NULL OR f.status_name NOT IN ('Проведено', 'Оплачено'))
GROUP BY h.house_id
ORDER BY total_debt DESC
LIMIT 50
```

---

## 5. Заявки по маркетинговым каналам за период
Вопрос: Заявки по каналам за февраль 2026
```sql
SELECT COALESCE(ch.name, eb.channel_name, 'Не указан') AS channel,
       COUNT(eb.id) AS leads_count
FROM estate_buys eb
LEFT JOIN estate_advertising_channels ch ON eb.channel_id = ch.id
WHERE eb.created_at >= '2026-02-01' AND eb.created_at < '2026-03-01'
GROUP BY channel
ORDER BY leads_count DESC
LIMIT 50
```

---

## 6. Конверсия из заявок в сделки по каналам
Вопрос: Конверсия по каналам — сколько из заявок стало сделками
```sql
SELECT COALESCE(ch.name, eb.channel_name, 'Не указан') AS channel,
       COUNT(DISTINCT eb.id) AS leads,
       COUNT(DISTINCT ed.deal_id) AS deals,
       ROUND(COUNT(DISTINCT ed.deal_id) * 100.0 / NULLIF(COUNT(DISTINCT eb.id), 0), 1) AS conversion_pct
FROM estate_buys eb
LEFT JOIN estate_advertising_channels ch ON eb.channel_id = ch.id
LEFT JOIN estate_deals ed ON eb.id = ed.buy_id AND ed.deal_status = 150
WHERE eb.created_at >= '2026-01-01' AND eb.created_at < '2026-04-01'
GROUP BY channel
ORDER BY conversion_pct DESC
LIMIT 50
```

---

## 7. Сделки по отделам
Вопрос: Сколько сделок по отделам за последние 3 месяца
```sql
SELECT cd.department_name AS department,
       COUNT(ed.deal_id) AS deals_count,
       SUM(ed.deal_sum) AS total_summa
FROM estate_deals ed
LEFT JOIN users u ON ed.user_id = u.id
LEFT JOIN company_departments cd ON u.departments_id = cd.departments_id
WHERE ed.deal_status = 150
  AND ed.deal_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
GROUP BY cd.departments_id, cd.department_name
ORDER BY deals_count DESC
LIMIT 50
```

---

## 8. Заявки с именами и телефонами (детализация)
Вопрос: Новые заявки за последний месяц с именами и телефонами
```sql
SELECT eb.id AS lead_id, c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(ch.name, eb.channel_name, 'Не указан') AS channel,
       DATE(eb.created_at) AS lead_date
FROM estate_buys eb
LEFT JOIN contacts c ON eb.contacts_id = c.id
LEFT JOIN estate_advertising_channels ch ON eb.channel_id = ch.id
WHERE eb.created_at >= DATE_SUB(CURDATE(), INTERVAL 1 MONTH)
ORDER BY eb.created_at DESC
LIMIT 500
```

---

## 9. Объекты в продаже по домам
Вопрос: Квартиры в продаже по домам с ценами
```sql
SELECT COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, s.geo_flatnum, s.geo_floor AS floor,
       s.area_total AS area, s.price
FROM estate_sells s
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE s.sell_status = 1
ORDER BY h.name, s.geo_floor, s.geo_flatnum
LIMIT 500
```

---

## 10. Расходы на рекламу по каналам
Вопрос: Сколько потратили на рекламу по каналам за февраль 2026
```sql
SELECT COALESCE(ch.name, ae.channel_name, 'Не указан') AS channel,
       SUM(ae.expenses_summa) AS total_expense
FROM advertising_expenses ae
LEFT JOIN estate_advertising_channels ch ON ae.channel_id = ch.id
WHERE ae.expenses_date >= '2026-02-01' AND ae.expenses_date < '2026-03-01'
GROUP BY channel
ORDER BY total_expense DESC
LIMIT 50
```

---

## 11. Динамика сделок по месяцам
Вопрос: Динамика сделок по месяцам за 2026 год
```sql
SELECT DATE_FORMAT(ed.deal_date, '%Y-%m') AS month,
       COUNT(ed.deal_id) AS deals_count,
       SUM(ed.deal_sum) AS total_summa
FROM estate_deals ed
WHERE ed.deal_status = 150
  AND YEAR(ed.deal_date) = 2026
GROUP BY month
ORDER BY month
LIMIT 24
```

---

## 12. Поступления (платежи проведённые)
Вопрос: Сколько денег поступило в марте 2026
```sql
SELECT DATE(f.date_to) AS payment_date,
       COUNT(DISTINCT ed.deal_id) AS deals_count,
       SUM(f.summa) AS received_summa
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
WHERE f.deal_id IS NOT NULL
  AND f.status_name = 'Проведено'
  AND DATE(f.date_to) >= '2026-03-01' AND DATE(f.date_to) <= '2026-03-31'
GROUP BY DATE(f.date_to)
ORDER BY payment_date
LIMIT 100
```

---

## 13. Итог по сумме (SUM) — сохраняй фильтры из предыдущего запроса
Вопрос (уточнение): Общая сумма [после запроса о долгах за март 2026]
```sql
SELECT SUM(f.summa) AS total_summa
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
WHERE f.deal_id IS NOT NULL
  AND DATE(f.date_to) >= '2026-03-01' AND DATE(f.date_to) <= '2026-03-31'
```

---

## 14. Сделки конкретного менеджера
Вопрос: Сделки менеджера Иванова
```sql
SELECT ed.deal_id, c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, ed.deal_sum, ed.deal_date, u.users_name AS manager
FROM estate_deals ed
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON ed.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
LEFT JOIN users u ON ed.user_id = u.id
WHERE ed.deal_status = 150
  AND u.users_name LIKE '%Иванов%'
ORDER BY ed.deal_date DESC
LIMIT 200
```

---

## 15. График платежей конкретного клиента
Вопрос: График платежей клиента Алиева
```sql
SELECT c.contacts_buy_name, c.contacts_buy_phones,
       COALESCE(h.name, h.public_house_name) AS house_name,
       s.plans_name, s.geo_flatnum,
       DATE(f.date_to) AS payment_date,
       f.summa, f.status_name
FROM finances f
LEFT JOIN estate_deals ed ON f.deal_id = ed.deal_id
LEFT JOIN contacts c ON ed.contacts_buy_id = c.contacts_id
LEFT JOIN estate_sells s ON f.estate_sell_id = s.estate_sell_id
LEFT JOIN estate_houses h ON s.house_id = h.house_id
WHERE f.deal_id IS NOT NULL
  AND c.contacts_buy_name LIKE '%Алиев%'
ORDER BY f.date_to
LIMIT 200
```
