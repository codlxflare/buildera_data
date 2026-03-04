# MacroData v1.1.73 — справочник схемы для ИИ-ассистента

Краткое описание таблиц по доменам, ключевые поля и связи. Используется для маппинга вопросов пользователя на таблицы и поля.

---

## Домены данных

### 1. Заявки (Leads / Estate Buys)
- **estate_buys** — заявки. Ключевые поля: `estate_buy_id`, `contacts_id`, `created_at`, `status`, `status_name`, `manager_id`, `deal_id`, `channel_type`, `channel_name`, `utm_source`, `utm_medium`, `utm_campaign`, `deal_sum`, `deal_date`, `geo_city_name`, `house_id`, `estate_sell_id`, `departments_id`, `is_primary_request`, `advertising_channel_id`.
- **estate_buys_statuses_log** — история смены статусов заявок (бронь, отмена и т.д.).
- **estate_buys_utm** / **estate_buys_utm_history** — UTM и история UTM по заявкам.
- **estate_buys_attr** — встроенные атрибуты заявок (цена, комнаты, площадь, ЖК).
- **estate_attributes** + **estate_attributes_names** — кастомные атрибуты заявок/сделок/контактов.
- **estate_audience** + **estate_audience_estate** — аудитории заявок.

Связи: `estate_buys.contacts_id` → contacts, `estate_buys.manager_id` → users, `estate_buys.deal_id` → estate_deals, `estate_buys.house_id` → estate_houses.

---

### 2. Сделки (Deals)
- **estate_deals** — сделки. Ключевые поля: `deal_id`, `deal_status`, `estate_buy_id`, `estate_sell_id`, `house_id`, `deal_date`, `deal_sum`, `deal_price`, `deal_area`, `deal_manager_id`, `reserve_date`, `is_payed_reserve`, `agreement_type`, `has_ipoteka`, `ipoteka_bank_name`, `has_agent`, `deal_mediator_comission`, `contacts_buy_id`, `finances_income`, `finances_income_mortgage`.
- **estate_deals_statuses** — справочник статусов сделок (5–150: от «Не определён» до «Сделка проведена», 140 — отменена).
- **estate_deals_addons** — наценки в сделке.
- **estate_deals_discounts** — скидки/корректировки цены.
- **estate_deals_docs** — документы по сделке.
- **estate_deals_participants** — участники сделки (роли: buyer, relative, agent, seller и т.д.).

Подсчёт проведённых сделок: `deal_status = 150`.

Связи: `estate_deals.estate_buy_id` → estate_buys, `estate_deals.estate_sell_id` → estate_sells, `estate_deals.house_id` → estate_houses, `estate_deals.deal_manager_id` → users.

---

### 3. Объекты (Listings / Estate Sells)
- **estate_sells** — объекты недвижимости. Ключевые поля: `estate_sell_id`, `house_id`, `estate_sell_status`, `estate_sell_category` (flat/garage/storageroom/house/comm), `estate_rooms`, `estate_area`, `estate_price`, `estate_price_m2`, `deal_id`, `estate_restoration_id`, `estate_code`, `geo_flatnum`, `estate_floor`.
- **estate_sells_attr** — встроенные атрибуты объектов (площади балконов, санузлы и т.д.).
- **estate_sells_statuses_log** — история статусов объектов.
- **estate_sells_price_stat** / **estate_sells_price_min_stat** — статистика цен объектов.
- **estate_promos** — акции на объектах.
- **estate_restoration** — виды отделки.

Связи: `estate_sells.house_id` → estate_houses, `estate_sells.deal_id` → estate_deals.

---

### 4. Дома и ЖК
- **estate_houses** — дома/строения. Ключевые поля: `house_id`, `complex_id`, `complex_name`, `geo_city_complex_id`, `name`, `public_house_name`, `house_category` (apphouse/cottages/parking/landgroup/building), `buildState`, `inServiceDate`, `geo_city_name`, `geo_region_name`, `group_sellStart`, `floors_in_house`.
- **estate_houses_price_stat** — средняя цена по домам (еженедельно).
- **geo_city_complex** — справочник ЖК (название, город).

Связи: `estate_houses.geo_city_complex_id` → geo_city_complex.

---

### 5. Контакты
- **contacts** — контакты (ФЛ/ЮЛ). Ограничения по ПД; для внешнего доступа — через VIEW. Поля: `contacts_id`, `contacts_buy_type`, `contacts_buy_name`, `name_last`, `name_first`, `name_middle`, `contacts_buy_phones`, `contacts_buy_emails`, и др.
- **contacts_links** — связи контактов (родственник, представитель, агент и т.д.).

---

### 6. Звонки и встречи
- **calls** — звонки. Поля: `call_date`, `direction` (in/out/internal), `phone`, `contacts_id`, `manager_id`, `estate_id` (заявка), `duration`, `calls_status` (answered/unanswered и т.д.), `is_first_unique`, `is_no_target`.
- **calls_subjects** — тематики звонков.
- **estate_meetings** — отчёты по встречам (офис/объект), `meeting_date`, `house_id`, `is_first_meeting`, `estate_buy_id`, `users_id`.

Связи: `calls.estate_id` → estate_buys.estate_buy_id, `calls.manager_id` → users.

---

### 7. Финансы
- **finances** — финансовые операции. Поля: `summa`, `date_added`, `date_to`, `deal_id`, `estate_sell_id`, `contacts_id`, `types_id`, `subtypes_id`, `manager_id`, `status`, `is_first_payment`, `is_over_deal_sum`.
- **finances_types** — типы операций.
- **finances_subtypes** — подтипы операций.
- **finances_accounts** — счета.

Связи: `finances.deal_id` → estate_deals, `finances.types_id` → finances_types.

---

### 8. Маркетинг и реклама
- **advertising_expenses** — маркетинговые расходы (дата, сумма, ЖК, дом, UTM).
- **estate_advertising_channels** — рекламные каналы.
- **estate_buys_utm** — UTM по заявкам (источник, кампания, medium и т.д.).

---

### 9. Планы продаж
- **estate_sales_plans** — планы продаж (название, уровни, период).
- **estate_sales_plans_metrics** — метрики планов: `sum`, `quantity` (сделок), `area`, `leads`, `meetings`, `reserves`, `payed_reserves`, `finances_income`, `plan_date`, `house_id`, `manager_id`, `departments_id`, `complex_id`, `category`, `rooms`.

---

### 10. Ипотека
- **estate_mortgage** — заявки на ипотеку: `estate_buy_id`, `contacts_id`, `users_id` (брокер), `amount`, `percent`, `status`, `approved_amount`, `approved_percent`, `bank_name`, `status_changed_at`.

---

### 11. Задачи и теги
- **tasks** — задачи. Поля: `estate_id` (заявка/объект/дом), `contacts_id`, `manager_id`, `date_finish`, `date_finish_fact`, `status`, `is_closed`, `category_name`, `type`, `title`.
- **tasks_tags** — теги задач.
- **tags** — справочник тегов.
- **estate_tags** — теги по недвижимости (заявки, объекты, дома).

---

### 12. Справочники и пользователи
- **users** — пользователи: `users_name`, `departments_id`, `post_title`, `role`, `is_fired`.
- **company_departments** — отделы: `department_name`, `department_type`, `dep_boss_id`, `geo_city_id`.
- **estate_statuses** — статусы заявок/объектов (0–100: от «Удалено» до «Сделка проведена»).
- **estate_deals_statuses** — статусы сделок (отдельный справочник).
- **estate_statuses_reasons** — причины перевода в неактивный статус.
- **promos** — акции (название, скидка, даты).

---

### 13. Строительные проекты и ГПР
- **projects** — проекты: `projects_id`, `projects_name`, `status`, `project_date_finish_plan`, `project_date_finish`, `completeness`, `duration_overdue_days`.
- **projects_tasks** — работы ГПР: `projects_tasks_id`, `projects_id`, `task_name`, `date_start`, `date_finish`, `date_start_fact`, `date_finish_fact`, `task_status_extended`, `failed_finish_days`, `progress`, `is_group`.
- **projects_tasks_agreements** — контрактные суммы по работам.
- **projects_tasks_estimate** — сметные суммы по работам.
- **projects_tasks_checklists** — предписания и дефектовки.
- **projects_tasks_requests** — запросы на пролонгацию дат.

---

### 14. Склад и заказы ТМЦ
- **inventory_demands** — заказы на поставку (позиции заказов): `demand_id`, `projects_id`, `projects_tasks_id`, `contacts_id` (поставщик), `supplier_id`, `demander_id`, `status`, `item_quantity`, `item_summa`, `item_date_plan`, `item_date_fact`, `item_overdue_days`, `warehouse_id`, `noms_id`.
- **inventory_warehouse** — склады.
- **inventory_warehouse_stocks** — остатки на складах.
- **inventory_noms_top** — ТОП номенклатуры.
- **noms** + **noms_category** — номенклатура и категории.

---

### 15. Прочее
- **estate_deals_contacts** — deprecated, использовать estate_deals_participants + contacts.
- **estate_transfer** / **estate_transfer_attempts** — передача ключей, осмотры.
- **estate_deals_docs** — документы по сделке.
- **stat** — вспомогательные параметры для отчётов.

---

## Типовые запросы → таблицы

| Вопрос | Основные таблицы |
|--------|-------------------|
| Заявки за период, по менеджерам, по источникам | estate_buys, estate_buys_utm, users, estate_statuses |
| Сделки за период, сумма, площадь | estate_deals (deal_status=150), estate_deals_statuses |
| Объекты в продаже, по домам, по цене | estate_sells, estate_houses, estate_sells_price_stat |
| Брони, отмены броней | estate_buys_statuses_log, estate_deals (reserve_date, is_payed_reserve) |
| Поступления денег, график платежей | finances, estate_deals (finances_income*) |
| Звонки, конверсия | calls, estate_buys |
| Встречи (офис/объект) | estate_meetings, estate_buys |
| Планы продаж vs факт | estate_sales_plans_metrics, estate_deals |
| Маркетинг, расходы, UTM | advertising_expenses, estate_buys_utm |
| Ипотека по сделкам | estate_mortgage, estate_deals |
| Задачи по сделкам/менеджерам | tasks, estate_buys, users |
| Проекты и работы (ГПР) | projects, projects_tasks |
| Заказы ТМЦ, поставки | inventory_demands, noms, inventory_warehouse |

---

## Важные замечания

1. **company_id** — во всех таблицах; фильтрация по компании обязательна при мультитенантности.
2. **Дата сделки для отчётности** — `estate_deals.deal_date` (всегда заполнена для проведённых).
3. **Проведённые сделки** — `estate_deals.deal_status = 150`.
4. **ПД в contacts/estate_deals_contacts** — для внешнего доступа использовать VIEW с ограничением полей (см. инструкцию MacroData).
5. Deprecated: `estate_deals_contacts` → использовать `estate_deals_participants` + `contacts`; часть полей в estate_deals помечена deprecated в пользу estate_buys (UTM, channel, first_meetings).

Версия схемы: MacroData v1.1.73.
