# ADR-0022: Нөөц хуулбар (pgBackRest, PITR), DR, 10 жилийн архив

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §12.5–§12.8. [ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md), [ADR-0023](./ADR-0023-compliance-gates.md)

## Нөхцөл байдал

- **Хадгалах хугацаа.** Нягтлан бодох бүртгэлийн баримт, бүртгэл, тайланг **≥ 10 жил** хадгална ([mn-accounting.md](../research/mn-accounting.md) §2.6).
- **Өгөгдлийн алдагдал.** Ledger алдагдвал засах боломжгүй. Логик алдаа (буруу migration) ч ялгаагүй аюултай.
- **Байршил.** Нөөц хуулбар Монголоос гарахгүй ([ADR-0013](./ADR-0013-hosting-in-mongolia-posapi-operator.md)).
- **pgBackRest** нь MIT лицензтэй. Full, differential, incremental нөөц, async WAL push, шифрлэлт, retention-ийг дэмждэг ([tech-architecture.md](../research/tech-architecture.md) §14).
- **PosAPI-ийн local төлөв.** Илгээгдээгүй баримт PosAPI-ийн дискэнд байна.

## Шийдвэр

1. **pgBackRest repo1** ДЦ-2-т (Монголд) байна, `aes-256-cbc`-ээр шифрлэгдэнэ:
   - full долоо хоног бүр, differential өдөр бүр;
   - WAL тасралтгүй (`archive_timeout = 60s`, `archive-async = y`);
   - `repo1-retention-full-type=time`, `repo1-retention-full=35` → **PITR-ийн цонх ≥ 35 хоног** (хамгийн хуучин full ≈ 35–42 хоног). Тоогоор хадгалах (`retention-full=5`) нь долоо хоногийн full-тэй үед ≈ 28–35 хоногийн цонх л өгнө.

   **repo2** нь object storage дээр байна (боломжтой бол object lock, lock-ийн хугацаа ≤ retention). Сар бүрийн full-ийг 12 сар хадгална (`repo2-retention-full=12`).
2. **HA.** Primary + **synchronous standby** (ДЦ-1 дотор), `synchronous_standby_names = 'ANY 1 (pg02)'`. Standby 1 мин-ээс удаан унавал runbook-ээр async горимд шилжиж alert гаргана.
3. **RPO ба RTO зорилт:**

   | Сценари | RPO | RTO |
   |---|---|---|
   | Node унах | 0 | DB ≤ 30 мин (гараар promote). Patroni нэвтрүүлсний дараа ≤ 1 мин |
   | Логик алдаа | Сонгосон цэг | ≤ 4 цаг |
   | ДЦ-1 бүхэлдээ алдагдах | ≤ 5 мин | ≤ 4 цаг |
   | PosAPI алдагдах | Илгээгдээгүй баримт ≤ 1 цаг | ≤ 2 цаг |

4. **Шалгалт:**
   - `pgbackrest verify` өдөр бүр;
   - **сар бүр автомат сэргээх дасгал** scratch кластерт: migration-ийн хувилбар, компани бүрийн гүйлгээ баланс = 0, hash chain, RLS-ийн каталог;
   - **жилд 2 удаа** бүрэн DR дасгал.
5. **Бусад өгөгдөл:**
   - **Object storage:** versioning, ДЦ-2 рүү replication, устгасан объектыг 30 хоног хамгаална.
   - **PosAPI:** VM snapshot цаг тутам (24 цаг хадгална) ба өдөр тутам (7 хоног), `sendData` 4 цаг тутам.
6. **Нөөц хуулбар ≠ хуулийн архив.** 10 жилийн хадгалалтыг **жилийн архивын багц** хангана. Багц нь жилийн хаалтын дараа компани бүрд үүснэ:
   - PDF тайлан ба бүртгэлүүд;
   - ledger-ийн CSV + JSON schema;
   - posted баримтын PDF ба хавсралт;
   - eBarimt-ийн лог;
   - аудитын лог;
   - register-ийн hash-ууд;
   - SHA-256 manifest;
   - GA-аас хойш PAdES гарын үсэг.

   Object storage-д 10 жилийн retention-тэй хадгалагдаж, тенантад татаж авах боломжтой.
7. **Бодит өгөгдөл хадгалах хугацаа.** DB дахь ledger ба аудитын лог тенант идэвхтэй байх хугацаанд бүтнээр хадгалагдана. Purge зөвхөн гэрээ дууссаны дараах журмаар хийгдэнэ ([02-architecture.md](../02-architecture.md) §7.7).
   - Purge хийгдсэн тенантын өгөгдөл нөөц хуулбарт retention дуустал үлдэнэ: repo1 ≤ 42 хоног, repo2 ≤ 12 сар. Энэ хугацааг DPA-д бичнэ.
   - Нөөцөөс сэргээх бүрд `platform.tenant_purge_log`-ийн жагсаалтаар purge-ийг дахин ажиллуулна.

## Үр дагавар

**Эерэг:**
- Нэг цэгийн алдаа өгөгдөл алдагдуулахгүй (sync standby).
- Сайт бүхэлдээ алдагдахад ≤ 5 мин алдагдана.
- Хуулийн архив DB-ийн нөөцөөс хамааралгүй, хүний уншиж болохуйц хэлбэртэй.

**Сөрөг ба эрсдэл:**
- **Synchronous standby** нь commit-ийн хоцрогдлыг бага зэрэг нэмнэ (ДЦ доторх сүлжээ). Standby унах үед runbook шаардлагатай.
- **Гараар promote хийх RTO** (≤ 30 мин). 3 000-аас олон тенанттай болоход Patroni-гийн ADR бичнэ.
- **PosAPI-ийн илгээгдээгүй баримт алдагдах** эрсдэлийг бүрэн арилгах боломжгүй. ITC-тэй тодруулна.
- **Нөөцийн хадгалах зай.** 5 000 тенантад ойролцоогоор 12 TB.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| `pg_dump` шөнө бүр | Энгийн | PITR байхгүй. RPO 24 цаг. Том DB-д удаан | RPO |
| Barman | Боловсорсон | GPL-3.0. pgBackRest-ийн async WAL ба шифрлэлт илүү | pgBackRest хангалттай |
| Managed DB-ийн нөөц | Үйл ажиллагаагүй | Монголын провайдерт байгаа эсэх UNVERIFIED | Боломжтой бол нэмэлт давхарга болгоно |
| Async standby л | Commit хурдан | Node унахад өгөгдөл алдагдах эрсдэл | Ledger-ийн RPO = 0 |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §14, TA-15
- [mn-accounting.md](../research/mn-accounting.md) §2.6, REQ-ACC-09
- pgBackRest: https://github.com/pgbackrest/pgbackrest
