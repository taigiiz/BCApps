# ADR-0016: Нэвтрэлт — ASP.NET Core Identity + OpenIddict (OIDC), BFF cookie

- **Төлөв:** Батлагдсан (Accepted)
- **Огноо:** 2026-10-06
- **Шийдвэр гаргагч:** Архитектурын баг
- **Холбогдох:** [02-architecture.md](../02-architecture.md) §10.1–§10.3. [ADR-0005](./ADR-0005-tenant-vs-company.md), [ADR-0015](./ADR-0015-frontend-react-ag-grid.md)

## Нөхцөл байдал

- **Хэрэглэгчийн загвар.** Хэрэглэгч глобал бөгөөд олон тенантын гишүүн байж болно ([ADR-0005](./ADR-0005-tenant-vs-company.md)).
- **Шаардлагууд:**
  - эрх бүхий role-уудад MFA;
  - ирээдүйн мобайл апп ба гадаад интеграцид стандарт OAuth2/OIDC;
  - SPA-ийн токен браузерт хадгалагдахгүй байх (XSS-ийн эрсдэл).
- **Хувилбарууд:**
  - Duende IdentityServer арилжааны лицензтэй;
  - Keycloak нь тусдаа Java сервер;
  - OpenIddict Apache-2.0 лицензтэй, ASP.NET Core дотор ажилладаг ([tech-architecture.md](../research/tech-architecture.md) §8).
- **ДАН (төрийн e-ID)-ийг** хувийн SaaS ашиглаж болох эсэх UNVERIFIED.

## Шийдвэр

1. **Хэрэглэгчийн сан:** ASP.NET Core Identity (`identity` схем).
   - Нууц үг: default hasher (PBKDF2-HMAC-SHA512), ≥ 10 тэмдэгт.
   - Lockout: 5 буруу оролдлого → 15 мин.
   - Имэйлийн баталгаажуулалт.
   - TOTP MFA ба сэргээх кодууд.
2. **OIDC сервер:** OpenIddict, `erp-api` процесс дотор. Client-ууд:

   | Client | Flow | Хэрэглээ |
   |---|---|---|
   | `erp-bff` | Confidential, authorization code + PKCE | SPA |
   | `erp-mobile` | Public, code + PKCE | Ирээдүйн мобайл апп |
   | Интеграцийн client | `client_credentials` | Тенантын эзэмшигч UI-аас үүсгэнэ. Scope ба компаниар хязгаарлагдана |

   - Access token 10 мин. Refresh token эргэлддэг, хугацаа 8 цаг.
   - Гарын үсгийн (ES256, ECDSA P-256) ба шифрлэлтийн түлхүүр нь X.509 сертификат хэлбэрээр runtime secret-ээс (`/run/secrets`, [02-architecture.md](../02-architecture.md) §10.4) ачаалагдана. Тэдгээр DB-д хадгалагдахгүй.
   - 90 хоног тутам солигдоно. Солихдоо шинэ сертификатыг хуучинтай зэрэг бүртгэнэ: шинэ токеныг шинэ түлхүүрээр гаргана, хуучнаар нь ≥ 8 цаг (refresh token-ий хугацаа) шалгасаар байна. Дараа нь хуучныг хасна.
   - ASP.NET Core Data Protection-ийн түлхүүрийн цагираг (cookie ба session ticket-ийн шифрлэлт) `platform.data_protection_key`-д X.509-ээр шифрлэгдэж хадгалагдана.
3. **BFF загвар:**
   - SPA-д зөвхөн `__Host-erp` cookie очно (`HttpOnly`, `Secure`, `SameSite=Strict`).
   - Токен сервер талд хадгалагдана: `identity.user_session` (`ITicketStore`, Data Protection-оор шифрлэсэн). `erp-api` олон instance-тэй тул санах ойн session хэрэглэхгүй.
   - Session: идэвхгүй 60 мин, хамгийн урт 12 цаг. Refresh token нь 8 цагийн sliding хугацаатай, эргэлддэг (OpenIddict-ийн rolling refresh token).
   - Төлөв өөрчлөх хүсэлтэд `X-CSRF: 1` header заавал.
   - API нь SPA-аас ирсэн cookie ба интеграцийн Bearer токен хоёуланг хүлээн авна. Хоёул нэг authorization policy-оор дамжина.
4. **Claim:**
   - `sub` (user id);
   - `erp_tid` (идэвхтэй тенант, membership-ээр баталгаажсан);
   - `amr` (MFA).

   **Компани токенд байхгүй.** Компани URL-д байх бөгөөд хүсэлт бүрд membership-ээр шалгагдана ([02-architecture.md](../02-architecture.md) §7.3).
5. **MFA заавал:**
   - Owner, ChiefAccountant, Accountant;
   - `platform.security.*` эсвэл `gl.period.close` эрхтэй хэн боловч.

   MFA-гүй session-д эдгээр эрх идэвхжихгүй (step-up).
6. **Эрх.** Permission string, permission set ба role (BC-ийн `D365 …` загвар). Оноолт (хэрэглэгч, компани) хосоор хийгдэнэ ([02-architecture.md](../02-architecture.md) §10.2).
7. **Аудит.** Нэвтрэлт, амжилтгүй оролдлого, MFA-ийн өөрчлөлт, эрхийн өөрчлөлт, тенант солих, support-ийн хандалт `audit.security_event`-д бичигдэнэ.
8. **ДАН ба гадаад IdP** (Google, Microsoft) v1-д хийгдэхгүй. OpenIddict-д external login provider нэмэхэд архитектур өөрчлөгдөхгүй.

## Үр дагавар

**Эерэг:**
- Нэмэлт сервис ажиллуулах шаардлагагүй.
- Стандарт OIDC.
- Токен браузерт очихгүй.
- Олон тенантын membership загвартай шууд нийцнэ.

**Сөрөг ба эрсдэл:**
- **Нэвтрэлтийн аюулгүй байдал бидний хариуцлага.** Pentest хийлгэж, OWASP ASVS 5.0 L2-ийг дагана.
- **OpenIddict-ийн шинэчлэлийг** дагаж мөрдөнө.
- **Keycloak-ийн admin UI ба federation байхгүй.** Хэрэгтэй бол OIDC стандартын ачаар солих боломжтой.

## Харьцуулсан хувилбарууд

| Хувилбар | Давуу тал | Сул тал | Яагаад сонгоогүй |
|---|---|---|---|
| Keycloak | Бэлэн admin, federation, MFA | Тусдаа Java сервер ба DB, үйл ажиллагаа | Энгийн байдал |
| Duende IdentityServer | Боловсорсон | Арилжааны лиценз | Зардал |
| Зөвхөн cookie auth (OIDC-гүй) | Хамгийн энгийн | Мобайл ба интеграцид стандарт OAuth хэрэгтэй | Ирээдүйн шаардлага |
| SPA-д access token (localStorage) | Энгийн | XSS-ээр токен алдагдана | Аюулгүй байдал |

## Холбоос

- [tech-architecture.md](../research/tech-architecture.md) §8, TA-12
- OpenIddict: https://github.com/openiddict/openiddict-core
- BC permission set-ийн жишээ: [`d365basic.permissionset.al`](../../../../src/Layers/W1/BaseApp/Permissions/d365basic.permissionset.al), [`d365accountants.permissionset.al`](../../../../src/Layers/W1/BaseApp/Permissions/d365accountants.permissionset.al)
