# Бичил ERP (Монгол): хөгжүүлэлтэд бэлэн багц

Энэ хавтсанд Монголын бичил бизнест (1–10 ажилтан) зориулсан **шинэ, бие даасан ERP/санхүүгийн систем**-ийн баримтууд байна. Систем нь Microsoft Dynamics 365 Business Central (BC)-ийн нягтлан бодох логикийг хялбарчилж дуурайна. Бүрэлдэхүүн:
- судалгаа;
- төлөвлөгөө ба тодорхойлолтууд;
- PostgreSQL схем ба Монгол анхдагч тохиргоо;
- build хийгддэг .NET skeleton;
- тайлбартай HTML загвар.

> Төлөв: **Sprint 0-д бэлэн (нөхцөлтэй)**. Үлдсэн blocker-уудыг [REVIEW-readiness.md](REVIEW-readiness.md)-ээс үзнэ.
> Технологи: .NET 10 · PostgreSQL 17/18 · React + TypeScript · Монголд байршуулна.

## Хаанаас эхлэх вэ

| Хэн | Унших дараалал |
|---|---|
| Бизнес эзэн / PO | [00-overview](00-overview.md) → [HTML загвар](prototype/README.md) → [17-backlog-roadmap](17-backlog-roadmap.md) → [19-risks-open-questions](19-risks-open-questions.md) |
| Нягтлан / татварын зөвлөх | [DECISIONS](DECISIONS.md) (⚠ мөрүүд) → [08-tax-vat-mn](08-tax-vat-mn.md) → [10-periods-closing-reporting](10-periods-closing-reporting.md) → [db/seed/README](db/seed/README.md) (дансны төлөвлөгөө) |
| Tech lead / хөгжүүлэгч | [DECISIONS](DECISIONS.md) → [02-architecture](02-architecture.md) + [adr/](adr/README.md) → [03-domain-model](03-domain-model.md) → [db/](db/README.md) → [05-posting-engine](05-posting-engine.md) → [18-dev-setup](18-dev-setup.md) → [starter/](starter/README.md) |

## Агуулга

| Файл | Юу байгаа вэ |
|---|---|
| [DECISIONS.md](DECISIONS.md) | Шийдвэрийн бүртгэл: бүх баримтын нэг эх сурвалж |
| [00-overview.md](00-overview.md) | Алсын хараа, хэрэглэгчид, хамрах хүрээ (R1/R2/R3), BC-ээс юуг авч, юуг хялбарчлах вэ |
| [01-requirements.md](01-requirements.md) | 216 функциональ шаардлага (FR), функциональ бус шаардлага (NFR), хуулийн шаардлага (CMP) |
| [02-architecture.md](02-architecture.md), [adr/](adr/README.md) | Архитектур ба 23 шийдвэрийн тэмдэглэл (ADR) |
| [03-domain-model.md](03-domain-model.md) | Модулиуд, ER диаграм, BC хүснэгт → шинэ хүснэгтийн харгалзаа, инвариантууд |
| 05–16 | Модулийн тодорхойлолтууд: [posting engine](05-posting-engine.md), [борлуулалт/авлага](06-sales-receivables.md), [худалдан авалт/өглөг](07-purchases-payables.md), [НӨАТ/татвар](08-tax-vat-mn.md), [банк/касс/валют](09-bank-cash-fx.md), [үе/хаалт/тайлан](10-periods-closing-reporting.md), [үндсэн хөрөнгө/бараа](11-fixed-assets-inventory.md), [eBarimt](12-ebarimt-integration.md), [аюулгүй байдал](13-security-audit-tenancy.md), [API](14-api.md) + [openapi.yaml](api/openapi.yaml), [UI/UX](15-ui-ux.md), [тест](16-test-strategy.md) |
| [17-backlog-roadmap.md](17-backlog-roadmap.md) | 33 epic, R1-ийн 179 story, sprint төлөвлөгөө, milestone |
| [18-dev-setup.md](18-dev-setup.md) | Репогийн бүтэц, дүрэм, CI/CD, орчин, эхний өдрийн заавар |
| [19-risks-open-questions.md](19-risks-open-questions.md) | 29 эрсдэл, 96+ нээлттэй асуулт (хэн хариулах, хэзээ хүртэл) |
| [99-glossary.md](99-glossary.md) | Монгол ↔ Англи ↔ BC нэр томьёо |
| [db/](db/README.md) | PostgreSQL схем (201 хүснэгт), Монгол seed (дансны төлөвлөгөө, тохиргоо, Form A, ТТ-03а), хуулийн параметрүүд, тестүүд, [CHANGE_REQUESTS](db/CHANGE_REQUESTS.md) |
| [starter/](starter/README.md) | Шинэ репогийн загвар: .NET 10 walking skeleton (125 тест), CI, docker-compose, analyzer |
| [prototype/](prototype/README.md) | Mockup өгөгдөлтэй, тайлбартай HTML загвар (`standalone.html`-ийг хөтчөөр нээнэ) |
| [research/](research/) | BC эх кодын судалгаа (11 хэсэг, баталгаажуулсан), Монголын татвар/НББ/интеграци/технологийн судалгаа |
| [REVIEW-consistency.md](REVIEW-consistency.md), [REVIEW-readiness.md](REVIEW-readiness.md) | Нийцлийн ба бэлэн байдлын хяналт |

## Шалгах командууд

```bash
# DB: схем + seed + тест (хоосон DB дээр)
bash db/apply.sh "postgresql://<user>@<host>/<db>" --seed --test

# .NET skeleton
cd starter && dotnet restore && dotnet build -c Release && ERP_TEST_DB="host=... dbname=erp_skeleton_test" dotnet test

# HTML загварын тестүүд
node prototype/tests/engine_check.js
```

## Анхааруулга

- Хуулийн параметрүүдийн нэг хэсэг баталгаажаагүй (`status=unverified`). Production-д ашиглахаас өмнө legalinfo.mn болон татварын зөвлөхөөр баталгаажуулна ([19](19-risks-open-questions.md) §3).
- Дансны төлөвлөгөө ба Form A/ТТ-03а-ийн мөрүүд нь **санал** болгож буй загвар. Албан ёсны маягттай тулгах шаардлагатай.
- Prototype болон жишээнүүд дэх компани, харилцагч, ТТД бүгд зохиомол.
