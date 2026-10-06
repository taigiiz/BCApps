# ADR-0015: Frontend — React + TypeScript + AG Grid Community, мөнгийг string-ээр

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §3, §5.3, §15. [ADR-0006](./ADR-0006-money-and-rounding.md), [ADR-0016](./ADR-0016-auth-openiddict-bff.md), [ADR-0017](./ADR-0017-i18n-mongolian-first.md)

## Нөхцөл байдал

- **Хүснэгт ихтэй UI.** Нягтлан бодох бүртгэлийн UI нь хүснэгтэд суурилсан: журнал, баримтын мөр, ledger, тайлан. Хүснэгт гараар хурдан оруулах, засах, шүүх, эрэмбэлэх боломжтой байх ёстой.
- **AG Grid Community** MIT лицензтэй. Excel экспорт, row grouping, aggregation, pivot, server-side row model нь **Enterprise (төлбөртэй)** хувилбарт л байдаг ([tech-architecture.md](../research/tech-architecture.md) §9).
- **JavaScript-д decimal байхгүй.** Мөнгийг JSON number-ээр дамжуулбал нарийвчлал алдагдана.
- **Хүний нөөц.** React ба TypeScript-ийн хөгжүүлэгч олдоход хялбар. Монголын зах зээлийн тоо UNVERIFIED.

## Шийдвэр

1. **Стек:**
   - React + TypeScript (strict) + Vite;
   - TanStack Query (серверийн төлөв), React Router, React Hook Form;
   - OpenAPI-аас үүсгэсэн төрөлжсөн клиент (`openapi-typescript` + `openapi-fetch`).
2. **Grid:** AG Grid Community.
   - Grouping, нийлбэр, Excel экспортыг **сервер** хийнэ (SQL ба ClosedXML).
   - Олон мөртэй жагсаалтад infinite row model ба серверийн keyset хуудаслалт ашиглана.
   - Enterprise лиценз авахгүй. Хэрэгцээ гарвал ADR бичнэ.
3. **Мөнгө:**
   - API-д мөнгийг **string** хэлбэрээр дамжуулна (`"12345.67"`).
   - Клиент дотор `decimal.js`-ийн `Decimal` төрлөөр ажиллана.
   - Мөнгийн нүдийг тусгай `MoneyCellEditor`/`MoneyCellRenderer` удирдана.
   - Клиентийн нийлбэр зөвхөн урьдчилсан харуулалт. **Эцсийн дүнг сервер гаргана.** Сервер `ITaxCalculator`-ийн үр дүнгээр хариулахад UI-ийн утгыг солино.
4. **Аюулгүй байдал:**
   - Токен браузерт хадгалагдахгүй (BFF cookie, [ADR-0016](./ADR-0016-auth-openiddict-bff.md)).
   - Төлөв өөрчлөх хүсэлт бүр `X-CSRF: 1` header-тэй.
   - CSP `default-src 'self'`. AG Grid v33+ runtime-д `<style>` оруулдаг. Тиймээс `style-src`-д nonce ба grid-ийн `styleNonce`, эсвэл legacy CSS theme файл ашиглана. `'unsafe-inline'` хэрэглэхгүй ([02-architecture.md](../02-architecture.md) §10.3).
   - Гадаадын CDN ба фонт ашиглахгүй (фонтыг өөрсдөө host хийнэ).
   - **eBarimt-ийн `PrintPayload`** (`qrData`, `lottery`)-ийг зөвхөн санах ойд хадгалж хэвлэнэ. Дараах газар хадгалахгүй, илгээхгүй: `localStorage`, `sessionStorage`, IndexedDB, алдааны тайлан.
5. **Хэвлэх.** Баримт ба нэхэмжлэхийг серверийн PDF-ээр хэвлэнэ (QuestPDF). POS-ийн 58/80 mm баримтыг браузерийн print CSS-ээр, `PrintPayload`-аас санах ойд зурна.
6. **i18n.** i18next ([ADR-0017](./ADR-0017-i18n-mongolian-first.md)).
7. **Чанарын шалгалт:**
   - ESLint ба TypeScript strict;
   - Vitest (unit);
   - Playwright (e2e, монгол хэлний UI-аар);
   - axe (хүртээмж: WCAG 2.2 AA зорилт);
   - Lighthouse-ийн budget: JS bundle < 400 KB gzip (эхний ачаалалт).
8. **Deploy.** SPA нь API-тай нэг release-ээр гарна. Static файлыг nginx үйлчилнэ.

## Үр дагавар

**Эерэг:**
- Лицензийн зардал 0.
- Хүснэгттэй хурдан ажиллах UX.
- Мөнгөний нарийвчлал алдагдахгүй.

**Сөрөг ба эрсдэл:**
- **Enterprise-ийн grouping ба pivot байхгүй.** Серверийн тайлангаар орлуулна. Хэрэглэгч pivot хүсвэл XLSX экспорт өгнө.
- **Backend ба frontend хоёр хэл.** OpenAPI-аас үүсгэсэн клиент төрлийг синк байлгана.
- **AG Grid-ийн лицензийн нөхцөл өөрчлөгдөж болно.** Нөхцөлийг жил бүр хянана.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Blazor (WASM эсвэл Server) | Нэг хэл (C#), validation-ийг хуваалцана | Компонентын зах зээл бага. WASM-ийн ачаалалт хүнд. Server горим холболтын төлөв шаарддаг | Экосистем ба хүний нөөц |
| DevExtreme / DevExpress | Бэлэн баялаг компонент | Арилжааны лиценз | Зардал |
| AG Grid Enterprise | Grouping, pivot, Excel | Хөгжүүлэгч бүрийн лиценз | v1-д хэрэггүй |
| Мөнгийг JSON number-ээр | Энгийн | IEEE-754-ийн нарийвчлалын алдаа | Зөв байдал |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §3 (6), §9, TA-02
- AG Grid: https://github.com/ag-grid/ag-grid
- TC39 Decimal proposal: https://github.com/tc39/proposal-decimal
