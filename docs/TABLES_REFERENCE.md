# Справочник по всем таблицам БД MacroData

Документ сгенерирован из `api.txt`. Содержит: назначение таблицы, поля (тип и комментарий), связи с другими таблицами. В конце — примеры значений по части таблиц (из `api_samples.txt`).

**Версия api.txt:** MacroData v1.1.73. **Всего таблиц:** 66.

## Инструкции по использованию

| Запрос / тема | Основные таблицы | Ключевые поля и связи |
|---------------|------------------|------------------------|
| Платежи, долги, «к оплате», график до даты | **finances** | date_to, summa, deal_id, estate_sell_id, status_name; контакт покупателя через estate_deals.contacts_buy_id → contacts |
| Сделки (проведённые, подписанные) | **estate_deals** | deal_date, deal_status (150 = завершённые), contacts_buy_id → contacts |
| Заявки | **estate_buys** | created_at, channel_name, deal_id; contacts_id → contacts.id |
| Дома, ЖК | **estate_houses** | name, public_house_name |
| Квартиры, объекты в сделках | **estate_sells** | plans_name, geo_flatnum, house_id → estate_houses |
| Маркетинг, каналы, расходы | **estate_buys** (channel_name), **estate_advertising_channels**, **advertising_expenses** | utm_source, utm_campaign, expenses_date |
| Пользователи, отделы | **users**, **company_departments** | department_name, dep_boss_id → users |
| Звонки | **calls** | call_date, contacts_id → contacts, estate_id → estate_buys, manager_id → users |
| Справочники типов | finances_types, finances_subtypes, estate_statuses, noms_category, tags | id, name / title |

---

## advertising_expenses

**Назначение:** аркетинговые расходы

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `expenses_date` | date | дата начисления затрат |
| `expenses_summa` | decimal | сумма затрат |
| `complex` | varchar | ЖК из справочника |
| `house` | varchar | номер дома |
| `utm_source` | varchar |  |
| `utm_campaign` | varchar |  |
| `utm_medium` | varchar |  |

---

## calls

**Назначение:** вонки

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `calls_id` | int | id звонка |
| `updated_at` | timestamp | timestamp модификации |
| `company_id` | int |  |
| `call_date` | timestamp | дата/время звонка |
| `calls_status` | varchar | статус звонка |
| `direction` | varchar | направление звонка [in - входящий\|out - исходящий\|internal - внутренний] |
| `phone` | varchar | телефон звонящего |
| `contacts_id` | int | контакт звонящего |
| `first_manager_id` | int | первый менеджер, на которого поступил звонок |
| `manager_id` | int | менеджер звонка (ответил/позвонил) |
| `manager_ext` | varchar | расширение телефона менеджера |
| `estate_id` | int | заявка звонка |
| `audience_id` | int | id аудитории |
| `duration` | int | длительность звонка, сек |
| `vendor` | varchar | вендор телефонии |
| `gateway_phone` | varchar | шлюз звонка |
| `is_first_unique` | tinyint | признак первого уникального звонка |
| `is_group_call` | tinyint | признак группового звонка |
| `is_no_target` | int | нецелевой звонок |
| `is_hidden` | tinyint | скрытый звонок |
| `callback_id` | int | ссылка на звонок перезвонивший по пропущенному |
| `callback_date` | timestamp | ссылка перезвона по пропущенному |
| `callback_users_id` | int | перезвонивший менеджер |

**Связи:**

- calls.contacts_id → contacts.id
- calls.first_manager_id → users.id
- calls.manager_id → users.id
- calls.estate_id → estate_buys.id
- calls.audience_id → estate_audience.id
- calls.callback_id → calls.calls_id
- calls.callback_users_id → users.id

---

## calls_subjects

**Назначение:** ематики звонков

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `calls_subjects_id` | int | id тематики |
| `company_id` | int |  |
| `created_at` | timestamp | timestamp добавления |
| `updated_at` | timestamp | timestamp модификации |
| `title` | varchar | название тематики |
| `folder_id` | int | id папки |
| `is_folder` | tinyint | признак папки |
| `is_archived` | tinyint | признак архивности |

---

## company_departments

**Назначение:** тделы компании

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `departments_id` | int | id отдела |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `department_name` | varchar | отдел |
| `department_type` | varchar | тип отдела |
| `dep_boss_id` | int | руководитель отдела |
| `geo_city_id` | int | город отдела |

**Связи:**

- company_departments.dep_boss_id → users.id

---

## contacts

**Назначение:** онтакты Для контактов ограничена передача персональных данных Для включения отображения ПД - обратитесь в службу сопровождения

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `contacts_id` | int |  |
| `company_id` | int |  |
| `created_at` | timestamp | дата (Timestamp) добавления контакта |
| `updated_at` | timestamp | дата (Timestamp) изменения контакта |
| `contacts_buy_type` | tinyint | тип контакта, 0 - ФЛ, 1- ЮЛ |
| `contacts_buy_sex` | varchar | пол |
| `contacts_buy_marital_status` | varchar | семейное положение |
| `contacts_buy_dob` | date | дата рождения |
| `contacts_buy_name` | varchar | ФИО/название ЮЛ |
| `name_last` | varchar | Фамилия |
| `name_first` | varchar | Имя |
| `name_middle` | varchar | Отчество |
| `contacts_buy_phones` | varchar |  |
| `contacts_buy_emails` | varchar |  |
| `passport_bithplace` | varchar | место рождения |
| `passport_address` | varchar | адрес прописки |
| `snils` | varchar | СНИЛС ФЛ |
| `comm_inn` | varchar | ИНН ЮЛ |
| `comm_kpp` | varchar | КПП ЮЛ |
| `fl_inn` | varchar | ИНН ФЛ |
| `roles_set` | varchar | Роли контакта |

---

## contacts_links

**Назначение:** вязи контактов Значение contacts_1 всегда меньше чем contacts_2, что обеспечивает контролируемую уникальность и отсутствие двух записей в таблице, относящихся к одной и той же паре контактов

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `created_at` | datetime | дата (Y-m-d H:i:s) создания контакта |
| `contacts_1` | int | первый связываемый контакт |
| `contacts_2` | int | второй связываемый контакт |
| `link_type` | tinyint | Тип связи |

**Связи:**

- contacts_links.contacts_1 → contacts.id
- contacts_links.contacts_2 → contacts.id

---

## estate_advertising_channels

**Назначение:** екламные каналы Настройка каналов происходит в Компания→Каталоги→Рекламные каналы

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `name` | varchar | название канала |
| `is_archived` | tinyint | в архиве |

---

## estate_attributes

**Назначение:** ополнительные атрибуты дополнительные (кастомные) атрибуты заявок, объектов, контактов, сделок, акций

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar | id набора данных |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `entity` | varchar | сущность (contacts, estate_buy, estate_sell, estate_deal, promos) |
| `entity_id` | int | id сущности |
| `attr_id` | int | id атрибута |
| `attr_value` | varchar | значение атрибута |

**Связи:**

- estate_attributes.entity_id → estate_buys.estate_buy_id,estate_sells.estate_sell_id,estate_deals.deal_id,promos.id
- estate_attributes.attr_id → estate_attributes_names.id

---

## estate_attributes_names

**Назначение:** правочник дополнительных атрибутов справочник дополнительных (кастомных) атрибутов заявок, объектов, контактов, сделок, акций)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id атрибута |
| `attr_id` | int | id атрибута |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `attr_title` | varchar | заголовок атрибута |
| `attr_type` | enum | тип атрибута. Values: ('varchar','text','bool','int','decimal') |
| `attr_values` | text | список возможных значений |
| `is_multiple` | int | признак возможности множества значений |
| `entity` | varchar | сущность к которой принадлежит атрибут (contacts, estate_buy, estate_sell, estate_deal, promos) |

---

## estate_audience

**Назначение:** удитории заявок

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `estate_audience_id` | int | id тематики |
| `company_id` | int |  |
| `created_at` | timestamp | timestamp добавления |
| `updated_at` | timestamp | timestamp модификации |
| `name` | varchar | название аудитории |
| `is_static` | tinyint | признак статичности |
| `is_archived` | tinyint |  |
| `estate_count` | int | заявок в аудитории |

---

## estate_audience_estate

**Назначение:** аявки в аудиториях

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `created_at` | timestamp | timestamp добавления |
| `updated_at` | timestamp | timestamp модификации |
| `audience_id` | int | аудитория |
| `estate_buy_id` | int | заявка |

**Связи:**

- estate_audience_estate.audience_id → estate_audience.estate_audience_id
- estate_audience_estate.estate_buy_id → estate_buys.estate_buy_id

---

## estate_buys

**Назначение:** аявки Заявки - основная учетная единица в CRM начиная с этапа Бронь заявка связана с Объектом продажи через Сделку utm данные, характеризующие источник Заявки фиксируются по последнему действию

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id заявки |
| `estate_buy_id` | int | id заявки |
| `company_id` | int |  |
| `date_added` | date | deprecated дата (Y-m-d) добавления заявки |
| `created_at` | datetime | timestamp добавления заявки |
| `updated_at` | timestamp | timestamp модификации |
| `date_modified` | int | deprecated дата изменения |
| `contacts_id` | int | id контакта |
| `contacts_buy_type` | tinyint | тип контакта, 0 - ФЛ, 1- ЮЛ |
| `contacts_buy_sex` | varchar | пол |
| `contacts_buy_marital_status` | varchar | семейное положение |
| `contacts_buy_dob` | date | дата рождения |
| `contacts_buy_geo_country_id` | int | id страны покупателя |
| `contacts_buy_geo_country_name` | varchar | название страны покупателя |
| `contacts_buy_geo_region_id` | int | id региона покупателя |
| `contacts_buy_geo_region_name` | varchar | название региона покупателя |
| `contacts_buy_geo_city_id` | int | id города покупателя |
| `contacts_buy_geo_city_name` | varchar | название города покупателя |
| `contacts_buy_geo_city_short_name` | varchar | обозначение названия города покупателя |
| `type` | varchar | метка типа (buy\|rent) |
| `category` | varchar | метка категории (flat\|garage\|storageroom\|house\|comm) |
| `status` | tinyint | id статуса/этапа |
| `status_custom` | int | id подстатуса |
| `status_name` | varchar | имя статуса deprecated, используйте estate_statuses.status_name |
| `custom_status_name` | varchar | имя кастомного подстатуса |
| `status_reason_id` | bigint | тип причины перевода в неактивный статус |
| `is_primary_request` | tinyint | первичная заявка |
| `manager_id` | int | менеджер заявки |
| `call_center_manager_id` | int | менеджер колл-центра |
| `departments_id` | int | id отдел заявки |
| `geo_country_name` | varchar | страна заявки |
| `geo_region_name` | varchar | регион заявки |
| `geo_city_name` | varchar | город заявки |
| `estate_sell_id` | int | id объекта в сделке |
| `house_id` | int | id дома объекта |
| `first_house_interest` | bigint | id дома - первого интереса заявки |
| `first_complex_interest` | bigint | id ЖК (справочное) - первого интереса заявки |
| `first_meetings_id` | bigint | id первой встречи по заявке |
| `first_meetings_house_id` | bigint | id дома первой встречи-показа |
| `first_meetings_office_id` | bigint | id первой встречи в офисе |
| `channel_type` | varchar | системное деление источника заявок по типу (www - онлайн реклама\|office - самоходы и ручной ввод\|agent - интеграция с агентскими каналами\|call - звонок\|messenger\|external - другое) |
| `channel_name` | varchar | системное имя источника (сайт, номер телефона, название канала) |
| `channel_medium` | varchar |  |
| `utm_source` | varchar |  |
| `utm_medium` | varchar |  |
| `utm_campaign` | varchar |  |
| `utm_content` | varchar |  |
| `deal_id` | int | id сделки |
| `is_payed_reserve` | int | признак платной брони |
| `deal_sum` | decimal | сумма сделки |
| `deal_price` | decimal | цена объекта на момент начала оформления сделки |
| `deal_area` | decimal | площадь в сделке |
| `deal_sum_addons` | decimal | сумма допов в сделке |
| `deal_date` | date | дата проведения сделки |
| `agreement_type` | varchar | тип сделки (ДДУ, ДУСТ и тд) |
| `is_concession` | int | признак договора уступки |
| `deal_mediator_comission` | decimal | сумма комиссии агенту в сделке (если ) |
| `deal_program_name` | varchar | программа покупки |
| `ipoteka_bank_name` | varchar | имя ипотечного банка в сделке |
| `ipoteka_rate` | decimal | ставка по ипотеке |
| `contacts_mediator_id` | int | id агента. наличие значения однозначно указывает на заявку, пришедшую из агентского канала |
| `mediator_agency_id` | int | id агентства |
| `agent_name` | varchar | агент заявки/сделки |
| `agency_name` | varchar |  |
| `advertising_channel_id` | int | id рекламного канала |

**Связи:**

- estate_buys.contacts_id → contacts.id
- estate_buys.status → estate_statuses.status_id
- estate_buys.status_reason_id → estate_statuses_reasons.status_reason_id
- estate_buys.manager_id → users.id
- estate_buys.call_center_manager_id → users.id
- estate_buys.departments_id → company_departments.departments_id
- estate_buys.estate_sell_id → estate_sells.estate_sell_id
- estate_buys.house_id → estate_houses.house_id
- estate_buys.first_house_interest → estate_houses.house_id
- estate_buys.first_complex_interest → geo_city_complex.id
- estate_buys.first_meetings_id → estate_meetings.meetings_id
- estate_buys.first_meetings_house_id → estate_meetings.meetings_id
- estate_buys.first_meetings_office_id → estate_meetings.meetings_id
- estate_buys.deal_id → estate_deals.deal_id
- estate_buys.contacts_mediator_id → contacts.id
- estate_buys.mediator_agency_id → contacts.id
- estate_buys.advertising_channel_id → estate_advertising_channels.id

---

## estate_buys_attr

**Назначение:** трибуты заявок (встроенные) Встроенные атрибуты заявок из перечня: ${filter_by_estate_buy_attr} https://api.macroserver.ru/docs/estate

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar |  |
| `company_id` | int |  |
| `estate_buy_id` | int | id объекта |
| `created_at` | datetime | timestamp добавления заявки |
| `updated_at` | timestamp | timestamp модификации заявки |
| `attr_table` | varchar | тип данных (int\|decimal\|varchar) |
| `attr_name` | varchar | имя атрибута |
| `attr_value` | varchar | значение атрибута |

**Связи:**

- estate_buys_attr.estate_buy_id → estate_buys.estate_buy_id

---

## estate_buys_attributes

**Назначение:** трибуты заявок/контактов/сделок атрибуты заявки собираются через кастомные атрибуты самой заявки, контакта и сделки deprecated @see estate_attributes

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar | id записи |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `entity` | varchar | сущность (contacts, estate_buy, estate_deal) |
| `entity_id` | int | id сущности |
| `attr_id` | int | id атрибута |
| `attr_value` | varchar | значение атрибута |

---

## estate_buys_attributes_names

**Назначение:** правочник атрибутов кастомные атрибуты сущностей в недвижимости (заявки, контакта, сделки) deprecated @see estate_attributes_names

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id атрибута |
| `attr_id` | int | id атрибута |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `attr_title` | varchar | заголово атрибута |
| `attr_type` | enum | тип атрибута. Values: ('varchar','text','bool','int','decimal') |
| `attr_values` | text | список возможных значений |
| `is_multiple` | int | признак возможности множества значений |
| `entity` | varchar | сущность к которой принадлежит атрибут |

---

## estate_buys_statuses_log

**Назначение:** стория изменения статусов заявок Лог записывается при каждом изменении статуса или подстатуса заявки Типовые кейсы: постановка брони: (status_from<30,status_to=30) постановка платной брони: (status_from=30,status_to=30,is_payed_reserve=1) отмена брони: (status_from=30,status_to<30) возврат сделки в бронь (не является постановкой брони с точки зрения воронки продаж): (status_from>30,status_to=30)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `log_date` | timestamp | дата события |
| `estate_buy_id` | int | id заявки |
| `deal_id` | int | id сделки в момент события |
| `deal_sum` | decimal | сумма сделки в момент события |
| `users_id` | int | пользователь, инициировавший событие |
| `is_payed_reserve` | tinyint | признак включения платной брони |
| `status_from` | tinyint | исходный статус |
| `status_from_name` | varchar | название исходного статуса, deprecated, используйте estate_statuses.status_name |
| `status_to` | tinyint | новый статус |
| `status_to_name` | varchar | название нового статуса, deprecated, используйте estate_statuses.status_name |
| `status_custom_from` | int | исходный подстатус |
| `status_custom_from_name` | varchar | название исходного подстатуса |
| `status_custom_to` | int | новый кастомный подстатус |
| `status_custom_to_name` | varchar | название нового подстатуса |

**Связи:**

- estate_buys_statuses_log.estate_buy_id → estate_buys.id
- estate_buys_statuses_log.deal_id → estate_deals.id
- estate_buys_statuses_log.users_id → users.id

---

## estate_buys_utm

**Назначение:** TM заявок

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id заявки |
| `estate_buy_id` | int | id заявки |
| `company_id` | int |  |
| `date_added` | date | дата (Y-m-d) добавления |
| `updated_at` | timestamp | timestamp модификации |
| `utm_history_id` | int |  |
| `channel_type` | varchar | тип источника заявки (www\|office\|agent\|call) |
| `channel_name` | varchar | имя источника (сайт, номер телефона/название канала) |
| `channel_medium` | varchar |  |
| `utm_source` | varchar |  |
| `utm_medium` | varchar |  |
| `utm_campaign` | varchar |  |
| `utm_content` | varchar |  |
| `utm_term` | varchar |  |
| `utm_keyword` | varchar |  |
| `utm_block` | varchar |  |
| `utm_position_type` | varchar |  |
| `utm_position` | varchar |  |
| `utm_campaign_id` | varchar |  |
| `utm_ad_id` | varchar |  |
| `utm_phrase_id` | varchar |  |
| `roistat_cid` | varchar |  |
| `google_cid` | varchar |  |
| `yandex_cid` | varchar |  |
| `jivosite_cid` | varchar |  |
| `carrotquest_cid` | varchar |  |
| `facebook_id` | varchar |  |
| `calltouch_id` | int |  |
| `callkeeper_id` | int |  |
| `calltracking_vendor_name` | varchar |  |
| `calltracking_vendor_id` | bigint |  |
| `campaing_name` | varchar |  |
| `comagic_campaign_id` | int |  |

**Связи:**

- estate_buys_utm.estate_buy_id → estate_buys.estate_buy_id

---

## estate_buys_utm_history

**Назначение:** стория UTM заявок При каждом дополнительном внешнем запросе UTM запроса фиксируется в истории

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id записи в истории |
| `utm_history_id` | int | id записи в истории |
| `estate_buy_id` | int | id заявки |
| `company_id` | int |  |
| `created_at` | datetime | timestamp добавления |
| `updated_at` | timestamp | timestamp модификации |
| `channel_type` | varchar | тип источника заявки (www\|office\|agent\|call) |
| `channel_name` | varchar | имя источника (сайт, номер телефона/название канала) |
| `channel_medium` | varchar |  |
| `utm_source` | varchar |  |
| `utm_medium` | varchar |  |
| `utm_campaign` | varchar |  |
| `utm_content` | varchar |  |
| `utm_term` | varchar |  |
| `utm_keyword` | varchar |  |
| `utm_block` | varchar |  |
| `utm_position_type` | varchar |  |
| `utm_position` | varchar |  |
| `utm_campaign_id` | varchar |  |
| `utm_ad_id` | varchar |  |
| `utm_phrase_id` | varchar |  |
| `roistat_cid` | varchar |  |
| `google_cid` | varchar |  |
| `yandex_cid` | varchar |  |
| `jivosite_cid` | varchar |  |
| `carrotquest_cid` | varchar |  |
| `facebook_id` | varchar |  |

**Связи:**

- estate_buys_utm_history.estate_buy_id → estate_buys.estate_buy_id

---

## estate_deals

**Назначение:** делки по недвижимости Сделка начинает формироваться начиная с добавления объекта в интересы к заявке Интерес может приобретать разные статусы (см. estate_deals_statuses) У одного объекта может быть несколько интересантов, и одна заявка может иметь интерес к нескольким объектам Начиная с этапа Бронь Сделка получает "прочную" (sell/buy.deal_shows_id) связь с Объектом, исключая возможность на один объект поставить несколько броней Для подсчета завершенных сделок используйте фильтр deal_status = 150 ВАЖНО: Статусы сделок (deal_status) хранятся в справочнике estate_deals_statuses и отличаются от статусов объектов/заявок (estate_statuses).

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `deal_id` | int | id сделки |
| `deal_status` | tinyint | статус сделки |
| `updated_at` | timestamp | timestamp модификации |
| `deal_status_name` | varchar | имя статуса сделки, deprecated, используйте estate_deals_statuses.status_name |
| `estate_buy_id` | int | id заявки в сделке |
| `estate_sell_id` | int | id объекта в сделке |
| `buy_deal_shows_id` | int | id сделки в заявке (для проверки) |
| `sell_deal_shows_id` | int | id сделки в объекте (для проверки) |
| `house_id` | int | id дома объекта |
| `seller_contacts_id` | int | id продавца |
| `seller_contacts_name` | varchar | продавец |
| `date_finished_plan` | date | плановая дата сделки |
| `date_modified` | timestamp | дата изменения |
| `deal_date` | date | Дата проведения сделки является основной учетной характеристикой отнесения сделки к отчетному периоду. Всегда заполнена для проведенных сделок |
| `deal_date_start` | date | дата начала оформления сделки |
| `deal_date_cancelled` | date | дата расторжения заключенной сделки |
| `deal_date_combined` | date | ! служебное поле |
| `deal_manager_id` | int | менеджер сделки |
| `deal_co_manager_id` | bigint | второй менеджер сделки |
| `estate_buy_date_added` | date | дата (Y-m-d) добавления заявки |
| `reserve_date` | date | дата (Y-m-d) окончания брони |
| `reserve_date_start` | date | дата (Y-m-d) постановки брони (актуально для подсчета только по активным броням/сделкам, в остальных случаях следует воспользоваться estate_buys_statuses_log) |
| `is_payed_reserve` | int | признак платной брони |
| `deal_sum` | decimal | сумма сделки |
| `deal_price` | decimal | цена объекта на момент начала оформления сделки |
| `deal_area` | decimal | площадь в сделке |
| `deal_sum_addons` | decimal | сумма допов в сделке |
| `agreement_type` | varchar | тип сделки (ДДУ, ДУСТ и тд) |
| `agreement_number` | varchar | номер договора (в печатной форме) |
| `agreement_date` | date | дата договора (в печатной форме) |
| `agreement_template_title` | varchar | название шаблона договора |
| `preliminary_date` | date | дата предварительного договора |
| `is_preliminary` | int | признак наличия предварительного договора |
| `signed_date` | date | дата подписания клиентом |
| `signed_by_company_date` | date | дата подписания компанией |
| `arles_agreement_date` | date | дата договора бронирования |
| `arles_agreement_num` | varchar | номер договора бронирования |
| `agreement_osnova_date` | date | дата договора основания |
| `agreement_verified_date` | timestamp | дата проверки договора |
| `terms_approved_send` | timestamp | дата отправки на согласование |
| `terms_approved_date` | timestamp | дата согласования договора |
| `justice_registration_method` | int | способ передачи на регистрацию |
| `justice_date_send_plan` | date | плановая дата отправки на регистрацию |
| `justice_date_send` | date | дата отправки на регистрацию |
| `justice_date_received_plan` | date | плановая дата возврата с регистрации |
| `justice_date_received` | date | фактическая дата возврата с регистрации |
| `justice_date` | date | дата регистрации |
| `justice_number` | varchar | номер регистрации |
| `registration_users_id` | int | ответственный за регистрацию сотрудник |
| `is_concession` | int | признак договора уступки |
| `bulk_deal_id` | int | id оптовой сделки (для главной = deal_id) |
| `is_bulk` | int | признак оптовой сделки |
| `bulk_deal_sum` | decimal | стоимость оптовой сделки |
| `bulk_deal_sum_m2` | decimal | стоимость за м2 оптовой сделки |
| `bulk_deal_area` | decimal | площадь оптовой сделки |
| `agreement_owner_date` | date | дата подписания акта п/п |
| `deal_program_name` | varchar | программа покупки |
| `has_ipoteka` | int | признак ипотечной сделки |
| `ipoteka_bank_name` | varchar | имя ипотечного банка в сделке |
| `ipoteka_rate` | decimal | ставка по ипотеке |
| `agreement_city_name` | varchar | город ипотечного банка |
| `bank_first_income` | decimal | сумма первоначального взноса |
| `bank_commission` | decimal | комиссия банка |
| `bank_agreement_term` | int | срок кредита, мес |
| `has_agent` | int | Признак агентской сделки - основное поле для фильтрации агентских сделок (агентского канала) |
| `deal_mediator_comission` | decimal | сумма комиссии агенту в сделке |
| `contacts_mediator_id` | int | id контата агента |
| `agent_name` | varchar | агент заявки/сделки |
| `agency_name` | varchar |  |
| `contacts_buy_id` | int | id главного покупателя |
| `estate_client_aim` | varchar | цель приобретения |
| `mother_capital_cert_sum` | decimal | сумма материнского капитала |
| `contacts_buy_type` | tinyint | тип контакта, 0 - ФЛ, 1- ЮЛ |
| `contacts_buy_sex` | varchar | пол |
| `contacts_buy_marital_status` | varchar | семейное положение |
| `contacts_buy_dob` | date | дата рождения |
| `deal_contacts_count` | int | участников в сделке |
| `status` | tinyint | id статуса заявки |
| `status_custom` | int | id подстатуса заявки |
| `custom_status_name` | varchar | имя кастомного подстатуса заявки |
| `is_primary_request` | tinyint | первичная заявка |
| `manager_id` | int | менеджер заявки |
| `departments_id` | int | id отдела заявки |
| `finances_income` | decimal | поступления по графику сделки |
| `finances_income_mortgage` | decimal | поступления ипотечных платежей по графику сделки |
| `finances_income_reserved` | decimal | ожидаемые поступления по графику сделки |
| `finances_income_reserved_mortgage` | decimal | ожидаемые поступления по графику сделки ипотечных платежей |
| `finances_other_income` | decimal | другие поступления по сделке |
| `finances_other_income_reserved` | decimal | другие ожидаемые поступления по сделке |
| `finances_over_deal_sum` | decimal | поступления по сделке сверх суммы договора |
| `finances_over_deal_sum_reserved` | decimal | ожидаемые поступления по сделке сверх суммы договора |
| `finances_income_date_first` | timestamp | дата первого пришедшего поступления |
| `finances_income_date_last` | timestamp | дата последнего пришедшего поступления |
| `first_meetings_id` | int | ! deprecated, see estate_buys |
| `first_meetings_house_id` | int | ! deprecated, see estate_buys |
| `first_meetings_office_id` | int | ! deprecated, see estate_buys |
| `channel_type` | varchar | ! deprecated, see estate_buys |
| `channel_name` | varchar | ! deprecated, see estate_buys |
| `channel_medium` | varchar | ! deprecated, see estate_buys |
| `utm_source` | varchar | ! deprecated, see estate_buys |
| `utm_medium` | varchar | ! deprecated, see estate_buys |
| `utm_campaign` | varchar | ! deprecated, see estate_buys |
| `utm_content` | varchar | ! deprecated, see estate_buys |

**Связи:**

- estate_deals.deal_status → estate_deals_statuses.status_id
- estate_deals.estate_buy_id → estate_buys.estate_buy_id
- estate_deals.estate_sell_id → estate_sells.estate_sell_id
- estate_deals.house_id → estate_houses.house_id
- estate_deals.seller_contacts_id → contacts.id
- estate_deals.deal_manager_id → users.id
- estate_deals.deal_co_manager_id → users.id
- estate_deals.contacts_mediator_id → contacts.contacts_id
- estate_deals.contacts_buy_id → contacts.contacts_id
- estate_deals.status → estate_statuses.status_id
- estate_deals.manager_id → users.id
- estate_deals.departments_id → company_departments.departments_id

---

## estate_deals_addons

**Назначение:** аценки в сделке

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id наценки в сделке |
| `company_id` | int |  |
| `deal_id` | int | id сделки |
| `deal_date_combined` | date | ! служебное поле |
| `updated_at` | timestamp | timestamp модификации |
| `addon_name` | varchar | имя наценки |
| `addon_price_default` | decimal | величина наценки по-умолчанию |
| `addon_price` | decimal | величина наценки в сделке |

**Связи:**

- estate_deals_addons.deal_id → estate_deals.deal_id

---

## estate_deals_contacts

**Назначение:** онтакты в сделках @deprecated Для контактов ограничена передача персональных данных Для включения отображения ПД - обратитесь в службу сопровождения Внимание! Данная таблица будет изменена в ближайшее время. Не используйте ее в своих проектах. Вместо нее используйте estate_deals_participants + contacts deprecated @see estate_deals_participants, contacts

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `date_added` | date | дата (Y-m-d) добавления контакта deprecated |
| `date_modified` | datetime | дата (Y-m-d H:i:s) модификации контакта deprecated |
| `created_at` | timestamp | дата (Timestamp) добавления контакта |
| `updated_at` | timestamp | дата (Timestamp) изменения контакта |
| `contacts_buy_type` | tinyint | тип контакта, 0 - ФЛ, 1- ЮЛ |
| `contacts_buy_sex` | varchar | пол |
| `contacts_buy_marital_status` | varchar | семейное положение |
| `contacts_buy_dob` | date | дата рождения |
| `contacts_buy_name` | varchar | ФИО/название ЮЛ |
| `name_last` | varchar | Фамилия |
| `name_first` | varchar | Имя |
| `name_middle` | varchar | Отчество |
| `contacts_buy_phones` | varchar |  |
| `contacts_buy_emails` | varchar |  |
| `passport_bithplace` | varchar | место рождения |
| `passport_address` | varchar |  |
| `comm_inn` | varchar | ИНН ЮЛ |
| `comm_kpp` | varchar | КПП ЮЛ |
| `fl_inn` | varchar | ИНН ФЛ |
| `roles_set` | varchar | Роли контакта |

---

## estate_deals_discounts

**Назначение:** орректировки цены, примененные к сделке

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id корректировки |
| `company_id` | int |  |
| `deal_id` | int | id сделки |
| `updated_at` | timestamp | timestamp модификации |
| `deal_date_combined` | varchar | ! служебное поле |
| `promo_id` | int | id акции |
| `type` | enum | discount \| increase. Values: ('discount','drop','increase','restoration','instalment_increase') |
| `amount` | decimal | сумма корректировки |
| `rule` | enum | правило корректировки. Values: ('discount','discount_m2','discount_none') |
| `rule_type` | enum | способ корректировки. Values: ('cash','percent') |
| `rule_value` | decimal |  |
| `comment` | varchar |  |
| `discount_type_id` | int |  |
| `discount_type_title` | varchar |  |
| `discount_type` | varchar | тип подтипа корректировки |

**Связи:**

- estate_deals_discounts.deal_id → estate_deals.deal_id
- estate_deals_discounts.promo_id → promos.promo_id

---

## estate_deals_docs

**Назначение:** ополнительные документы по сделке Дополнительные документы, прикрепляемые к сделке с недвижимостью

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | дата обновления записи |
| `deal_id` | int | id сделки |
| `document_type` | varchar | тип документа |
| `document_type_name` | varchar | наименование типа документа |
| `users_id` | int | пользователь, добавивший документ |
| `document_date` | date | дата документа |
| `document_number` | varchar | номер документа |
| `registration_number` | varchar | рег.номер документа |
| `date_registration` | date | дата регистрации документа |
| `prev_area` | decimal | предыдущая площадь сделки |
| `prev_summa` | decimal | предыдущая сумма сделки |
| `document_summa` | decimal | сумма по документу |
| `document_area` | decimal | площадь по документу |
| `has_file` | int | признак наличия подгруженного файла |

**Связи:**

- estate_deals_docs.deal_id → estate_deals.deal_id
- estate_deals_docs.users_id → users.id

---

## estate_deals_participants

**Назначение:** частники сделок с недвижимостью В таблице содержится реестр контактов и их ролей в сделках По одной сделке может быть несколько контактов Один контакт может иметь только одну роль в рамках сделки

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar |  |
| `contacts_id` | int | id контакта |
| `deal_id` | int | id сделки |
| `company_id` | int | компания сделки (не контакта!) |
| `deal_date_combined` | date | ! служебное поле |
| `updated_at` | timestamp |  |
| `deal_role` | varchar | роль участника сделки (buyer_main - главный покупатель, остальное в справочнике) |
| `contacts_buy_portion` | varchar | доля покупателя |
| `responsible_contacts_id` | int | ответственное лицо |

**Связи:**

- estate_deals_participants.contacts_id → contacts.contacts_id
- estate_deals_participants.deal_id → estate_deals.deal_id
- estate_deals_participants.responsible_contacts_id → contacts.contacts_id

---

## estate_deals_statuses

**Назначение:** татусы сделок

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `status_id` | int |  |
| `status_name` | varchar |  |

---

## estate_houses

**Назначение:** ома Дома/строения компании Дома сгруппированы в Группу домов В состав дома входят объекты (ассортимент), см estate_sells

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id дома |
| `house_id` | int | id дома |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `status` | tinyint | статус дома |
| `complex_id` | int | id группы домов |
| `complex_name` | varchar | имя группы домов |
| `house_category` | varchar | категория дома (apphouse = МКД (многоквартирные дома), cottages = Группа коттеджей/таунхаусов, parking = Паркинги/машиноместа, landgroup = Земельные участки, building = Коммерческая недвижимость) |
| `geo_city_complex_id` | int | id ЖК (справочник) |
| `buildState` | varchar | состояние проекта (project=Проект,unfinished=Идет строительство,built=Дом построен, но не сдан,hand-over=Дом сдан в эксплуатацию) |
| `inServiceState` | int | признак ввода в эксплуатацию |
| `inServiceDate` | int | дата ввода в эксплуатацию |
| `inServiceMonth` | int | месяц ввода в эксплуатацию |
| `inServiceQuartal` | int | квартал ввода в эксплуатацию |
| `inServiceYear` | int | год ввода в эксплуатацию |
| `group_sellStart` | date | дата начала продаж |
| `public_house_name` | varchar | публичное имя дома |
| `floors_in_house` | int | этажность |
| `estate_house_code` | varchar | код дома |
| `estate_group_code` | varchar | код группы |
| `estate_external_uuid` | varchar | связь с внешним UUID |
| `geo_country_name` | varchar | адрес дома: страна |
| `geo_region_name` | varchar | адрес дома: регион |
| `geo_city_name` | varchar | адрес дома: город |
| `geo_city_short_name` | varchar | адрес дома: обозначение города |
| `geo_street_name` | varchar | адрес дома: улица |
| `geo_street_short_name` | varchar | адрес дома: обозначение улицы |
| `geo_house` | varchar | адрес дома: номер |
| `geo_building` | varchar | адрес дома: строение |
| `geo_korpus` | varchar | адрес дома: корпус |
| `geo_block` | varchar | адрес дома: секция |
| `geo_quarter` | varchar | адрес дома: квартал |
| `estate_buildingQueue` | varchar | Очередь стр-ва |
| `seller_id` | int | id продавца |
| `seller_name` | varchar | продавец (будет удалено, рекомендовано пользоваться contacts) |
| `name` | varchar | имя дома |

**Связи:**

- estate_houses.geo_city_complex_id → geo_city_complex.geo_complex_id
- estate_houses.seller_id → contacts.contacts_id

---

## estate_houses_price_stat

**Назначение:** татистика средней стоимость объектов по домам Статистика собирается каждую неделю

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `house_id` | int | id дома |
| `month_stat_date` | date | дата фиксации |
| `category` | varchar | категория дома |
| `flat_class` | varchar | класс объектов |
| `avg_price` | int | средняя цена объектов |
| `avg_price_m2` | int | средняя цена за м² объектов |

**Связи:**

- estate_houses_price_stat.house_id → estate_houses.house_id

---

## estate_meetings

**Назначение:** тчеты по встречам Встречи фиксируются отчетом о встрече

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `meetings_id` | int | id встречи |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `estate_buy_id` | int | id заявки |
| `contacts_id` | int | id контакта с которым проводилась встреча |
| `users_id` | int | id менеджера, проводившего встречу |
| `date_added` | timestamp | дата добавления отчета по встрече |
| `meeting_date` | date | дата учета встречи |
| `meeting_type` | varchar | тип встречи (устаревшее): офис/объект, deprecated |
| `meeting_type_place` | varchar | место встречи: офис (meeting)/объект(meeting_house) |
| `meeting_type_name` | varchar | название места встречи |
| `complex_id` | int | id группы домов |
| `house_id` | int | id дома встречи |
| `no_meeting` | int | признак несостоявшейся встречи |
| `is_first_meeting` | int | признак первой встречи |
| `is_last_meeting` | int | признак последней встречи |

**Связи:**

- estate_meetings.estate_buy_id → estate_buys.estate_buy_id
- estate_meetings.contacts_id → contacts.contacts_id
- estate_meetings.users_id → users.id
- estate_meetings.complex_id → estate_houses.complex_id
- estate_meetings.house_id → estate_houses.house_id

---

## estate_mortgage

**Назначение:** аявки на ипотеку

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `mortgage_id` | int | id встречи |
| `company_id` | int |  |
| `created_at` | timestamp | timestamp создания |
| `updated_at` | timestamp | timestamp модификации |
| `estate_buy_id` | int | id связанной заявки на покупку |
| `contacts_id` | int | id главного контакта заявки |
| `users_id` | int | ипотечный брокер |
| `amount` | decimal | запрошенная сумма |
| `term` | smallint | запрошенный срок |
| `percent` | decimal | ожидаемая ставка |
| `status` | tinyint | код статуса заявки |
| `status_name` | varchar | имя статуса |
| `approved_amount` | decimal | одобренная сумма |
| `approved_percent` | decimal | одобренная ставка |
| `approved_term` | smallint | одобренный срок |
| `status_changed_at` | timestamp | дата одобрения |
| `bank_name` | varchar | банк, одобривший заявку |

**Связи:**

- estate_mortgage.estate_buy_id → estate_buys.estate_buy_id
- estate_mortgage.contacts_id → contacts.contacts_id
- estate_mortgage.users_id → users.id

---

## estate_promos

**Назначение:** кции на объектах Реестр объектов и подходящих к ним акций

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `promo_id` | int | акция |
| `estate_sell_id` | int | объект |
| `price` | decimal | Цена объекта по данной акции |

**Связи:**

- estate_promos.estate_sell_id → estate_sells.estate_sell_id

---

## estate_restoration

**Назначение:** иды отделки Виды отделки

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp |  |
| `name` | varchar | название отделки |
| `description` | text | описание отделки |
| `is_archived` | tinyint | в архиве |

---

## estate_sales_plans

**Назначение:** ланы продаж Планирование продаж происходит одновременно в разных видах (представлениях/срезах), Каждый план характеризуется своим деревом (уровнями) определяющих характеристик плана (жк/дом/менеджер/категория/отдел и тд)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `sales_plan_id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `title` | varchar | название плана |
| `levels` | text | используемые уровни (в порядке иерархии) |
| `indicators` | text | используемые метрики |
| `period` | varchar | период планирования |
| `is_independent` | tinyint | признак независимости плана |

---

## estate_sales_plans_metrics

**Назначение:** оказатели планов продаж В данной таблице выводятся метрики планов (суммы/площади/штуки и т.д.) в разрезе каждого плана продаж. Все пересекающиеся виды планов с одинаковыми наборами определяющих характеристик (например пересечение менеджер-ЖК и ЖК-менеджер) физически хранятся в одной записи для синхронизации разных планов между собой. Поскольку каждый план формирует свое представление (см estate_sales_plans), содержащее разные комбинации вложенности определяющих характеристик, то в данной таблице одна запись, хранящая метрики, может быть продублирована в нескольких планах. Это помогает однозначено определять набор заданных метрик для каждого плана. Исключение составляют независимые планы продаж, показатели которых не появляются в других планах.

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar | id набора данных |
| `metrics_id` | int | id записи метрики |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `plan_id` | int | id плана |
| `tree_group_levels` | varchar | уровень среза метрики |
| `plan_date` | date | дата плана %Y-%m-15 |
| `year` | int | год |
| `quarter` | int | квартал |
| `month` | int | месяц |
| `complex_id` | int | группа домов |
| `house_id` | int | дом |
| `manager_id` | int | менеджер |
| `category` | varchar | категория квартир |
| `rooms` | int | комнатность |
| `is_studio` | tinyint | признак студии |
| `departments_id` | int | отдел |
| `estate_class` | varchar | класс квартиры |
| `deal_programs` | int | программа покупки |
| `estate_is_mediator` | tinyint | признак посредника |
| `finances_income` | decimal | Сумма привлеченных денег |
| `price_m2` | decimal | стоимость за м2 |
| `quantity` | decimal | Сделок, шт |
| `sum` | decimal | Сумма продаж |
| `area` | decimal | Объем продаж, м2 |
| `leads` | int | Количество заявок |
| `target_leads` | int | Количество целевых заявок |
| `meetings` | int | Количество встреч |
| `reserves` | int | Количество броней |
| `payed_reserves` | int | Количество платных броней |
| `deal_price` | decimal | Плановая цена сделки |
| `provision_method` | varchar | Способ обеспечения |

**Связи:**

- estate_sales_plans_metrics.plan_id → estate_sales_plans.sales_plan_id
- estate_sales_plans_metrics.complex_id → estate_houses.complex_id
- estate_sales_plans_metrics.house_id → estate_houses.house_id
- estate_sales_plans_metrics.manager_id → users.id
- estate_sales_plans_metrics.departments_id → company_departments.departments_id

---

## estate_sells

**Назначение:** бъекты Объект, является главной учетной сущностью ассортимента Объекты группируются в Дома (см estate_houses) Объект хранит в себе все аттрибуты объекта, цену, параметры площади и прочее На этапе бронь+ Объект объединяется с Заявкой (estate_buys) в Сделке (estate_deals) Объект может быть только в одной активной сделке и иметь только один график платежей Основные этапы объекта: 20 - в продаже, 32|52 - снято с продажи. Остальные сценарии лучше анализировать через сделку объекта (deal_id). У объекта не может быть статуса "Сделка расторгнута", поскольку квартиры по которым расторгается сделка возвращаются в продажу.

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `estate_sell_id` | int |  |
| `company_id` | int |  |
| `date_modified` | int | дата изменения |
| `updated_at` | timestamp | timestamp модификации |
| `activity` | enum | активность объекта (sell - продажа, rent - сдача в аренду). Values: ('rate','rent','sell','lease','buylease','sellrent','buy') |
| `estate_sell_type` | varchar | метка типа (living\|comm - только объекты с категорией comm) |
| `estate_sell_category` | varchar | категория объекта недвижимости (flat - квартира (в т.ч. студия и апартаменты)\|garage - гараж/парковка\|storageroom - кладовая\|house - дом/таунхауз/ИЖС\|comm - коммерческая недвижимость) |
| `estate_sell_status` | tinyint | id статуса/этапа объекта в воронке продаж |
| `estate_sell_status_name` | varchar | имя статуса, deprecated, используйте estate_statuses.status_name |
| `house_id` | int | id дома |
| `source_parent_id` | int | id дома для клонированной вторички |
| `estate_code` | varchar | код объекта |
| `seller_contacts_id` | int | id продавца |
| `seller_contacts_name` | varchar | продавец (deprecated, рекомендовано пользоваться contacts) |
| `plans_name` | varchar | название планировки |
| `plans_group` | varchar | название группы планировок |
| `flatClass` | varchar | класс квартиры |
| `estate_studia` | int | признак квартиры-студии (обычно при этом estate_rooms=1, но не обязательно) |
| `estate_apartments` | int | признак квартиры-апартаментов |
| `estate_rooms` | int | комнатность (Значение NULL может встречаться для объектов без комнат (кладовые, машиноместа) или для студий или при незавершенном заполнении данных) |
| `geo_house_entrance` | int | подъезд/секция |
| `estate_floor` | int | этаж |
| `estate_riser` | int | номер на площадке (стояк) |
| `geo_flatnum` | varchar | номер объекта |
| `geo_flatnum_postoffice` | varchar | почтовый номер объекта |
| `estate_external_uuid` | varchar | связь с внешним UUID |
| `estate_area` | decimal | площадь объекта |
| `estate_price` | decimal | цена объекта |
| `estate_price_action` | decimal | Цена по спецпредложению |
| `estate_price_m2` | decimal | стоимость за м2 |
| `estate_areaBti` | decimal | площадь по БТИ |
| `estate_areaBti_koef` | decimal | площадь по БТИ (коэф.) |
| `estate_area_inside` | decimal | Площадь без ЛП |
| `estate_areaBti_inside` | decimal | Площадь БТИ без ЛП |
| `estate_areaBti_terrace` | decimal | Площадь террасы БТИ, м² |
| `estate_restoration_id` | int | id вида отделки |
| `estate_restoration` | varchar | название вида отделки deprecated |
| `estate_restoration_price` | decimal | стоимость отделки |
| `estate_sale_type` | varchar | Тип продажи |
| `estate_dealAreaBeforeBtiRecalc` | decimal | Площадь до перерасчета по обмерам БТИ |
| `special_notes` | varchar | Служебные отметки |
| `deal_id` | int | id сделки |

**Связи:**

- estate_sells.house_id → estate_houses.house_id
- estate_sells.source_parent_id → estate_houses.house_id
- estate_sells.seller_contacts_id → contacts.contacts_id
- estate_sells.estate_restoration_id → estate_restoration.id
- estate_sells.deal_id → estate_deals.deal_id

---

## estate_sells_attr

**Назначение:** трибуты объектов (встроенные) Встроенные атрибуты объектов: ${filter_by_estate_buy_attr} https://api.macroserver.ru/docs/estate

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar |  |
| `company_id` | int |  |
| `estate_sell_id` | int | id объекта |
| `updated_at` | timestamp | timestamp модификации |
| `attr_table` | varchar | тип данных (int\|decimal\|varchar) |
| `attr_name` | varchar | имя атрибута |
| `attr_value` | varchar | значение атрибута |

**Связи:**

- estate_sells_attr.estate_sell_id → estate_sells.estate_sell_id

---

## estate_sells_price_min_stat

**Назначение:** татистика минимально возможных цен объектов Статистика минимально возможных цен объектов с учетом актуальных акций на момент фактировки Только объекты в домах

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `estate_sell_id` | int | id объекта |
| `calculation_date` | date | Дата за которую расчитана минимальная цена |
| `price` | decimal | Минимально возможная цена объекта с учетом актуальных акций |
| `area` | decimal | Площадь объекта на момент фактировки цены |

**Связи:**

- estate_sells_price_min_stat.estate_sell_id → estate_sells.estate_sell_id

---

## estate_sells_price_stat

**Назначение:** татистика цен объектов Статистика собирается в момент обновления стоимости объекта Дополнительно раз в день собираются текущие стоимости объектов и затем, раз в неделю из статистики удаляются по каждому объекту недвижимости одинаковые (по стоимости) записи, расположенные последовательно от первой записи в месяце Распространяется только на объекты в домах

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `estate_sell_id` | int | id объекта |
| `updated_at` | timestamp |  |
| `date_stat` | date | дата замера |
| `price` | int | цена общая |
| `price_m2` | int | цена за м² |

**Связи:**

- estate_sells_price_stat.estate_sell_id → estate_sells.estate_sell_id

---

## estate_sells_statuses_log

**Назначение:** стория изменения статусов объектов Лог записывается при каждом изменении статуса объекта Типовые кейсы: постановка брони: (status_from<30,status_to=30) постановка платной брони: (status_from=30,status_to=30,is_payed_reserve=1) отмена брони: (status_from=30,status_to<30) возврат сделки в бронь (не является постановкой брони с точки зрения воронки продаж): (status_from>30,status_to=30)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `log_date` | timestamp | дата события |
| `estate_sell_id` | int | id объекта |
| `deal_id` | int | id сделки в момент события |
| `deal_sum` | decimal | сумма сделки в момент события |
| `is_payed_reserve` | tinyint | признак включения платной брони |
| `status_from` | tinyint | исходный статус |
| `status_from_name` | varchar | название исходного статуса, deprecated, используйте estate_statuses.status_name |
| `status_to` | tinyint | новый статус |
| `status_to_name` | varchar | название нового статуса, deprecated, используйте estate_statuses.status_name |

**Связи:**

- estate_sells_statuses_log.estate_sell_id → estate_sells.estate_sell_id
- estate_sells_statuses_log.deal_id → estate_deals.deal_id

---

## estate_statuses

**Назначение:** татусы объектов/заявок

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `status_id` | int |  |
| `status_name` | varchar |  |

---

## estate_statuses_reasons

**Назначение:** ипы причин неактивных статусов типы причин компания формирует самостоятельно заявка, переведенная в один из неактивных статусов (отказ, отложено или нецелевой) как правило хранит поставленную менеджером причину перевода в этот статус

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `status_reason_id` | int | тип причины перевода в неактивный статус |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `type` | enum | тип причины. Values: ('giveup','wait','inactive') |
| `name` | varchar | причина |
| `is_archived` | tinyint | перемещено в архив |

---

## estate_tags

**Назначение:** еги блока недвижимость связи записей недвижимости с тегами (многие-ко-многим)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar | id связи |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `estate_id` | int | id объекта/заявки/дома/группы домов |
| `tags_id` | int | id тега |

**Связи:**

- estate_tags.estate_id → estate_houses.house_id,estate_buys.estate_buy_id,estate_sells.estate_sell_id
- estate_tags.tags_id → tags.id

---

## estate_transfer

**Назначение:** чет передачи ключей Учет передачи ключей по объекту По каждой передаче может быть несколько осмотров, см estate_transfer_attempts

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `estate_sell_id` | int | id объекта |
| `updated_at` | timestamp | timestamp модификации |
| `transfer_type` | varchar | признак передачи (out), приемки (in) |
| `transfer_status` | varchar | статус передачи (finish - "Нет замечаний"\|notices - "Есть замечания"\|declined - "Клиент уклонился от осмотра"\|"" - "Не передано") |
| `house_id` | int | id дома |
| `plan_date` | timestamp | плановая дата передачи (проведения осмотра) |
| `finish_date` | timestamp | фактическая дата передачи (проведения осмотра) |
| `formal_signed_date` | datetime | Дата подписания акта передачи помещения |
| `attempts_count` | mediumint | количество проведенных осмотров с покупателем |
| `out_responsible_id` | int | ответственный за передачу сотрудник |

**Связи:**

- estate_transfer.estate_sell_id → estate_sells.estate_sell_id,
- estate_transfer.house_id → estate_houses.house_id
- estate_transfer.out_responsible_id → users.id

---

## estate_transfer_attempts

**Назначение:** чет осмотров при передаче ключей Учет осмотров (попыток передач) объектов

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `transfer_id` | int | передача ключей |
| `attempt_user_id` | int |  |
| `date_added` | timestamp | дата осмотра |
| `estate_sell_id` | int | id объекта |
| `updated_at` | timestamp | timestamp модификации |
| `is_success` | int | признак удачной передачи |

**Связи:**

- estate_transfer_attempts.estate_sell_id → estate_sells.estate_sell_id,

---

## finances

**Назначение:** инансовые операции

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `status` | tinyint |  |
| `types_id` | int | тип операции |
| `subtypes_id` | int | подтип операции |
| `users_id` | int | инициатор |
| `manager_id` | int | менеджер |
| `respons_manager_id` | int | менеджер, ответственный за операцию |
| `date_added` | datetime | дата добавления операции |
| `date_to` | datetime | планируемая дата оплаты |
| `summa` | decimal | сумма операции |
| `estate_sell_id` | int | объект (дом или объект в сделке) |
| `deal_id` | int | id сделки |
| `contacts_id` | int | контрагент операции |
| `contacts_agreements_id` | int | контракт (документ) |
| `inventory_demands_id` | int | id заявки |
| `approved_by` | int | согласовавший сотрудник |
| `approved_date` | timestamp | дата согласования |
| `accepted_for_payment` | int | признак акцептования |
| `accepted_by` | int | акцептовавший сотрудник |
| `accepted_date` | timestamp | дата акцептования |
| `accepted_summa` | decimal | акцептованная сумма |
| `is_burning` | int | признак горящего платежа |
| `is_first_payment` | tinyint | признак первого платежа в графике платежей |
| `is_over_deal_sum` | tinyint | признак платежа в графике платежей сверх суммы сделки |
| `status_name` | varchar |  |
| `types_name` | varchar |  |
| `account_in_id` | int | счет зачисления |
| `account_out_id` | int | счет списания |
| `contact_in_id` | int | контрагент получатель |
| `contact_out_id` | int | контрагент плательщик |

**Связи:**

- finances.types_id → finances_types.id
- finances.subtypes_id → finances_subtypes.id
- finances.users_id → users.id
- finances.manager_id → users.id
- finances.respons_manager_id → users.id
- finances.estate_sell_id → estate_sells.estate_sell_id,estate_houses.house_id
- finances.deal_id → estate_deals.deal_id
- finances.contacts_id → contacts.contacts_id
- finances.inventory_demands_id → inventory_demands.demand_id
- finances.approved_by → users.id
- finances.accepted_by → users.id
- finances.account_in_id → finances_accounts.account_id
- finances.account_out_id → finances_accounts.account_id
- finances.contact_in_id → contacts.contacts_id
- finances.contact_out_id → contacts.contacts_id

---

## finances_accounts

**Назначение:** чета финансовые

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `account_id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `organization_id` | int | контакт организации счета |
| `account_name` | varchar |  |

---

## finances_subtypes

**Назначение:** одтипы финансовых операций справочник подтипов финансовых операций

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `types_id` | int | ссылка на тип |
| `subtype_name` | varchar | наименование подтипа |

---

## finances_types

**Назначение:** ипы финансовых операций справочник типов финансовых операций

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `types_name` | varchar | наименование типа |

---

## geo_city_complex

**Назначение:** илые комплексы (справочник) справочник Жилых Комплексов города обычно синхронизирован со справочником Авито/Циан

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id ЖК (справочник) |
| `geo_complex_id` | int | id ЖК (справочник) |
| `company_id` | int |  |
| `geo_complex_name` | varchar | название ЖК (справочно) |
| `city_name` | varchar | город |
| `sort_order` | tinyint |  |

---

## inventory_demands

**Назначение:** аказы на поставку ТМЦ Запись в данном наборе является позицией Заказа (demand) со своей историей (принадлежность к заказу, проекту, поставщику, снабженцу, объем поставленный, сумма оплат и тд) Demands (Заказы) является сущностю, хранящей историю и процесс заказа Номенклатур у Поставщика для Проектов на конкретные Работы. Заказы группируют Позиции заказов, где ведется пономенклатурный учет заказанных объемов. После того, как заказ сформирован создаются Движения (inventory). Движение характеризует доставку каждой позиции определенного объема Номенклатуры на Склад от определенного Поставщика. По одной позиции Заказа может быть несколько поставок Номенклатуры позиции, но все обязательно от одного Поставщика, указанного в Заказе.

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | id позиции в заказе |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `demand_item_id` | int | id позиции в заказе |
| `demand_id` | int | id заказе |
| `date_added` | date | дата добавления заказа |
| `date_status_changed` | date | дата последнего изменения статуса заказа |
| `days_status_changed` | int | дней с момента последнего изменения статуса заказа |
| `status` | int | статус заказа |
| `status_name` | varchar | имя статуса заказа |
| `projects_id` | int | id строительного проекта (ГПР) |
| `projects_tasks_id` | int | id работы в ГПР |
| `parent_id` | int | id родительского заказа (в случае разделения заказа) |
| `contacts_id` | int | id поставщика (контакт) |
| `delivery_type` | varchar | тип поставки |
| `demander_id` | int | id инициатора заказа (пользователь) |
| `supplier_id` | int | id снабженца (пользователь) |
| `supplier_contact_id` | int | id поставщика |
| `demander_user_name` | varchar | имя инициатора |
| `supplier_user_name` | varchar | имя снабженца |
| `supplier_contact_name` | varchar | имя поставщика |
| `warehouse_id` | int | id склада на который везут ТМЦ |
| `item_date_demand` | date | запрошенная дата поставки позиции |
| `item_date_plan` | date | плановая дата поставки позиции |
| `item_date_fact` | date | фактическая дата полной поставки позиции |
| `item_date_received` | date | фактическая дата последней поставки |
| `noms_id` | int | id номенклатуры из справочника |
| `item_measure` | varchar | ед.измерения в позиции заказа |
| `item_price` | decimal | цена ТМЦ в позиции заказа |
| `item_quantity` | decimal | количество ТМЦ в позиции заказа |
| `item_summa` | decimal | стоимость позиции заказа |
| `item_quantity_income` | decimal | объем поступившего материала по позиции согласно накладным |
| `item_price_income` | decimal | средняя стоимость поступивших материалов по позиции согласно накладным |
| `item_quantity_part` | decimal | количество недопоставки в позиции |
| `item_summa_part` | decimal | сумма недопоставки в позиции |
| `item_quantity_outcome` | decimal | количество переданного материала из позиции |
| `item_max_demand_days` | int | срок исполнения заказа в днях |
| `item_overdue_days` | int | количество дней просрочки (от запрошенной даты поставки) открытых исполняемых заказов |
| `item_overdue_interval` | varchar | интервал дней просрочки открытых исполняемых заказов |
| `demand_item_payed_summa` | decimal | доля совершенной оплаты, приходящейся на позицию заказа |
| `is_expired_approvement` | int | просрочено согласование заказа |
| `is_burning` | tinyint | горящий заказа |

**Связи:**

- inventory_demands.projects_id → projects.id
- inventory_demands.projects_tasks_id → projects_tasks.projects_tasks_id
- inventory_demands.parent_id → invenory_demands.id
- inventory_demands.contacts_id → contacts.contacts_id
- inventory_demands.demander_id → users.id
- inventory_demands.supplier_id → users.id
- inventory_demands.supplier_contact_id → contacts.contacts_id
- inventory_demands.warehouse_id → inventory_warehouse.warehouse_id
- inventory_demands.noms_id → noms.id

---

## inventory_noms_top

**Назначение:** ОП заказываемой номенклатуры

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `noms_id` | int | id номенклатуры |
| `noms_name` | varchar | имя часто заказываемой номенклатуры |
| `demands_count` | bigint | количество заказов данной номенклатуры |
| `item_avg_price` | decimal | средняя цена заказа данной номенклатуры |

**Связи:**

- inventory_noms_top.noms_id → noms.id

---

## inventory_warehouse

**Назначение:** клады

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `warehouse_id` | int | id склада |
| `warehouse_name` | varchar |  |
| `projects_id` | int | id проекта |

**Связи:**

- inventory_warehouse.projects_id → projects.id

---

## inventory_warehouse_stocks

**Назначение:** статки на складах

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int | позиция заказа, сформировавшего остаток на складе |
| `company_id` | int |  |
| `demand_id` | int | заказ, сформировавший остаток на складе |
| `demand_date_added` | date | дата появления заказа |
| `warehouse_id` | int | id склада |
| `projects_id` | int | id проекта к которому относится склад |
| `summa_left` | decimal | стоимость остатка номенклатуры |
| `task_date_finish_fact` | date | фактическая дата закрытия заказа |
| `task_id` | int | id работы из ГПР |
| `noms_id` | int | id номенклатуры в остатках |
| `date_received` | date | дата передачи номенклатуры на склад |
| `stocks_days_interval` | varchar | интервал дней нахождения номенклатуры на складе |

**Связи:**

- inventory_warehouse_stocks.demand_id → inventory_demands.demand_id
- inventory_warehouse_stocks.warehouse_id → inventory_warehouse.warehouse_id
- inventory_warehouse_stocks.projects_id → projects.id
- inventory_warehouse_stocks.task_id → projects_tasks.projects_tasks_id
- inventory_warehouse_stocks.noms_id → noms.id

---

## noms

**Назначение:** оменклатура (справочник)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `noms_name` | varchar | имя номенклатуры |
| `noms_parent_id` | int | id родительской категории |
| `type` | enum | тип. Values: ('inventory','service','work','machine','equipment','hold') |
| `code` | varchar | код |
| `measure` | varchar | единица измерения |
| `category_full_name` | char |  |

**Связи:**

- noms.noms_parent_id → noms_category.id

---

## noms_category

**Назначение:** атегории номенклатур

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `category_name` | varchar | имя категории |
| `category_parent_id` | int | id родительской категории |
| `category_type` | varchar | тип категории |
| `code` | varchar | код |
| `category_full_name` | varchar | полный путь категории |

**Связи:**

- noms_category.category_parent_id → noms_category.id

---

## projects

**Назначение:** роекты строительные Проект является основной учетно/процессной сущностью в структуре проектов Конечным элементом иерархии проектов является проект-график производства работ (ГПР) у которого могут быть работы (projects_tasks)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `projects_id` | int | id проекта |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `date_combined` | datetime | ! техническая дата |
| `group_id` | int | id группы проектов |
| `status` | int | статус проекта (20 - запущен) |
| `projects_name` | varchar | наименование проекта |
| `projects_name_full` | varchar | полное наименование проекта |
| `projects_sort_order` | int | порядок проекта в группе проектов |
| `project_date_finish_plan` | date | плановая дата завершения проекта |
| `project_date_finish` | date | Дата завершения проекта (ориентир) |
| `project_date_start` | date | Дата начала проекта (ориентир) |
| `completeness` | decimal | % завершения проекта |
| `duration_days` | int | продолжительность проекта |
| `duration_gone_days` | int | текущая длительность проекта |
| `duration_left_days` | int | дней до окончания проекта по плану |
| `duration_overdue_days` | int | дней просрочки окончания проекта |

**Связи:**

- projects.group_id → projects.id

---

## projects_tasks

**Назначение:** рафики производства работ Работы являются основной учетно/процессной сущностью графика производства работ Работа является конечным элементом в иерархии групп работ Каждая группа работ может включать в себя работы и другие группы работ Плановые/фактические даты групп работ автоматически высчитываются исходя из границ дат, вложенных в группу работ элементов Расширенный статус работы вычисляется на основании плановых/фактических дат работы и текущей даты и может иметь следующие значения: Не начато Просрочено начало Идет Просрочено окончание Окончено c просрочкой Окончено

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `projects_tasks_id` | int | id работы/группы работ |
| `company_id` | int |  |
| `date_combined` | datetime | ! техническая дата |
| `updated_at` | timestamp | timestamp модификации |
| `projects_id` | int | id проекта |
| `is_group` | tinyint | признак группы работ |
| `date_start` | date | плановая дата начала работы |
| `date_finish` | date | плановая дата окончания работы |
| `date_start_fact` | date | фактическая дата начала работы |
| `date_finish_fact` | date | фактическая дата окончания работы |
| `task_start_status` | varchar | статус начала работы |
| `task_finish_status` | varchar | статус окончания работы |
| `task_status_extended` | varchar | расширенный статус работы |
| `failed_start_days` | int | дней просрочки начала |
| `failed_finish_days` | int | дней просрочки окончания |
| `failed_start_interval` | varchar | интервал просрочки начала |
| `failed_finish_interval` | varchar | интервал просрочки окончания |
| `finish_delay_interval` | varchar | Интервалы фактического окончания работ относительно плановых |
| `is_finish_delay` | int | Признак просрочки окончания для завершенной работы |
| `task_name` | varchar | Название работы/группы работ |
| `prefix` | varchar | Префикс |
| `subname` | varchar | Комментарий |
| `sort_order` | int | Порядок сортировки работы внутри группы |
| `progress` | int | Прогресс выполнения работы |
| `level` | int | Уровень вложенности |
| `left_key` | int |  |
| `right_key` | int |  |
| `users_inspected` | int | пользователь, проверивший работы |
| `date_inspected` | date | дата проверки работы |
| `group_name` | varchar | имя непосредственно вышележащей группы работ |
| `full_group_name` | varchar | путь до работы |
| `task_full_group_name` | varchar | путь до работы включая название работы |
| `date_start_requests_count` | bigint | количество запросов на пролонгацию даты начала |
| `date_finish_requests_count` | bigint | количество запросов на пролонгацию даты окончания |
| `task_quality_accepted_date` | date | дата подтверждения качества работы |
| `task_quality_accepted_user` | varchar | пользователь, подтвердивший качество работы |
| `task_finished_action_date` | date | дата постановки фактической даты окончания |
| `task_finished_action_user` | varchar | пользователь, поставивший фактическую дату окончания |
| `is_task_finish_back_action` | int |  |
| `task_id` | int | id работы/группы работ (deprecated) |

**Связи:**

- projects_tasks.projects_tasks_id → projects_tasks.projects_tasks_id
- projects_tasks.projects_id → projects.id
- projects_tasks.users_inspected → users.id

---

## projects_tasks_agreements

**Назначение:** онтрактные суммы в разрезе работ Суммы всех позиций из всех контрактов в разрезе работ проектов

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar |  |
| `company_id` | int |  |
| `agreements_id` | int | id контракта |
| `projects_tasks_id` | int | id работы/группы работ |
| `created_at` | timestamp | дата создания контракта |
| `updated_at` | datetime | дата обновления позиции |
| `work_summa_agreement` | decimal | Стоимость работ |
| `inventory_default_summa_agreement` | decimal | Стоимость материалов без типа |
| `inventory_tolling_summa_agreement` | decimal | Стоимость давальческих материалов |
| `inventory_contractor_summa_agreement` | decimal | Стоимость материалов подрядчика |
| `inventory_realization_summa_agreement` | decimal | Стоимость материалов по реализации |
| `service_summa_agreement` | decimal | Стоимость услуг |
| `equipment_summa_agreement` | decimal | Стоимость оборудования |
| `machine_summa_agreement` | decimal | Стоимость маш. мех |

**Связи:**

- projects_tasks_agreements.projects_tasks_id → projects_tasks.projects_tasks_id

---

## projects_tasks_checklists

**Назначение:** анные стройконтроля Предписания и дефектовки представляют собой список элементов

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `created_at` | date | дата добавления элемента |
| `projects_id` | int | проект |
| `task_id` | int | работа |
| `type` | enum | тип элемента (notices - Предписания, defects - Дефектовка). Values: ('notices','defects','checklist') |
| `type_name` | varchar | название типа элемента |
| `type_status_name` | varchar | текущий статус записи |
| `user_initiator_name` | varchar | инициатор добавления записи |
| `user_checked_name` | varchar | инициатор закрытия записи |
| `checked_date_to` | date | дата действия до |
| `checked_date` | date | дата закрытия записи |
| `is_notices` | int | запись - предписание |
| `is_defects` | int | запись - дефектовка |
| `name` | varchar | наименование записи |

**Связи:**

- projects_tasks_checklists.projects_id → projects.id
- projects_tasks_checklists.task_id → projects_tasks.projects_tasks_id

---

## projects_tasks_estimate

**Назначение:** метные суммы в разрезе работ смета проекта в разрезе работ

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar |  |
| `company_id` | int |  |
| `smeta_id` | int | id сметы |
| `projects_tasks_id` | int | id работы/группы работ |
| `updated_at` | timestamp | дата обновления сметных показателей |
| `work_summa_plan` | decimal | Стоимость работ |
| `inventory_summa_plan` | decimal | Стоимость материалов |
| `service_summa_plan` | decimal | Стоимость услуг |
| `equipment_summa_plan` | decimal | Стоимость оборудования |
| `machine_summa_plan` | decimal | Стоимость маш. мех |
| `summa_overhead` | decimal |  |
| `summa_profit` | decimal | Сметная прибыль |
| `summa_temporary` | decimal | Расходы на временные здания и сооружения |
| `summa_winter` | decimal | Расходы на зимнее удорожания |
| `summa_other` | decimal | Прочие расходы |
| `summa_nds` | decimal | НДС |
| `summa_profit_overhead_from_machine_salary` | decimal | Сметная прибыль и накладные расходы от зарплаты машинистов |

**Связи:**

- projects_tasks_estimate.projects_tasks_id → projects_tasks.projects_tasks_id

---

## projects_tasks_requests

**Назначение:** апросы на пролонгацию в ГПР

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `projects_id` | int | id проекта |
| `projects_tasks_id` | int |  |
| `status` | tinyint | статус запроса |
| `status_name` | varchar | наименование статуса запроса |
| `reason` | varchar | причина отклонения запроса |
| `date_start` | date | плановая дата начала работ на момент запроса |
| `date_finish` | date | плановая дата окончания работ на момент запроса |
| `date_start_fact` | date | фактическая дата начала работ на момент запроса |
| `date_finish_fact` | date | фактическая дата окончания работ на момент запроса |
| `request_date_start` | date | новая запрошенная плановая дата начала |
| `request_date_finish` | date | новая запрошенная плановая дата окончания |
| `date_approved` | date | дата одобрения запроса |
| `user_approved` | varchar | пользователь, одобривший запрос |
| `user_requested` | varchar | пользователь, открывший запрос |
| `request_date_created` | date | дата создания запроса |
| `request_days` | int | длительность текущего открытого запроса |
| `open_request_days_interval` | varchar | интервал продолжительности текущего открытого запроса |
| `closed_request_days_interval` | varchar | интервал продолжительности одобрения запроса |
| `task_name` | varchar | наименование работы |
| `task_group_name` | varchar | наименование группы работ |

**Связи:**

- projects_tasks_requests.projects_id → projects.id

---

## promos

**Назначение:** кции

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `promo_id` | int | id акции |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `promo_name` | varchar | имя пользователя |
| `promo_discount` | decimal | величина скидки |
| `promo_rule` | varchar | правило изменения цены (без изменения, цена, цена за м²) |
| `promo_type` | varchar | скидка в валюте или процентах |
| `promo_date_from` | date | дата начала акции |
| `promo_date_to` | date | дата окончания акции |

---

## stat

**Назначение:** спомогательные данные для построения отчетов

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `param_name` | varchar |  |
| `param_value` | varchar |  |

---

## tags

**Назначение:** еги компании полный перечень тегов компании

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `tags_name` | varchar |  |

---

## tasks

**Назначение:** адачи

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `category_id` | int |  |
| `date_modified` | timestamp | дата изменения |
| `estate_id` | int | id объекта (дом или квартира) либо id заявки |
| `contacts_id` | int | id контакта |
| `category_name` | varchar | имя категории |
| `status` | int | id статуса |
| `is_closed` | int | задача закрыта |
| `priority` | int | приоритет задачи |
| `progress` | tinyint | прогресс выполнения |
| `date_added` | date | дата добавления задачи |
| `date_finish` | date | плановая дата завершения |
| `date_finish_time` | time | плановое время завершения |
| `date_finish_fact` | date | фактическая дата завершения |
| `date_finish_fact_time` | time | фактическое время завершения |
| `date_combined` | date | ! |
| `hours_plan` | decimal | часов запланировано |
| `hours_fact` | decimal | часов затрачено |
| `type` | varchar | тип задачи |
| `custom_type` | varchar | кастомный тип задачи: пример - встреча в офисе (meeting)/объект(meeting_house) |
| `custom_type_name` | varchar | название кастомного типа задачи |
| `title` | varchar | заголовок задачи |
| `type_name` | varchar |  |
| `status_name` | varchar |  |
| `assigner_id` | int | id постановщика |
| `manager_id` | int | id исполнителя |
| `assigner_name` | varchar | постановщик |
| `manager_name` | varchar | исполнитель |

**Связи:**

- tasks.estate_id → estate_buys.estate_buy_id,estate_sells.estate_sell_id,estate_houses.house_id
- tasks.contacts_id → contacts.contacts_id
- tasks.assigner_id → users.id
- tasks.manager_id → users.id

---

## tasks_tags

**Назначение:** еги задач связи задач с тегами (многие-ко-многим)

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | varchar | id связи |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `tasks_id` | int | id задачи |
| `tags_id` | int | id тега |

**Связи:**

- tasks_tags.tasks_id → tasks.id
- tasks_tags.tags_id → tags.id

---

## users

**Назначение:** ользователи компании

| Поле | Тип | Комментарий |
|------|-----|--------------|
| `id` | int |  |
| `company_id` | int |  |
| `updated_at` | timestamp | timestamp модификации |
| `users_name` | varchar | имя пользователя |
| `departments_id` | int | id отдела пользователя |
| `post_title` | varchar |  |
| `role` | varchar | роль сотрудника в компании |
| `is_fired` | tinyint | признак уволенного сотрудника |

**Связи:**

- users.departments_id → company_departments.departments_id

---

## Примеры значений (выборочно)

Ниже — примеры данных из БД по части таблиц (источник: `api_samples.txt`, формируется при наличии подключения к БД).

```
ПРИМЕРЫ ДАННЫХ ИЗ БД (только чтение, для ориентира ИИ; не менять БД):
По этим примерам видно, какие значения встречаются в полях и в каком формате.

finances.status_name (статусы платежей): К оплате, Отклонено, Проведено
finances: пример date_to, summa, deal_id: date_to=Mon May 01 2023 14:00:00 GMT+0300 (Moscow Standard Time) summa=6257600.00 deal_id=770471; date_to=Wed May 03 2023 18:48:15 GMT+0300 (Moscow Standard Time) summa=100000.00 deal_id=770484
estate_buys.channel_name (источники заявок): +7.2162233, +7.3433892400, +7.3519438015, +7.3852556666, +7.4473700001, +7.7077079999, +7.7079001615, +7.7079001712, +7.7475199999, +7.7479001614, +7.7750204416, +7.7750372917, +7.8005500973, +7.8007074569, +7.9025333326, +7.9140001305, +7.9223962570, +7.9241175454, +7.9584983951, +7.9585782472, +7.9587714072, +7.9618450802, 2ГИС, 707, 781136092
estate_deals.deal_status, deal_date: 5, 103, 105, 110, 140, 150
estate_deals: пример deal_date: deal_date=Tue Jan 04 2022 00:00:00 GMT+0300 (Moscow Standard Time) deal_status=150; deal_date=Sat Mar 26 2022 00:00:00 GMT+0300 (Moscow Standard Time) deal_status=150
estate_buys: пример created_at: Mon Apr 03 2023 12:27:59 GMT+0300 (Moscow Standard Time)
contacts: наличие contacts_buy_name, contacts_buy_phones: есть записи с именами/телефонами
estate_houses.name / public_house_name: name=ЖК «Capital City» Блок №1; name=ЖК «Capital City» Блок №2
estate_sells.plans_name, geo_flatnum: plans_name=109 geo_flatnum=2-7-1-1-3; plans_name=003 geo_flatnum=1-1-1-1-1
```
