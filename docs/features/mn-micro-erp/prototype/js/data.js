/* =============================================================================
   js/data.js — window.ERP.data: mock (fictional) company, seed setup and SOURCE transactions.

   Everything in here is either (a) a copy of the MN seed package in db/seed/*.sql (chart of accounts,
   posting setups, VAT setup, number series, Form A rows, ТТ-03а rows) or (b) fictional master data and
   source documents. No ledger, balance or report figure is stored here: js/engine.js posts the source
   transactions on startup and every screen reads the resulting ledgers.

   Amounts in source documents are decimal STRINGS (D-C1: never floats); the engine converts them to
   integer cents. Quantities and unit prices are strings too (numeric(19,5) / numeric(19,6)).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = (window.ERP = window.ERP || {});

  // ---------------------------------------------------------------------------
  // Chart of accounts — generated 1:1 from db/seed/mn_10_coa.sql (182 rows).
  // [no, type(P/H/B/E), name, category, normal side (D/C/B), direct_posting, totaling, indentation,
  //  Form A line (СБТ for 1-3xxx, ОДТ for 5-9xxx), МГТ cash-flow category, default gen. prod., default VAT prod.]
  // ---------------------------------------------------------------------------
  var COA_ROWS = [
    ["1000", "B", "ХӨРӨНГӨ", "ASSETS", "D", false, null, 0, null, null, null, null],
    ["1001", "B", "Эргэлтийн хөрөнгө", "ASSETS", "D", false, null, 1, null, null, null, null],
    ["1099", "H", "Мөнгө, түүнтэй адилтгах хөрөнгө", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1100", "P", "Касс (төгрөг)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1101", "P", "Касс (гадаад валют)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1110", "P", "Харилцах данс (төгрөг)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1111", "P", "Харилцах данс 2 (төгрөг)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1115", "P", "Харилцах данс (гадаад валют)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1120", "P", "Цахим хэтэвч (QPay г.м.)", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1121", "P", "Картын төлбөрийн тооцоо", "ASSETS", "D", false, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1130", "P", "Богино хугацаат хадгаламж (3 сар хүртэл)", "ASSETS", "D", true, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1140", "P", "Замд яваа мөнгөн хөрөнгө", "ASSETS", "D", true, null, 3, "1.1.1", "CASH_TRANSFER", null, null],
    ["1199", "H", "Дансны авлага", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1200", "P", "Дансны авлага", "ASSETS", "D", false, null, 3, "1.1.2", "OP_CUST_RECEIPTS", null, null],
    ["1201", "P", "Дансны авлага (гадаад)", "ASSETS", "D", false, null, 3, "1.1.2", "OP_CUST_RECEIPTS", null, null],
    ["1250", "P", "Найдваргүй авлагын хасагдуулга", "ASSETS", "C", true, null, 3, "1.1.2", "NON_CASH", null, null],
    ["1299", "H", "Татвар, бусад авлага", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1300", "P", "Орцын НӨАТ (татварын авлага)", "ASSETS", "D", false, null, 3, "1.1.3", "OP_TAXES_PAID", null, null],
    ["1310", "P", "ААНОАТ-ын урьдчилгаа төлөлт", "ASSETS", "D", true, null, 3, "1.1.3", "OP_TAXES_PAID", null, null],
    ["1330", "P", "Бусад татвар, НДШ-ийн авлага", "ASSETS", "D", true, null, 3, "1.1.3", "OP_TAXES_PAID", null, null],
    ["1350", "P", "Бусад авлага", "ASSETS", "D", true, null, 3, "1.1.4", "OP_OTHER_RECEIPTS", null, null],
    ["1360", "P", "Ажилтнаас авах авлага", "ASSETS", "D", false, null, 3, "1.1.4", "OP_OTHER_PAYMENTS", null, null],
    ["1370", "P", "Богино хугацаат олгосон зээл", "ASSETS", "D", true, null, 3, "1.1.5", "INV_LOANS_GIVEN", null, null],
    ["1399", "H", "Бараа материал", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1400", "P", "Барааны нөөц (худалдааны бараа)", "ASSETS", "D", true, null, 3, "1.1.6", "OP_SUPPLIERS", "GOODS", "VAT10"],
    ["1410", "P", "Түүхий эд, материал", "ASSETS", "D", true, null, 3, "1.1.6", "OP_SUPPLIERS", "GOODS", "VAT10"],
    ["1420", "P", "Дуусаагүй үйлдвэрлэл", "ASSETS", "D", true, null, 3, "1.1.6", "OP_SUPPLIERS", null, null],
    ["1430", "P", "Бэлэн бүтээгдэхүүн", "ASSETS", "D", true, null, 3, "1.1.6", "OP_SUPPLIERS", null, null],
    ["1440", "P", "Хангамжийн материал, бага үнэтэй ажмын хэрэгсэл", "ASSETS", "D", true, null, 3, "1.1.6", "OP_SUPPLIERS", "GOODS", "VAT10"],
    ["1490", "P", "Бараа материалын үнэ цэнийн бууралт", "ASSETS", "C", true, null, 3, "1.1.6", "NON_CASH", null, null],
    ["1499", "H", "Урьдчилгаа, бусад эргэлтийн хөрөнгө", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1500", "P", "Урьдчилж төлсөн зардал", "ASSETS", "D", true, null, 3, "1.1.7", "OP_OPERATING_EXP", null, null],
    ["1510", "P", "Нийлүүлэгчид төлсөн урьдчилгаа", "ASSETS", "D", true, null, 3, "1.1.7", "OP_SUPPLIERS", null, null],
    ["1580", "P", "Бусад эргэлтийн хөрөнгө", "ASSETS", "D", true, null, 3, "1.1.8", "OP_OTHER_PAYMENTS", null, null],
    ["1598", "E", "Эргэлтийн хөрөнгийн дүн", "ASSETS", "D", false, "1001..1598", 1, null, null, null, null],
    ["1599", "B", "Эргэлтийн бус хөрөнгө", "ASSETS", "D", false, null, 1, null, null, null, null],
    ["1600", "P", "Барилга, байгууламж", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1610", "P", "Машин, тоног төхөөрөмж", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1620", "P", "Тээврийн хэрэгсэл", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1630", "P", "Компьютер, дагалдах хэрэгсэл", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1640", "P", "Тавилга, эд хогшил", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1660", "P", "Бусад үндсэн хөрөнгө", "ASSETS", "D", true, null, 3, "1.2.1", "INV_FA_BUY", "FA", "VAT10"],
    ["1690", "P", "Үндсэн хөрөнгийн хуримтлагдсан элэгдэл", "ASSETS", "C", true, null, 3, "1.2.1", "NON_CASH", null, null],
    ["1699", "H", "Биет бус хөрөнгө", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1700", "P", "Программ хангамж", "ASSETS", "D", true, null, 3, "1.2.2", "INV_INTANGIBLE_BUY", "FA", "VAT10"],
    ["1720", "P", "Газар эзэмших эрх", "ASSETS", "D", true, null, 3, "1.2.2", "INV_INTANGIBLE_BUY", "FA", "NOVAT"],
    ["1730", "P", "Бусад биет бус хөрөнгө (патент, лиценз, тэмдэг)", "ASSETS", "D", true, null, 3, "1.2.2", "INV_INTANGIBLE_BUY", "FA", "VAT10"],
    ["1790", "P", "Биет бус хөрөнгийн хуримтлагдсан хорогдуулалт", "ASSETS", "C", true, null, 3, "1.2.2", "NON_CASH", null, null],
    ["1799", "H", "Бусад эргэлтийн бус хөрөнгө", "ASSETS", "D", false, null, 2, null, null, null, null],
    ["1800", "P", "Урт хугацаат хөрөнгө оруулалт", "ASSETS", "D", true, null, 3, "1.2.4", "INV_INVESTMENT_BUY", null, null],
    ["1810", "P", "Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө", "ASSETS", "D", true, null, 3, "1.2.7", "INV_OTHER_LT_BUY", null, null],
    ["1850", "P", "Хойшлогдсон татварын хөрөнгө", "ASSETS", "D", true, null, 3, "1.2.6", "NON_CASH", null, null],
    ["1890", "P", "Бусад эргэлтийн бус хөрөнгө", "ASSETS", "D", true, null, 3, "1.2.8", "INV_OTHER_LT_BUY", null, null],
    ["1998", "E", "Эргэлтийн бус хөрөнгийн дүн", "ASSETS", "D", false, "1599..1998", 1, null, null, null, null],
    ["1999", "E", "НИЙТ ХӨРӨНГӨ", "ASSETS", "D", false, "1000..1999", 0, null, null, null, null],
    ["2000", "B", "ӨР ТӨЛБӨР", "LIABILITIES", "C", false, null, 0, null, null, null, null],
    ["2001", "B", "Богино хугацаат өр төлбөр", "LIABILITIES", "C", false, null, 1, null, null, null, null],
    ["2099", "H", "Дансны өглөг", "LIABILITIES", "C", false, null, 2, null, null, null, null],
    ["2100", "P", "Дансны өглөг", "LIABILITIES", "C", false, null, 3, "2.1.1.1", "OP_SUPPLIERS", null, null],
    ["2101", "P", "Дансны өглөг (гадаад)", "LIABILITIES", "C", false, null, 3, "2.1.1.1", "OP_SUPPLIERS", null, null],
    ["2199", "H", "Цалин, ажилтантай хийх тооцоо", "LIABILITIES", "C", false, null, 2, null, null, null, null],
    ["2200", "P", "Цалингийн өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.2", "OP_EMPLOYEES", null, null],
    ["2210", "P", "Ажилтанд өгөх өглөг (тайлант тооцоо)", "LIABILITIES", "C", false, null, 3, "2.1.1.2", "OP_OTHER_PAYMENTS", null, null],
    ["2299", "H", "Татвар, НДШ-ийн өглөг", "LIABILITIES", "C", false, null, 2, null, null, null, null],
    ["2300", "P", "Борлуулалтын НӨАТ (татварын өр)", "LIABILITIES", "C", false, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2305", "P", "Урвуу тооцооны НӨАТ", "LIABILITIES", "C", false, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2310", "P", "НӨАТ-ын тооцоо (төлөх / буцаан авах)", "LIABILITIES", "B", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2320", "P", "НХАТ-ын өглөг", "LIABILITIES", "C", false, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2325", "P", "НХАТ-ын тооцоо (төлөх)", "LIABILITIES", "C", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2330", "P", "ААНОАТ-ын өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2340", "P", "ХХОАТ-ын өглөг (суутгасан)", "LIABILITIES", "C", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2345", "P", "Суутган татварын өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2350", "P", "НДШ-ийн өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.4", "OP_SOCIAL_INSURANCE", null, null],
    ["2360", "P", "Бусад татвар, хураамжийн өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2365", "P", "Гаалийн татвар, импортын НӨАТ-ын өглөг", "LIABILITIES", "C", false, null, 3, "2.1.1.3", "OP_TAXES_PAID", null, null],
    ["2399", "H", "Зээл, хүү, ногдол ашиг", "LIABILITIES", "C", false, null, 2, null, null, null, null],
    ["2400", "P", "Богино хугацаат банкны зээл", "LIABILITIES", "C", true, null, 3, "2.1.1.5", "FIN_BORROWINGS", null, null],
    ["2420", "P", "Бусад богино хугацаат зээл (эзэд, хувь хүн)", "LIABILITIES", "C", true, null, 3, "2.1.1.5", "FIN_BORROWINGS", null, null],
    ["2450", "P", "Хүүний өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.6", "OP_INTEREST_PAID", null, null],
    ["2460", "P", "Ногдол ашгийн өглөг", "LIABILITIES", "C", true, null, 3, "2.1.1.7", "FIN_DIVIDENDS_PAID", null, null],
    ["2499", "H", "Урьдчилгаа, нөөц, бусад өр төлбөр", "LIABILITIES", "C", false, null, 2, null, null, null, null],
    ["2500", "P", "Урьдчилж орсон орлого", "LIABILITIES", "C", true, null, 3, "2.1.1.8", "OP_CUST_RECEIPTS", null, null],
    ["2510", "P", "Захиалагчаас авсан урьдчилгаа", "LIABILITIES", "C", true, null, 3, "2.1.1.8", "OP_CUST_RECEIPTS", null, null],
    ["2600", "P", "Нөөц (өр төлбөр)", "LIABILITIES", "C", true, null, 3, "2.1.1.9", "OP_OTHER_PAYMENTS", null, null],
    ["2650", "P", "Бусад богино хугацаат өр төлбөр", "LIABILITIES", "C", true, null, 3, "2.1.1.10", "OP_OTHER_PAYMENTS", null, null],
    ["2690", "P", "Тодорхойгүй гүйлгээний түр данс", "LIABILITIES", "B", true, null, 3, "2.1.1.10", "NON_CASH", null, null],
    ["2698", "E", "Богино хугацаат өр төлбөрийн дүн", "LIABILITIES", "C", false, "2001..2698", 1, null, null, null, null],
    ["2699", "B", "Урт хугацаат өр төлбөр", "LIABILITIES", "C", false, null, 1, null, null, null, null],
    ["2700", "P", "Урт хугацаат банкны зээл", "LIABILITIES", "C", true, null, 3, "2.1.2.1", "FIN_BORROWINGS", null, null],
    ["2750", "P", "Хойшлогдсон татварын өр", "LIABILITIES", "C", true, null, 3, "2.1.2.2", "NON_CASH", null, null],
    ["2790", "P", "Бусад урт хугацаат өр төлбөр", "LIABILITIES", "C", true, null, 3, "2.1.2.3", "FIN_BORROWINGS", null, null],
    ["2998", "E", "Урт хугацаат өр төлбөрийн дүн", "LIABILITIES", "C", false, "2699..2998", 1, null, null, null, null],
    ["2999", "E", "НИЙТ ӨР ТӨЛБӨР", "LIABILITIES", "C", false, "2000..2999", 0, null, null, null, null],
    ["3000", "B", "ЭЗДИЙН ӨМЧ", "EQUITY", "C", false, null, 0, null, null, null, null],
    ["3100", "P", "Өмч (дүрмийн сан)", "EQUITY", "C", true, null, 1, "2.2.1", "FIN_SHARES_ISSUED", null, null],
    ["3200", "P", "Нэмж төлөгдсөн капитал", "EQUITY", "C", true, null, 1, "2.2.3", "FIN_SHARES_ISSUED", null, null],
    ["3300", "P", "Хөрөнгийн дахин үнэлгээний нэмэгдэл", "EQUITY", "C", true, null, 1, "2.2.4", "NON_CASH", null, null],
    ["3360", "P", "Эздийн өмчийн бусад хэсэг", "EQUITY", "C", true, null, 1, "2.2.6", "FIN_SHARES_ISSUED", null, null],
    ["3400", "P", "Хуримтлагдсан ашиг (алдагдал)", "EQUITY", "C", true, null, 1, "2.2.7", "NON_CASH", null, null],
    ["3410", "P", "Зарласан ногдол ашиг", "EQUITY", "D", true, null, 1, "2.2.7", "FIN_DIVIDENDS_PAID", null, null],
    ["3500", "P", "Тайлант үеийн ашиг (алдагдал)", "EQUITY", "C", true, null, 1, "2.2.7", "NON_CASH", null, null],
    ["3999", "E", "НИЙТ ЭЗДИЙН ӨМЧ", "EQUITY", "C", false, "3000..3999", 0, null, null, null, null],
    ["5000", "B", "БОРЛУУЛАЛТЫН ОРЛОГО", "INCOME", "C", false, null, 0, null, null, null, null],
    ["5100", "P", "Борлуулалтын орлого - бараа", "INCOME", "C", true, null, 1, "1", "OP_CUST_RECEIPTS", "GOODS", "VAT10"],
    ["5110", "P", "Ажил, үйлчилгээний орлого", "INCOME", "C", true, null, 1, "1", "OP_CUST_RECEIPTS", "SERVICES", "VAT10"],
    ["5120", "P", "Экспортын борлуулалтын орлого", "INCOME", "C", true, null, 1, "1", "OP_CUST_RECEIPTS", "GOODS", "VAT10"],
    ["5130", "P", "Холбоотой талд борлуулсан орлого", "INCOME", "C", true, null, 1, "1", "OP_CUST_RECEIPTS", "GOODS", "VAT10"],
    ["5190", "P", "Борлуулалтын буцаалт, хөнгөлөлт", "INCOME", "D", true, null, 1, "1", "OP_CUST_RECEIPTS", "GOODS", "VAT10"],
    ["5999", "E", "НИЙТ БОРЛУУЛАЛТЫН ОРЛОГО", "INCOME", "C", false, "5000..5999", 0, null, null, null, null],
    ["6000", "B", "БОРЛУУЛАЛТЫН ӨРТӨГ", "COGS", "D", false, null, 0, null, null, null, null],
    ["6100", "P", "Борлуулсан барааны өртөг", "COGS", "D", true, null, 1, "2", "OP_SUPPLIERS", "GOODS", "VAT10"],
    ["6110", "P", "Борлуулсан ажил, үйлчилгээний өртөг", "COGS", "D", true, null, 1, "2", "OP_OPERATING_EXP", "SERVICES", "VAT10"],
    ["6120", "P", "Бараа материалын хорогдол, тооллогын зөрүү", "COGS", "D", true, null, 1, "2", "NON_CASH", "MISC", "NOVAT"],
    ["6130", "P", "Шууд хөдөлмөрийн зардал", "COGS", "D", true, null, 1, "2", "OP_EMPLOYEES", "MISC", "NOVAT"],
    ["6140", "P", "Бэлтгэл, тээврийн зардал", "COGS", "D", true, null, 1, "2", "OP_FUEL_TRANSPORT", "MISC", "VAT10"],
    ["6190", "P", "Худалдан авалтын буцаалт, хөнгөлөлт", "COGS", "C", true, null, 1, "2", "OP_SUPPLIERS", "GOODS", "VAT10"],
    ["6999", "E", "НИЙТ БОРЛУУЛАЛТЫН ӨРТӨГ", "COGS", "D", false, "6000..6999", 0, null, null, null, null],
    ["7000", "B", "ҮЙЛ АЖИЛЛАГААНЫ ЗАРДАЛ", "EXPENSE", "D", false, null, 0, null, null, null, null],
    ["7099", "H", "Борлуулалт, маркетингийн зардал", "EXPENSE", "D", false, null, 1, null, null, null, null],
    ["7100", "P", "Борлуулалт, маркетингийн бусад зардал", "EXPENSE", "D", true, null, 2, "9", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7110", "P", "Зар сурталчилгааны зардал", "EXPENSE", "D", true, null, 2, "9", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7120", "P", "Борлуулалтын ажилтны цалин, НДШ", "EXPENSE", "D", true, null, 2, "9", "OP_EMPLOYEES", "MISC", "NOVAT"],
    ["7140", "P", "Тээвэрлэлт, хүргэлтийн зардал", "EXPENSE", "D", true, null, 2, "9", "OP_FUEL_TRANSPORT", "MISC", "VAT10"],
    ["7150", "P", "Борлуулалтын шимтгэл, комисс", "EXPENSE", "D", true, null, 2, "9", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7199", "H", "Ерөнхий ба удирдлагын зардал", "EXPENSE", "D", false, null, 1, null, null, null, null],
    ["7200", "P", "Ерөнхий ба удирдлагын бусад зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7201", "P", "Цалингийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_EMPLOYEES", "MISC", "NOVAT"],
    ["7202", "P", "НДШ-ийн зардал (ажил олгогч)", "EXPENSE", "D", true, null, 2, "10", "OP_SOCIAL_INSURANCE", "MISC", "NOVAT"],
    ["7210", "P", "Түрээсийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7211", "P", "Ашиглалтын зардал (цахилгаан, дулаан, ус)", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7212", "P", "Холбоо, интернэтийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7213", "P", "Бичиг хэрэг, хэвлэлийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7214", "P", "Засвар үйлчилгээний зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7220", "P", "Шатахууны зардал", "EXPENSE", "D", true, null, 2, "10", "OP_FUEL_TRANSPORT", "MISC", "VAT10"],
    ["7221", "P", "Тээврийн хэрэгслийн зардал (сэлбэг, засвар)", "EXPENSE", "D", true, null, 2, "10", "OP_FUEL_TRANSPORT", "MISC", "VAT10"],
    ["7222", "P", "Томилолтын зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OTHER_PAYMENTS", "MISC", "NOVAT"],
    ["7230", "P", "Мэргэжлийн үйлчилгээний зардал (аудит, хууль, зөвлөх)", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7231", "P", "Программ хангамж, лицензийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7232", "P", "Сургалтын зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "EXEMPT"],
    ["7240", "P", "Даатгалын зардал", "EXPENSE", "D", true, null, 2, "10", "OP_INSURANCE_PAID", "MISC", "EXEMPT"],
    ["7250", "P", "Татвар, хураамж, төлбөрийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_TAXES_PAID", "MISC", "NOVAT"],
    ["7260", "P", "Үндсэн хөрөнгийн элэгдлийн зардал", "EXPENSE", "D", true, null, 2, "10", "NON_CASH", "MISC", "NOVAT"],
    ["7261", "P", "Биет бус хөрөнгийн хорогдуулалтын зардал", "EXPENSE", "D", true, null, 2, "10", "NON_CASH", "MISC", "NOVAT"],
    ["7262", "P", "Бага үнэтэй ажмын хэрэгслийн зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OPERATING_EXP", "MISC", "VAT10"],
    ["7270", "P", "Төлөөлөх, зочлох зардал", "EXPENSE", "D", true, null, 2, "10", "OP_OTHER_PAYMENTS", "MISC", "VAT10"],
    ["7999", "E", "НИЙТ ҮЙЛ АЖИЛЛАГААНЫ ЗАРДАЛ", "EXPENSE", "D", false, "7000..7999", 0, null, null, null, null],
    ["8000", "B", "БУСАД ОРЛОГО, ЗАРДАЛ, ОЛЗ (ГАРЗ)", null, "B", false, null, 0, null, null, null, null],
    ["8099", "H", "Түрээс, хүү, ногдол ашиг, эрхийн шимтгэлийн орлого", "INCOME", "C", false, null, 1, null, null, null, null],
    ["8100", "P", "Түрээсийн орлого", "INCOME", "C", true, null, 2, "4", "OP_OTHER_RECEIPTS", "SERVICES", "VAT10"],
    ["8110", "P", "Хүүний орлого", "INCOME", "C", true, null, 2, "5", "INV_INTEREST_RCVD", "MISC", "EXEMPT"],
    ["8120", "P", "Ногдол ашгийн орлого", "INCOME", "C", true, null, 2, "6", "INV_DIVIDENDS_RCVD", "MISC", "NOVAT"],
    ["8130", "P", "Эрхийн шимтгэлийн орлого", "INCOME", "C", true, null, 2, "7", "OP_ROYALTY_RECEIPTS", "SERVICES", "VAT10"],
    ["8199", "H", "Бусад орлого", "INCOME", "C", false, null, 1, null, null, null, null],
    ["8200", "P", "Бусад орлого", "INCOME", "C", true, null, 2, "8", "OP_OTHER_RECEIPTS", "MISC", "NOVAT"],
    ["8210", "P", "Татаас, санхүүжилтийн орлого", "INCOME", "C", true, null, 2, "8", "OP_GRANTS", "MISC", "NOVAT"],
    ["8220", "P", "Даатгалын нөхөн төлбөрийн орлого", "INCOME", "C", true, null, 2, "8", "OP_INSURANCE_CLAIMS", "MISC", "NOVAT"],
    ["8240", "P", "Илүүдлийн орлого (касс, бараа)", "INCOME", "C", true, null, 2, "8", "OP_OTHER_RECEIPTS", "MISC", "NOVAT"],
    ["8290", "P", "Бөөрөнхийлөлтийн зөрүү", "INCOME", "B", false, null, 2, "8", "NON_CASH", "MISC", "NOVAT"],
    ["8299", "H", "Санхүүгийн зардал", "EXPENSE", "D", false, null, 1, null, null, null, null],
    ["8300", "P", "Санхүүгийн зардал (банкны шимтгэл)", "EXPENSE", "D", true, null, 2, "11", "OP_OTHER_PAYMENTS", "MISC", "EXEMPT"],
    ["8310", "P", "Зээлийн хүүний зардал", "EXPENSE", "D", true, null, 2, "11", "OP_INTEREST_PAID", "MISC", "EXEMPT"],
    ["8399", "H", "Бусад зардал", "EXPENSE", "D", false, null, 1, null, null, null, null],
    ["8400", "P", "Бусад зардал", "EXPENSE", "D", true, null, 2, "12", "OP_OTHER_PAYMENTS", "MISC", "NOVAT"],
    ["8410", "P", "Найдваргүй авлагын зардал", "EXPENSE", "D", true, null, 2, "12", "NON_CASH", "MISC", "NOVAT"],
    ["8420", "P", "Хандив, тусламжийн зардал", "EXPENSE", "D", true, null, 2, "12", "OP_OTHER_PAYMENTS", "MISC", "NOVAT"],
    ["8430", "P", "Торгууль, алдангийн зардал", "EXPENSE", "D", true, null, 2, "12", "OP_OTHER_PAYMENTS", "MISC", "NOVAT"],
    ["8440", "P", "Дутагдал, хорогдлын зардал (касс, бараа)", "EXPENSE", "D", true, null, 2, "12", "OP_OTHER_PAYMENTS", "MISC", "NOVAT"],
    ["8450", "P", "Хөрөнгийн үнэ цэнийн бууралтын гарз", "EXPENSE", "D", true, null, 2, "12", "NON_CASH", "MISC", "NOVAT"],
    ["8499", "H", "Ханшийн зөрүүний олз (гарз)", "INCOME", "B", false, null, 1, null, null, null, null],
    ["8500", "P", "Ханшийн зөрүүний олз (гарз) - хэрэгжсэн", "INCOME", "B", true, null, 2, "13", "FX_EFFECT", "MISC", "NOVAT"],
    ["8510", "P", "Ханшийн зөрүүний олз (гарз) - хэрэгжээгүй", "INCOME", "B", true, null, 2, "13", "FX_EFFECT", "MISC", "NOVAT"],
    ["8599", "H", "Хөрөнгө данснаас хассаны олз (гарз)", "INCOME", "B", false, null, 1, null, null, null, null],
    ["8600", "P", "Үндсэн хөрөнгө данснаас хассаны олз (гарз)", "INCOME", "B", true, null, 2, "14", "INV_FA_SALE", "FA", "VAT10"],
    ["8610", "P", "Биет бус хөрөнгө данснаас хассаны олз (гарз)", "INCOME", "B", true, null, 2, "15", "INV_INTANGIBLE_SALE", "FA", "VAT10"],
    ["8620", "P", "Хөрөнгө оруулалт борлуулсны олз (гарз)", "INCOME", "B", true, null, 2, "16", "INV_INVESTMENT_SALE", "MISC", "NOVAT"],
    ["8690", "P", "Бусад ашиг (алдагдал)", "INCOME", "B", true, null, 2, "17", "OP_OTHER_RECEIPTS", "MISC", "NOVAT"],
    ["8999", "E", "НИЙТ БУСАД ОРЛОГО, ЗАРДАЛ", null, "B", false, "8000..8999", 0, null, null, null, null],
    ["9000", "B", "ОРЛОГЫН ТАТВАР, ЗОГСООСОН ҮЙЛ АЖИЛЛАГАА", null, "D", false, null, 0, null, null, null, null],
    ["9100", "P", "Орлогын албан татварын зардал", "EXPENSE", "D", true, null, 1, "19", "OP_TAXES_PAID", "MISC", "NOVAT"],
    ["9110", "P", "Хойшлогдсон татварын зардал (орлого)", "EXPENSE", "B", true, null, 1, "19", "NON_CASH", "MISC", "NOVAT"],
    ["9200", "P", "Зогсоосон үйл ажиллагааны ашиг (алдагдал)", "INCOME", "B", true, null, 1, "21", "OP_OTHER_RECEIPTS", "MISC", "NOVAT"],
    ["9999", "E", "НИЙТ ОРЛОГЫН ТАТВАР, ЗОГСООСОН ҮЙЛ АЖИЛЛАГАА", null, "D", false, "9000..9999", 0, null, null, null, null]
  ];

  // Form A rows from db/seed/mn_50_reports.sql: [report, row_no, code, name, type(H/P/F/C), totaling, amount type
  // (B balance at date, N net change, G beginning balance), show (Y/Z/N), show opposite sign, indentation]
  var STATEMENT_ROWS = [
    ["SBT", 10, null, "ХӨРӨНГӨ", "H", null, "B", "Y", false, 0],
    ["SBT", 20, null, "Эргэлтийн хөрөнгө", "H", null, "B", "Y", false, 1],
    ["SBT", 30, "1.1.1", "Мөнгө, түүнтэй адилтгах хөрөнгө", "P", "1100..1198", "B", "Y", false, 2],
    ["SBT", 40, "1.1.2", "Дансны авлага", "P", "1200..1298", "B", "Y", false, 2],
    ["SBT", 50, "1.1.3", "Татвар, НДШ-ийн авлага", "P", "1300..1349", "B", "Y", false, 2],
    ["SBT", 60, "1.1.4", "Бусад авлага", "P", "1350..1369", "B", "Y", false, 2],
    ["SBT", 70, "1.1.5", "Бусад санхүүгийн хөрөнгө", "P", "1370..1398", "B", "Y", false, 2],
    ["SBT", 80, "1.1.6", "Бараа материал", "P", "1400..1498", "B", "Y", false, 2],
    ["SBT", 90, "1.1.7", "Урьдчилж төлсөн зардал/тооцоо", "P", "1500..1579", "B", "Y", false, 2],
    ["SBT", 100, "1.1.8", "Бусад эргэлтийн хөрөнгө", "P", "1580..1589", "B", "Y", false, 2],
    ["SBT", 110, "1.1.9", "Борлуулах зорилгоор эзэмшиж буй эргэлтийн бус хөрөнгө", "P", "1590..1597", "B", "Z", false, 2],
    ["SBT", 120, "1.1", "Эргэлтийн хөрөнгийн дүн", "F", "1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6+1.1.7+1.1.8+1.1.9", "B", "Y", false, 1],
    ["SBT", 130, null, "Эргэлтийн бус хөрөнгө", "H", null, "B", "Y", false, 1],
    ["SBT", 140, "1.2.1", "Үндсэн хөрөнгө", "P", "1600..1698", "B", "Y", false, 2],
    ["SBT", 150, "1.2.2", "Биет бус хөрөнгө", "P", "1700..1798", "B", "Y", false, 2],
    ["SBT", 160, "1.2.3", "Биологийн хөрөнгө", "P", "1820..1829", "B", "Z", false, 2],
    ["SBT", 170, "1.2.4", "Урт хугацаат хөрөнгө оруулалт", "P", "1800..1809", "B", "Y", false, 2],
    ["SBT", 180, "1.2.5", "Хайгуул ба үнэлгээний хөрөнгө", "P", "1830..1839", "B", "Z", false, 2],
    ["SBT", 190, "1.2.6", "Хойшлогдсон татварын хөрөнгө", "P", "1850..1859", "B", "Y", false, 2],
    ["SBT", 200, "1.2.7", "Хөрөнгө оруулалтын зориулалттай үл хөдлөх хөрөнгө", "P", "1810..1819", "B", "Y", false, 2],
    ["SBT", 210, "1.2.8", "Бусад эргэлтийн бус хөрөнгө", "P", "1840..1849|1860..1997", "B", "Y", false, 2],
    ["SBT", 220, "1.2", "Эргэлтийн бус хөрөнгийн дүн", "F", "1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8", "B", "Y", false, 1],
    ["SBT", 230, "1.3", "НИЙТ ХӨРӨНГӨ", "F", "1.1+1.2", "B", "Y", false, 0],
    ["SBT", 240, null, "ӨР ТӨЛБӨР БА ЭЗДИЙН ӨМЧ", "H", null, "B", "Y", true, 0],
    ["SBT", 250, null, "Богино хугацаат өр төлбөр", "H", null, "B", "Y", true, 1],
    ["SBT", 260, "2.1.1.1", "Дансны өглөг", "P", "2100..2198", "B", "Y", true, 2],
    ["SBT", 270, "2.1.1.2", "Цалингийн өглөг", "P", "2200..2298", "B", "Y", true, 2],
    ["SBT", 280, "2.1.1.3", "Татварын өр", "P", "2300..2349|2360..2398", "B", "Y", true, 2],
    ["SBT", 290, "2.1.1.4", "НДШ-ийн өглөг", "P", "2350..2359", "B", "Y", true, 2],
    ["SBT", 300, "2.1.1.5", "Богино хугацаат зээл", "P", "2400..2449", "B", "Y", true, 2],
    ["SBT", 310, "2.1.1.6", "Хүүний өглөг", "P", "2450..2459", "B", "Y", true, 2],
    ["SBT", 320, "2.1.1.7", "Ногдол ашгийн өглөг", "P", "2460..2498", "B", "Y", true, 2],
    ["SBT", 330, "2.1.1.8", "Урьдчилж орсон орлого", "P", "2500..2599", "B", "Y", true, 2],
    ["SBT", 340, "2.1.1.9", "Нөөц (өр төлбөр)", "P", "2600..2649", "B", "Y", true, 2],
    ["SBT", 350, "2.1.1.10", "Бусад богино хугацаат өр төлбөр", "P", "2650..2697", "B", "Y", true, 2],
    ["SBT", 360, "2.1.1", "Богино хугацаат өр төлбөрийн дүн", "F", "2.1.1.1+2.1.1.2+2.1.1.3+2.1.1.4+2.1.1.5+2.1.1.6+2.1.1.7+2.1.1.8+2.1.1.9+2.1.1.10", "B", "Y", true, 1],
    ["SBT", 370, null, "Урт хугацаат өр төлбөр", "H", null, "B", "Y", true, 1],
    ["SBT", 380, "2.1.2.1", "Урт хугацаат зээл", "P", "2700..2749", "B", "Y", true, 2],
    ["SBT", 390, "2.1.2.2", "Хойшлогдсон татварын өр", "P", "2750..2759", "B", "Y", true, 2],
    ["SBT", 400, "2.1.2.3", "Бусад урт хугацаат өр төлбөр", "P", "2760..2997", "B", "Y", true, 2],
    ["SBT", 410, "2.1.2", "Урт хугацаат өр төлбөрийн дүн", "F", "2.1.2.1+2.1.2.2+2.1.2.3", "B", "Y", true, 1],
    ["SBT", 420, "2.1", "Өр төлбөрийн дүн", "F", "2.1.1+2.1.2", "B", "Y", true, 1],
    ["SBT", 430, null, "Эздийн өмч", "H", null, "B", "Y", true, 1],
    ["SBT", 440, "2.2.1", "Өмч", "P", "3100..3149", "B", "Y", true, 2],
    ["SBT", 450, "2.2.2", "Халаасны хувьцаа", "P", "3150..3199", "B", "Z", true, 2],
    ["SBT", 460, "2.2.3", "Нэмж төлөгдсөн капитал", "P", "3200..3299", "B", "Y", true, 2],
    ["SBT", 470, "2.2.4", "Хөрөнгийн дахин үнэлгээний нэмэгдэл", "P", "3300..3349", "B", "Y", true, 2],
    ["SBT", 480, "2.2.5", "Гадаад валютын хөрвүүлэлтийн нөөц", "P", "3350..3359", "B", "Z", true, 2],
    ["SBT", 490, "2.2.6", "Эздийн өмчийн бусад хэсэг", "P", "3360..3399", "B", "Y", true, 2],
    ["SBT", 500, "2.2.7", "Хуримтлагдсан ашиг", "P", "3400..3998|5000..9998", "B", "Y", true, 2],
    ["SBT", 510, "2.2", "Эздийн өмчийн дүн", "F", "2.2.1+2.2.2+2.2.3+2.2.4+2.2.5+2.2.6+2.2.7", "B", "Y", true, 1],
    ["SBT", 520, "2.3", "НИЙТ ӨР ТӨЛБӨР БА ЭЗДИЙН ӨМЧ", "F", "2.1+2.2", "B", "Y", true, 0],
    ["SBT", 530, "CHK", "Шалгалт: хөрөнгө - (өр төлбөр + өмч) = 0", "F", "1.3+2.3", "B", "Z", false, 0],
    ["ODT", 10, "1", "Борлуулалтын орлого (цэвэр)", "P", "5000..5999", "N", "Y", true, 0],
    ["ODT", 20, "2", "Борлуулалтын өртөг", "P", "6000..6999", "N", "Y", false, 0],
    ["ODT", 30, "3", "Нийт ашиг (алдагдал)", "F", "1+2", "N", "Y", true, 0],
    ["ODT", 40, "4", "Түрээсийн орлого", "P", "8100..8109", "N", "Y", true, 1],
    ["ODT", 50, "5", "Хүүний орлого", "P", "8110..8119", "N", "Y", true, 1],
    ["ODT", 60, "6", "Ногдол ашгийн орлого", "P", "8120..8129", "N", "Y", true, 1],
    ["ODT", 70, "7", "Эрхийн шимтгэлийн орлого", "P", "8130..8198", "N", "Y", true, 1],
    ["ODT", 80, "8", "Бусад орлого", "P", "8200..8298", "N", "Y", true, 1],
    ["ODT", 90, "9", "Борлуулалт, маркетингийн зардал", "P", "7000..7198", "N", "Y", false, 1],
    ["ODT", 100, "10", "Ерөнхий ба удирдлагын зардал", "P", "7199..7999", "N", "Y", false, 1],
    ["ODT", 110, "11", "Санхүүгийн зардал", "P", "8300..8398", "N", "Y", false, 1],
    ["ODT", 120, "12", "Бусад зардал", "P", "8400..8498", "N", "Y", false, 1],
    ["ODT", 130, "13", "Гадаад валютын ханшийн зөрүүний олз (гарз)", "P", "8500..8598", "N", "Y", true, 1],
    ["ODT", 140, "14", "Үндсэн хөрөнгө данснаас хассаны олз (гарз)", "P", "8600..8609", "N", "Y", true, 1],
    ["ODT", 150, "15", "Биет бус хөрөнгө данснаас хассаны олз (гарз)", "P", "8610..8619", "N", "Y", true, 1],
    ["ODT", 160, "16", "Хөрөнгө оруулалт борлуулсны олз (гарз)", "P", "8620..8689", "N", "Y", true, 1],
    ["ODT", 170, "17", "Бусад ашиг (алдагдал)", "P", "8690..8998", "N", "Y", true, 1],
    ["ODT", 180, "18", "Татвар төлөхийн өмнөх ашиг (алдагдал)", "F", "3+4+5+6+7+8+9+10+11+12+13+14+15+16+17", "N", "Y", true, 0],
    ["ODT", 190, "19", "Орлогын татварын зардал", "P", "9100..9199", "N", "Y", false, 1],
    ["ODT", 200, "20", "Татварын дараах ашиг (алдагдал)", "F", "18+19", "N", "Y", true, 0],
    ["ODT", 210, "21", "Зогсоосон үйл ажиллагааны татварын дараах ашиг (алдагдал)", "P", "9200..9998", "N", "Y", true, 1],
    ["ODT", 220, "22", "Тайлант үеийн цэвэр ашиг (алдагдал)", "F", "20+21", "N", "Y", true, 0],
    ["ODT", 230, "23.1", "Хөрөнгийн дахин үнэлгээний нэмэгдлийн өсөлт (бууралт)", "P", "3300..3349", "N", "Y", true, 2],
    ["ODT", 240, "23.2", "Гадаад валютын хөрвүүлэлтийн тэгшитгэлийн өсөлт (бууралт)", "P", "3350..3359", "N", "Z", true, 2],
    ["ODT", 250, "23", "Бусад дэлгэрэнгүй орлого", "F", "23.1+23.2", "N", "Y", true, 1],
    ["ODT", 260, "24", "Нийт дэлгэрэнгүй орлого", "F", "22+23", "N", "Y", true, 0],
    ["MGT", 10, null, "Үндсэн үйл ажиллагааны мөнгөн гүйлгээ", "H", null, "N", "Y", false, 0],
    ["MGT", 20, "1.1.1", "Бараа борлуулах, үйлчилгээ үзүүлсний орлого", "C", "OP_CUST_RECEIPTS", "N", "Y", false, 2],
    ["MGT", 30, "1.1.2", "Эрхийн шимтгэл, хураамж, төлбөрийн орлого", "C", "OP_ROYALTY_RECEIPTS", "N", "Y", false, 2],
    ["MGT", 40, "1.1.3", "Даатгалын нөхвөрөөс хүлээн авсан мөнгө", "C", "OP_INSURANCE_CLAIMS", "N", "Y", false, 2],
    ["MGT", 50, "1.1.4", "Буцаан авсан албан татвар", "C", "OP_TAX_REFUNDS", "N", "Y", false, 2],
    ["MGT", 60, "1.1.5", "Татаас, санхүүжилтийн орлого", "C", "OP_GRANTS", "N", "Y", false, 2],
    ["MGT", 70, "1.1.6", "Бусад мөнгөн орлого", "C", "OP_OTHER_RECEIPTS", "N", "Y", false, 2],
    ["MGT", 80, "1.1", "Мөнгөн орлогын дүн (+)", "F", "1.1.1+1.1.2+1.1.3+1.1.4+1.1.5+1.1.6", "N", "Y", false, 1],
    ["MGT", 90, "1.2.1", "Ажиллагчдад төлсөн", "C", "OP_EMPLOYEES", "N", "Y", false, 2],
    ["MGT", 100, "1.2.2", "Нийгмийн даатгалын байгууллагад төлсөн", "C", "OP_SOCIAL_INSURANCE", "N", "Y", false, 2],
    ["MGT", 110, "1.2.3", "Бараа материал худалдан авахад төлсөн", "C", "OP_SUPPLIERS", "N", "Y", false, 2],
    ["MGT", 120, "1.2.4", "Ашиглалтын зардалд төлсөн", "C", "OP_OPERATING_EXP", "N", "Y", false, 2],
    ["MGT", 130, "1.2.5", "Түлш, шатахуун, тээврийн хөлс, сэлбэг хэрэгсэлд төлсөн", "C", "OP_FUEL_TRANSPORT", "N", "Y", false, 2],
    ["MGT", 140, "1.2.6", "Хүүний төлбөрт төлсөн", "C", "OP_INTEREST_PAID", "N", "Y", false, 2],
    ["MGT", 150, "1.2.7", "Татварын байгууллагад төлсөн", "C", "OP_TAXES_PAID", "N", "Y", false, 2],
    ["MGT", 160, "1.2.8", "Даатгалын төлбөрт төлсөн", "C", "OP_INSURANCE_PAID", "N", "Y", false, 2],
    ["MGT", 170, "1.2.9", "Бусад мөнгөн зарлага", "C", "OP_OTHER_PAYMENTS", "N", "Y", false, 2],
    ["MGT", 180, "1.2", "Мөнгөн зарлагын дүн (-)", "F", "1.2.1+1.2.2+1.2.3+1.2.4+1.2.5+1.2.6+1.2.7+1.2.8+1.2.9", "N", "Y", false, 1],
    ["MGT", 190, "1", "Үндсэн үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн", "F", "1.1+1.2", "N", "Y", false, 0],
    ["MGT", 200, null, "Хөрөнгө оруулалтын үйл ажиллагааны мөнгөн гүйлгээ", "H", null, "N", "Y", false, 0],
    ["MGT", 210, "2.1.1", "Үндсэн хөрөнгө борлуулсны орлого", "C", "INV_FA_SALE", "N", "Y", false, 2],
    ["MGT", 220, "2.1.2", "Биет бус хөрөнгө борлуулсны орлого", "C", "INV_INTANGIBLE_SALE", "N", "Y", false, 2],
    ["MGT", 230, "2.1.3", "Хөрөнгө оруулалт борлуулсны орлого", "C", "INV_INVESTMENT_SALE", "N", "Y", false, 2],
    ["MGT", 240, "2.1.4", "Бусад урт хугацаат хөрөнгө борлуулсны орлого", "C", "INV_OTHER_LT_SALE", "N", "Y", false, 2],
    ["MGT", 250, "2.1.5", "Бусдад олгосон зээл, урьдчилгааны буцаан төлөлт", "C", "INV_LOANS_REPAID", "N", "Y", false, 2],
    ["MGT", 260, "2.1.6", "Хүлээн авсан хүүний орлого", "C", "INV_INTEREST_RCVD", "N", "Y", false, 2],
    ["MGT", 270, "2.1.7", "Хүлээн авсан ногдол ашиг", "C", "INV_DIVIDENDS_RCVD", "N", "Y", false, 2],
    ["MGT", 280, "2.1", "Мөнгөн орлогын дүн (+)", "F", "2.1.1+2.1.2+2.1.3+2.1.4+2.1.5+2.1.6+2.1.7", "N", "Y", false, 1],
    ["MGT", 290, "2.2.1", "Үндсэн хөрөнгө олж эзэмшихэд төлсөн", "C", "INV_FA_BUY", "N", "Y", false, 2],
    ["MGT", 300, "2.2.2", "Биет бус хөрөнгө олж эзэмшихэд төлсөн", "C", "INV_INTANGIBLE_BUY", "N", "Y", false, 2],
    ["MGT", 310, "2.2.3", "Хөрөнгө оруулалт олж эзэмшихэд төлсөн", "C", "INV_INVESTMENT_BUY", "N", "Y", false, 2],
    ["MGT", 320, "2.2.4", "Бусад урт хугацаат хөрөнгө олж эзэмшихэд төлсөн", "C", "INV_OTHER_LT_BUY", "N", "Y", false, 2],
    ["MGT", 330, "2.2.5", "Бусдад олгосон зээл, мөнгөн урьдчилгаа", "C", "INV_LOANS_GIVEN", "N", "Y", false, 2],
    ["MGT", 340, "2.2", "Мөнгөн зарлагын дүн (-)", "F", "2.2.1+2.2.2+2.2.3+2.2.4+2.2.5", "N", "Y", false, 1],
    ["MGT", 350, "2", "Хөрөнгө оруулалтын үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн", "F", "2.1+2.2", "N", "Y", false, 0],
    ["MGT", 360, null, "Санхүүгийн үйл ажиллагааны мөнгөн гүйлгээ", "H", null, "N", "Y", false, 0],
    ["MGT", 370, "3.1.1", "Зээл авсан, өрийн үнэт цаас гаргаснаас хүлээн авсан", "C", "FIN_BORROWINGS", "N", "Y", false, 2],
    ["MGT", 380, "3.1.2", "Хувьцаа, өмчийн бусад үнэт цаас гаргаснаас хүлээн авсан", "C", "FIN_SHARES_ISSUED", "N", "Y", false, 2],
    ["MGT", 390, "3.1.3", "Төрөл бүрийн хандив", "C", "FIN_DONATIONS", "N", "Y", false, 2],
    ["MGT", 400, "3.1.4", "Санхүүгийн түрээсийн авлагаас хүлээн авсан", "C", "FIN_LEASE_RECEIPTS", "N", "Y", false, 2],
    ["MGT", 410, "3.1", "Мөнгөн орлогын дүн (+)", "F", "3.1.1+3.1.2+3.1.3+3.1.4", "N", "Y", false, 1],
    ["MGT", 420, "3.2.1", "Зээл, өрийн үнэт цаасны төлбөрт төлсөн", "C", "FIN_LOAN_REPAYMENTS", "N", "Y", false, 2],
    ["MGT", 430, "3.2.2", "Санхүүгийн түрээсийн өглөгт төлсөн", "C", "FIN_LEASE_PAYMENTS", "N", "Y", false, 2],
    ["MGT", 440, "3.2.3", "Хувьцаа буцаан худалдан авахад төлсөн", "C", "FIN_SHARE_BUYBACK", "N", "Y", false, 2],
    ["MGT", 450, "3.2.4", "Төлсөн ногдол ашиг", "C", "FIN_DIVIDENDS_PAID", "N", "Y", false, 2],
    ["MGT", 460, "3.2", "Мөнгөн зарлагын дүн (-)", "F", "3.2.1+3.2.2+3.2.3+3.2.4", "N", "Y", false, 1],
    ["MGT", 470, "3", "Санхүүгийн үйл ажиллагааны цэвэр мөнгөн гүйлгээний дүн", "F", "3.1+3.2", "N", "Y", false, 0],
    ["MGT", 480, "4", "Валютын ханшийн зөрүүний нөлөө", "C", "FX_EFFECT", "N", "Y", false, 0],
    ["MGT", 490, "X", "Ангилаагүй мөнгөн гүйлгээ (тайлагнахаас өмнө 0 болгох)", "C", "NON_CASH", "N", "Z", false, 0],
    ["MGT", 500, "5", "Бүх цэвэр мөнгөн гүйлгээ", "F", "1+2+3+4+X", "N", "Y", false, 0],
    ["MGT", 510, "6", "Мөнгө, түүнтэй адилтгах хөрөнгийн эхний үлдэгдэл", "P", "1100..1198", "G", "Y", false, 0],
    ["MGT", 520, "7", "Мөнгө, түүнтэй адилтгах хөрөнгийн эцсийн үлдэгдэл", "F", "5+6", "N", "Y", false, 0],
    ["MGT", 530, "LEDGER", "Мөнгөн хөрөнгийн эцсийн үлдэгдэл (дэвтрээр)", "P", "1100..1198", "B", "N", false, 0],
    ["MGT", 540, "CHK", "Шалгалт: МГТ - дэвтэр = 0", "F", "7-LEDGER", "N", "Z", false, 0]
  ];

  // ТТ-03а (VAT statement template VAT / TT03A) from db/seed/mn_50_reports.sql
  // [row, description, type(D/V/R), gen type, vat bus, vat prod, vat category, row totaling, amount type,
  //  only deductible confirmed, calculate with opposite sign, print with opposite sign, box]
  var TT03A_ROWS = [
    ['S', 'БОРЛУУЛАЛТ', 'D', null, null, null, null, null, 'NONE', false, false, false, null],
    ['1', 'Татвар ногдох борлуулалт (НӨАТ 10%) - суурь', 'V', 'SALE', null, null, 'VAT10', null, 'BASE', false, true, false, 'ТТ-03а-6'],
    ['2', 'Борлуулалтын НӨАТ (10%)', 'V', 'SALE', null, null, 'VAT10', null, 'AMOUNT', false, true, false, 'ТТ-03а-6'],
    ['3', '0 хувиар татвар ногдох борлуулалт (экспорт)', 'V', 'SALE', null, null, 'VAT0', null, 'BASE', false, true, false, 'ТТ-03а-6'],
    ['4', 'НӨАТ-аас чөлөөлөгдөх борлуулалт', 'V', 'SALE', null, null, 'EXEMPT', null, 'BASE', false, true, false, 'ТТ-03а-6'],
    ['5', 'НӨАТ-ын хамрах хүрээнээс гадуурх борлуулалт', 'V', 'SALE', null, null, 'NOVAT', null, 'BASE', false, true, false, 'ТТ-03а-6'],
    ['6', 'Нийт борлуулалт', 'R', null, null, null, null, '1|3|4|5', 'NONE', false, false, false, null],
    ['P', 'ХУДАЛДАН АВАЛТ, ИМПОРТ', 'D', null, null, null, null, null, 'NONE', false, false, false, null],
    ['7', 'Дотоодын худалдан авалт (НӨАТ 10%, ДДТД баталгаажсан) - суурь', 'V', 'PURCHASE', 'DOMESTIC', 'VAT10', null, null, 'BASE', true, false, false, 'ТТ-03а-5'],
    ['8', 'Хасагдах орцын НӨАТ (дотоод, ДДТД баталгаажсан)', 'V', 'PURCHASE', 'DOMESTIC', 'VAT10', null, null, 'AMOUNT', true, true, true, 'ТТ-03а-5'],
    ['9', 'Импортын НӨАТ (гаалийн мэдүүлгээр)', 'V', 'PURCHASE', null, 'CUSTOMS_VAT', null, null, 'AMOUNT', true, true, true, 'ТТ-03а-5'],
    ['10', 'Резидент бусын үйлчилгээний НӨАТ (урвуу тооцоо, хасагдах)', 'V', 'PURCHASE', 'IMPORT', 'IMPORT_SERVICE', null, null, 'AMOUNT', false, true, true, 'ТТ-03а-5'],
    ['11', 'Хасагдахгүй НӨАТ (мэдээлэл)', 'V', 'PURCHASE', null, null, 'VAT10', null, 'NON_DEDUCTIBLE_AMOUNT', false, false, false, null],
    ['12', 'Нийт хасагдах НӨАТ', 'R', null, null, null, null, '8|9|10', 'NONE', false, false, true, null],
    ['R', 'ТООЦООЛОЛ', 'D', null, null, null, null, null, 'NONE', false, false, false, null],
    ['13', 'Урвуу тооцооны НӨАТ (төлөх)', 'V', 'PURCHASE', 'IMPORT', 'IMPORT_SERVICE', null, null, 'FULL_AMOUNT', false, false, false, null],
    ['14', 'Төлөх (+) / илүү төлсөн (-) НӨАТ', 'R', null, null, null, null, '2|13|12', 'NONE', false, false, false, null]
  ];

  // МГТ cash-flow categories (db/seed README §4.2)
  var CASH_FLOW_CATEGORIES = {
    OP_CUST_RECEIPTS: ['Бараа, үйлчилгээ борлуулсны орлого', 'OPERATING', 'INFLOW', '1.1.1'],
    OP_ROYALTY_RECEIPTS: ['Эрхийн шимтгэл, хураамжийн орлого', 'OPERATING', 'INFLOW', '1.1.2'],
    OP_INSURANCE_CLAIMS: ['Даатгалын нөхвөр', 'OPERATING', 'INFLOW', '1.1.3'],
    OP_TAX_REFUNDS: ['Буцаан авсан татвар', 'OPERATING', 'INFLOW', '1.1.4'],
    OP_GRANTS: ['Татаас, санхүүжилт', 'OPERATING', 'INFLOW', '1.1.5'],
    OP_OTHER_RECEIPTS: ['Бусад мөнгөн орлого', 'OPERATING', 'INFLOW', '1.1.6'],
    OP_EMPLOYEES: ['Ажиллагчдад төлсөн', 'OPERATING', 'OUTFLOW', '1.2.1'],
    OP_SOCIAL_INSURANCE: ['НДШ-д төлсөн', 'OPERATING', 'OUTFLOW', '1.2.2'],
    OP_SUPPLIERS: ['Бараа материал, нийлүүлэгчид төлсөн', 'OPERATING', 'OUTFLOW', '1.2.3'],
    OP_OPERATING_EXP: ['Ашиглалтын зардалд төлсөн', 'OPERATING', 'OUTFLOW', '1.2.4'],
    OP_FUEL_TRANSPORT: ['Шатахуун, тээвэр, сэлбэгт төлсөн', 'OPERATING', 'OUTFLOW', '1.2.5'],
    OP_INTEREST_PAID: ['Хүүний төлбөрт төлсөн', 'OPERATING', 'OUTFLOW', '1.2.6'],
    OP_TAXES_PAID: ['Татварын байгууллагад төлсөн', 'OPERATING', 'OUTFLOW', '1.2.7'],
    OP_INSURANCE_PAID: ['Даатгалын төлбөрт төлсөн', 'OPERATING', 'OUTFLOW', '1.2.8'],
    OP_OTHER_PAYMENTS: ['Бусад мөнгөн зарлага', 'OPERATING', 'OUTFLOW', '1.2.9'],
    INV_FA_SALE: ['Үндсэн хөрөнгө борлуулсан', 'INVESTING', 'INFLOW', '2.1.1'],
    INV_INTANGIBLE_SALE: ['Биет бус хөрөнгө борлуулсан', 'INVESTING', 'INFLOW', '2.1.2'],
    INV_INVESTMENT_SALE: ['Хөрөнгө оруулалт борлуулсан', 'INVESTING', 'INFLOW', '2.1.3'],
    INV_OTHER_LT_SALE: ['Бусад урт хугацаат хөрөнгө борлуулсан', 'INVESTING', 'INFLOW', '2.1.4'],
    INV_LOANS_REPAID: ['Олгосон зээлийн буцаан төлөлт', 'INVESTING', 'INFLOW', '2.1.5'],
    INV_INTEREST_RCVD: ['Хүлээн авсан хүү', 'INVESTING', 'INFLOW', '2.1.6'],
    INV_DIVIDENDS_RCVD: ['Хүлээн авсан ногдол ашиг', 'INVESTING', 'INFLOW', '2.1.7'],
    INV_FA_BUY: ['Үндсэн хөрөнгө олж эзэмшсэн', 'INVESTING', 'OUTFLOW', '2.2.1'],
    INV_INTANGIBLE_BUY: ['Биет бус хөрөнгө олж эзэмшсэн', 'INVESTING', 'OUTFLOW', '2.2.2'],
    INV_INVESTMENT_BUY: ['Хөрөнгө оруулалт олж эзэмшсэн', 'INVESTING', 'OUTFLOW', '2.2.3'],
    INV_OTHER_LT_BUY: ['Бусад урт хугацаат хөрөнгө олж эзэмшсэн', 'INVESTING', 'OUTFLOW', '2.2.4'],
    INV_LOANS_GIVEN: ['Бусдад олгосон зээл, урьдчилгаа', 'INVESTING', 'OUTFLOW', '2.2.5'],
    FIN_BORROWINGS: ['Зээл авсан', 'FINANCING', 'INFLOW', '3.1.1'],
    FIN_SHARES_ISSUED: ['Хувьцаа гаргаж хүлээн авсан', 'FINANCING', 'INFLOW', '3.1.2'],
    FIN_DONATIONS: ['Хандив хүлээн авсан', 'FINANCING', 'INFLOW', '3.1.3'],
    FIN_LEASE_RECEIPTS: ['Санхүүгийн түрээсийн авлагаас', 'FINANCING', 'INFLOW', '3.1.4'],
    FIN_LOAN_REPAYMENTS: ['Зээлийн төлбөрт төлсөн', 'FINANCING', 'OUTFLOW', '3.2.1'],
    FIN_LEASE_PAYMENTS: ['Санхүүгийн түрээсийн өглөгт төлсөн', 'FINANCING', 'OUTFLOW', '3.2.2'],
    FIN_SHARE_BUYBACK: ['Хувьцаа буцаан худалдан авсан', 'FINANCING', 'OUTFLOW', '3.2.3'],
    FIN_DIVIDENDS_PAID: ['Төлсөн ногдол ашиг', 'FINANCING', 'OUTFLOW', '3.2.4'],
    FX_EFFECT: ['Валютын ханшийн зөрүүний нөлөө', 'NONE', 'BOTH', '4'],
    CASH_TRANSFER: ['Мөнгөн хөрөнгө хоорондын шилжүүлэг', 'NONE', 'BOTH', null],
    NON_CASH: ['Мөнгөн бус данс (ангилалгүй)', 'NONE', 'BOTH', 'X']
  };

  // ---------------------------------------------------------------------------
  // Posting setups (db/seed/mn_30_posting.sql, mn_20_tax.sql)
  // ---------------------------------------------------------------------------
  // General Posting Setup: [gen bus ('*' = fallback row), gen prod, sales, sales line disc, purchase, purch disc, COGS]
  var GENERAL_POSTING_SETUP = [
    ['*', 'GOODS', '5100', '5190', '6100', '6190', '6100'],
    ['*', 'SERVICES', '5110', '5190', '7200', '7200', '6110'],
    ['*', 'FA', '8600', null, '1660', null, null],
    ['*', 'MISC', '8200', null, '7200', null, null],
    ['DOMESTIC', 'GOODS', '5100', '5190', '6100', '6190', '6100', '5190'],
    ['DOMESTIC', 'SERVICES', '5110', '5190', '7200', '7200', '6110', '5190'],
    ['DOMESTIC', 'FA', '8600', null, '1660', null, null],
    ['DOMESTIC', 'MISC', '8200', null, '7200', null, null],
    ['EXPORT', 'GOODS', '5120', '5190', '6100', '6190', '6100', '5190'],
    ['EXPORT', 'SERVICES', '5120', '5190', '7200', '7200', '6110', '5190'],
    ['EXPORT', 'FA', '8600', null, '1660', null, null],
    ['EXPORT', 'MISC', '8200', null, '7200', null, null],
    ['RELATED', 'GOODS', '5130', '5190', '6100', '6190', '6100'],
    ['RELATED', 'SERVICES', '5130', '5190', '7200', '7200', '6110'],
    ['RELATED', 'FA', '8600', null, '1660', null, null],
    ['RELATED', 'MISC', '8200', null, '7200', null, null]
  ];

  // VAT Posting Setup: [vat bus, vat prod, calc type, vat category, %, eBarimt taxType, taxProductCode, sales VAT acc, purchase VAT acc, reverse-charge acc,
  //  vat identifier] — identifier = the document grouping key of D-E3 / BR-TAX-18 (seed: VAT10, VAT0, EXEMPT, NOVAT, RC10, CUSTOMS)
  var VAT_POSTING_SETUP = [
    ['DOMESTIC', 'VAT10', 'NORMAL', 'VAT10', 10, 'VAT_ABLE', null, '2300', '1300', null, 'VAT10'],
    ['DOMESTIC', 'VAT0', 'NORMAL', 'VAT0', 0, 'VAT_ZERO', 'TBD', '2300', '1300', null, 'VAT0'],
    ['DOMESTIC', 'EXEMPT', 'NORMAL', 'EXEMPT', 0, 'VAT_FREE', 'TBD', '2300', '1300', null, 'EXEMPT'],
    ['DOMESTIC', 'NOVAT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['DOMESTIC', 'CUSTOMS_VAT', 'FULL_VAT', 'VAT10', 10, 'VAT_ABLE', null, '2300', '1300', null, 'CUSTOMS'],
    ['EXPORT', 'VAT10', 'NORMAL', 'VAT0', 0, 'VAT_ZERO', 'TBD', '2300', '1300', null, 'VAT0'],
    ['EXPORT', 'VAT0', 'NORMAL', 'VAT0', 0, 'VAT_ZERO', 'TBD', '2300', '1300', null, 'VAT0'],
    ['EXPORT', 'EXEMPT', 'NORMAL', 'EXEMPT', 0, 'VAT_FREE', 'TBD', '2300', '1300', null, 'EXEMPT'],
    ['EXPORT', 'NOVAT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['IMPORT', 'VAT10', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['IMPORT', 'VAT0', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['IMPORT', 'EXEMPT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['IMPORT', 'NOVAT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['IMPORT', 'IMPORT_SERVICE', 'REVERSE_CHARGE', 'VAT10', 10, 'VAT_ABLE', null, '2300', '1300', '2305', 'RC10'],
    ['IMPORT', 'CUSTOMS_VAT', 'FULL_VAT', 'VAT10', 10, 'VAT_ABLE', null, '2300', '1300', null, 'CUSTOMS'],
    ['NONREG', 'VAT10', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['NONREG', 'VAT0', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['NONREG', 'EXEMPT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT'],
    ['NONREG', 'NOVAT', 'NORMAL', 'NOVAT', 0, 'NOT_VAT', null, '2300', '1300', null, 'NOVAT']
  ];

  ERP.data = {
    meta: {
      notice: 'Жишээ өгөгдөл — бодит компани биш',
      today: '2026-10-08',            // business "today" (Asia/Ulaanbaatar) used by cues, aging and drafts
      workDate: '2026-10-08',
      seedSource: 'db/seed/*.sql (MN localization package)'
    },

    company: {
      name: 'Наран Түмэн ХХК',
      nameShort: 'Наран Түмэн',
      tin: '00000000099',             // obviously fake 11-digit ТТД
      registrationNo: '0000099',      // obviously fake 7-digit state registration number
      address: 'Улаанбаатар, жишээ дүүрэг, 1-р хороо, Жишээ гудамж 7',
      activity: 'Компьютер засвар, IT үйлчилгээ, дагалдах хэрэгслийн жижиглэн худалдаа',
      vatRegistered: true,
      vatRegisteredFrom: '2019-03-01',
      cityTaxPayer: false,
      lcy: 'MNT',
      amountRoundingPrecision: '0.01',
      unitAmountRoundingPrecision: '0.00001',
      invoiceRoundingEnabled: false,
      allowPostingFrom: '2026-01-01',
      allowPostingTo: '2026-12-31',
      goLiveDate: '2026-01-01',
      users: [
        { id: 'U1', name: 'Б. Наранбаатар', role: 'OWNER', roleMn: 'Эзэн' },
        { id: 'U2', name: 'Д. Сарнай', role: 'ACCOUNTANT', roleMn: 'Нягтлан' }
      ]
    },

    fiscalYear: {
      year: 2026,
      // accounting period status after the mock history (D-D3): Jan-Aug closed, Sep being closed, Oct-Dec open
      periodStatus: { '01': 'CLOSED', '02': 'CLOSED', '03': 'CLOSED', '04': 'CLOSED', '05': 'CLOSED', '06': 'CLOSED',
        '07': 'CLOSED', '08': 'CLOSED', '09': 'OPEN', '10': 'OPEN', '11': 'OPEN', '12': 'OPEN' },
      // VAT return period status (BR-TAX-43): Jan-Aug submitted; Sep due 2026-10-10
      vatPeriodStatus: { '01': 'SUBMITTED', '02': 'SUBMITTED', '03': 'SUBMITTED', '04': 'SUBMITTED', '05': 'SUBMITTED',
        '06': 'SUBMITTED', '07': 'SUBMITTED', '08': 'SUBMITTED', '09': 'OPEN', '10': 'OPEN', '11': 'OPEN', '12': 'OPEN' },
      vatReturnDueDay: 10
    },

    taxParameters: [
      // subset of tax.tax_parameter used by the prototype (legal_parameters.sql, D-E7)
      { code: 'vat.standard_rate', value: '0.10', unit: 'ratio', from: '2016-01-01', status: 'verified' },
      { code: 'vat.return_due_day', value: '10', unit: 'day', from: '2016-01-01', status: 'verified' },
      { code: 'ebarimt.left_lotteries_warning', value: '100', unit: 'count', from: '2026-01-01', status: 'unverified' }
    ],

    coaRows: COA_ROWS,
    statementRows: STATEMENT_ROWS,
    tt03aRows: TT03A_ROWS,
    cashFlowCategories: CASH_FLOW_CATEGORIES,
    generalPostingSetup: GENERAL_POSTING_SETUP,
    vatPostingSetup: VAT_POSTING_SETUP,

    genBusGroups: { DOMESTIC: 'Дотоод', EXPORT: 'Гадаад (экспорт)', RELATED: 'Холбоотой тал' },
    genProdGroups: { GOODS: 'Бараа', SERVICES: 'Ажил, үйлчилгээ', FA: 'Үндсэн хөрөнгө', MISC: 'Бусад' },
    vatBusGroups: { DOMESTIC: 'Дотоодын', EXPORT: 'Экспорт', IMPORT: 'Импорт', NONREG: 'НӨАТ төлөгч бус нийлүүлэгч' },
    vatProdGroups: { VAT10: 'НӨАТ 10%', VAT0: 'НӨАТ 0%', EXEMPT: 'Чөлөөлөгдөх', NOVAT: 'Хамрах хүрээнээс гадуур',
      CUSTOMS_VAT: 'Гаалийн НӨАТ', IMPORT_SERVICE: 'Импорт үйлчилгээ (урвуу)' },

    customerPostingGroups: { DOMESTIC: { receivables: '1200', rounding: '8290' }, FOREIGN: { receivables: '1201', rounding: '8290' }, EMPLOYEE: { receivables: '1360', rounding: '8290' } },
    vendorPostingGroups: { DOMESTIC: { payables: '2100', rounding: '8290' }, FOREIGN: { payables: '2101', rounding: '8290' }, EMPLOYEE: { payables: '2210', rounding: '8290' }, CUSTOMS: { payables: '2365', rounding: '8290' } },
    bankPostingGroups: { CASH_MNT: '1100', CASH_FCY: '1101', BANK_MNT: '1110', BANK_MNT_2: '1111', BANK_FCY: '1115', WALLET: '1120', CARD: '1121' },

    paymentTerms: {
      CASH: { name: 'Бэлэн (0 хоног)', formula: '0D' },
      NET7: { name: '7 хоног', formula: '7D' },
      NET15: { name: '15 хоног', formula: '15D' },
      NET30: { name: '30 хоног', formula: '30D' },
      EOM: { name: 'Сарын эцэс', formula: 'CM' }
    },
    // Payment methods (mn_40_setup.sql): CASH has a balancing account (D-F5 cash sale)
    paymentMethods: {
      CASH: { name: 'Бэлэн мөнгө', balBank: 'CASH01', ebarimt: 'CASH' },
      BANK: { name: 'Банкны шилжүүлэг', balBank: null, ebarimt: 'BANK_TRANSFER' },
      CARD: { name: 'Төлбөрийн карт (POS)', balBank: null, ebarimt: 'PAYMENT_CARD' },
      QPAY: { name: 'QPay', balBank: null, ebarimt: 'BANK_TRANSFER_QPAY' }
    },
    unitsOfMeasure: { PCS: 'ш', HOUR: 'цаг', MONTH: 'сар', SERVICE: 'үйлчилгээ', SET: 'багц', BOX: 'хайрцаг', KG: 'кг' },
    reasonCodes: { RETURN: 'Бараа буцаалт', PRICE_ADJ: 'Үнийн тохируулга, хөнгөлөлт', CANCEL: 'Нэхэмжлэх цуцлах (бүтэн кредит нот)',
      CORRECTION: 'Алдаа засах', REVERSAL: 'Журналын гүйлгээ буцаах', OPENING: 'Эхний үлдэгдэл оруулах', EBARIMT_FIX: 'eBarimt баримтын засвар (inactiveId)' },

    // Number series (mn_40_setup.sql fn_mn_number_series_def): legal ones gapless, yearly PREFIX-YYYY-#####
    numberSeries: {
      SI: { name: 'Борлуулалтын нэхэмжлэх (батлагдсан, ТМ-1)', prefix: 'SI', width: 5, gapless: true, yearly: true },
      SC: { name: 'Борлуулалтын кредит нот (батлагдсан)', prefix: 'SC', width: 5, gapless: true, yearly: true },
      PI: { name: 'Худалдан авалтын нэхэмжлэх (батлагдсан)', prefix: 'PI', width: 5, gapless: true, yearly: true },
      PC: { name: 'Худалдан авалтын кредит нот (батлагдсан)', prefix: 'PC', width: 5, gapless: true, yearly: true },
      KO: { name: 'Кассын орлогын баримт (МХ-1)', prefix: 'KO', width: 5, gapless: true, yearly: true },
      KZ: { name: 'Кассын зарлагын баримт (МХ-2)', prefix: 'KZ', width: 5, gapless: true, yearly: true },
      BR: { name: 'Банкны орлогын ваучер', prefix: 'BR', width: 5, gapless: true, yearly: true },
      BP: { name: 'Банкны зарлагын ваучер', prefix: 'BP', width: 5, gapless: true, yearly: true },
      GJ: { name: 'Ерөнхий журналын ваучер', prefix: 'GJ', width: 5, gapless: true, yearly: true },
      OB: { name: 'Эхний үлдэгдлийн ваучер', prefix: 'OB', width: 5, gapless: true, yearly: true },
      CL: { name: 'Жилийн хаалтын ваучер', prefix: 'CL', width: 5, gapless: true, yearly: true },
      SI_DRAFT: { name: 'Борлуулалтын нэхэмжлэхийн ноорог', prefix: 'DSI-', width: 6, gapless: false, yearly: false },
      SC_DRAFT: { name: 'Борлуулалтын кредит нотын ноорог', prefix: 'DSC-', width: 6, gapless: false, yearly: false },
      PI_DRAFT: { name: 'Худалдан авалтын нэхэмжлэхийн ноорог', prefix: 'DPI-', width: 6, gapless: false, yearly: false },
      JNL_DRAFT: { name: 'Журналын мөрийн ноорог дугаар', prefix: 'J-', width: 6, gapless: false, yearly: false }
    },

    // Money accounts (bank.bank_account): kind CASH / BANK. Account numbers are fake.
    bankAccounts: [
      { no: 'CASH01', name: 'Үндсэн касс', kind: 'CASH', postingGroup: 'CASH_MNT', bankName: null, accountNo: null, preventNegative: true },
      { no: 'KHAN01', name: 'Хаан банк — харилцах (MNT)', kind: 'BANK', postingGroup: 'BANK_MNT', bankName: 'Хаан банк', accountNo: '5000000001', preventNegative: false },
      { no: 'GOLOMT01', name: 'Голомт банк — харилцах (MNT)', kind: 'BANK', postingGroup: 'BANK_MNT_2', bankName: 'Голомт банк', accountNo: '1100000002', preventNegative: false }
    ],

    // eBarimt merchant setup (ebarimt.ebarimt_setup / ebarimt_pos) — STAGING-like values, fictional
    ebarimtSetup: {
      enabled: true, environment: 'STAGING', merchantTin: '00000000099', districtCode: '2501', branchNo: '001', posNo: '001',
      defaultClassificationCode: '8316200',      // БҮНА (CPC 2.1 based): computer systems management services
      posapiInstance: { name: 'posapi-01 (жишээ)', leftLotteries: 4820, lastSendData: '2026-10-08 07:12' }
    },

    customers: [
      { no: 'C00001', name: 'Өглөөний Туяа ХХК', kind: 'LEGAL', tin: '00000000201', regNo: '0000201', cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'NET30', method: 'BANK', piv: false, creditLimit: '6000000.00', ebarimt: 'AUTO', phone: '9900****', address: 'Улаанбаатар, жишээ хаяг 1' },
      { no: 'C00002', name: 'Цэнхэр Тал ТББ', kind: 'LEGAL', tin: '00000000302', regNo: '0000302', cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'NET15', method: 'BANK', piv: false, creditLimit: '3000000.00', ebarimt: 'AUTO', phone: '8800****', address: 'Улаанбаатар, жишээ хаяг 2' },
      { no: 'C00003', name: 'Алтан Зам Сервис ХХК', kind: 'LEGAL', tin: '00000000403', regNo: '0000403', cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'NET30', method: 'BANK', piv: false, creditLimit: '4000000.00', ebarimt: 'AUTO', phone: '9500****', address: 'Дархан, жишээ хаяг 3' },
      { no: 'C00004', name: 'Мөнгөн Ус ХХК', kind: 'LEGAL', tin: '00000000504', regNo: '0000504', cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'NET7', method: 'BANK', piv: false, creditLimit: '2000000.00', ebarimt: 'AUTO', phone: '9100****', address: 'Улаанбаатар, жишээ хаяг 4' },
      { no: 'C00005', name: 'Б. Сарангэрэл (иргэн)', kind: 'INDIVIDUAL', tin: null, regNo: 'УБ******33', cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'CASH', method: 'CASH', piv: true, creditLimit: '0.00', ebarimt: 'B2C', phone: '99****33', address: '' },
      { no: 'C00006', name: 'Иргэн (жижиглэн борлуулалт)', kind: 'INDIVIDUAL', tin: null, regNo: null, cpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC',
        terms: 'CASH', method: 'CASH', piv: true, creditLimit: '0.00', ebarimt: 'B2C', phone: '', address: '' }
    ],

    vendors: [
      { no: 'V00001', name: 'Төв Оффис Түрээс ХХК', kind: 'LEGAL', tin: '00000000611', vpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC', terms: 'NET15', method: 'BANK', template: 'DOMESTIC_VAT' },
      { no: 'V00002', name: 'Дата Холбоо ХХК', kind: 'LEGAL', tin: '00000000712', vpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC', terms: 'NET15', method: 'BANK', template: 'DOMESTIC_VAT' },
      { no: 'V00003', name: 'Шатахуун Түгээгч ХХК', kind: 'LEGAL', tin: '00000000813', vpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC', terms: 'NET7', method: 'BANK', template: 'DOMESTIC_VAT' },
      { no: 'V00004', name: 'Бөөний Техник Хангамж ХХК', kind: 'LEGAL', tin: '00000000914', vpg: 'DOMESTIC', genBus: 'DOMESTIC', vatBus: 'DOMESTIC', terms: 'NET30', method: 'BANK', template: 'DOMESTIC_VAT' }
    ],

    // Items (R1: SERVICE / NON_INVENTORY only, D-G5). bunaa = eBarimt classificationCode: 7-digit БҮНА product code, which is
    // built on the UN CPC (5-digit subclass + 2) — not the ISIC/ҮАНА activity code of the company. Selection (to be checked
    // against the eBarimt reference list): 87130 repair of computers, 83162 computer systems management, 83142 IT design and
    // development for networks, 83151 website hosting, 4526x input units, 4527x storage units, 4529x parts and accessories,
    // 92900 other education and training. barcode = in-store GS1 prefix 2xx with a valid EAN-13 check digit.
    items: [
      { no: 'I00001', name: 'Компьютер засвар үйлчилгээ', type: 'SERVICE', uom: 'HOUR', price: '60000', piv: false, genProd: 'SERVICES', vatProd: 'VAT10', bunaa: '8713000', barcode: null, barcodeType: 'UNDEFINED', taxProductCode: null },
      { no: 'I00002', name: 'IT дэмжлэгийн сарын гэрээ', type: 'SERVICE', uom: 'MONTH', price: '1600000', piv: false, genProd: 'SERVICES', vatProd: 'VAT10', bunaa: '8316200', barcode: null, barcodeType: 'UNDEFINED', taxProductCode: null },
      { no: 'I00003', name: 'Сүлжээ суурилуулалт', type: 'SERVICE', uom: 'SERVICE', price: '950000', piv: false, genProd: 'SERVICES', vatProd: 'VAT10', bunaa: '8314200', barcode: null, barcodeType: 'UNDEFINED', taxProductCode: null },
      { no: 'I00004', name: 'Вэб хостинг (сар)', type: 'SERVICE', uom: 'MONTH', price: '90000', piv: false, genProd: 'SERVICES', vatProd: 'VAT10', bunaa: '8315100', barcode: null, barcodeType: 'UNDEFINED', taxProductCode: null },
      { no: 'I00005', name: 'Утасгүй хулгана', type: 'NON_INVENTORY', uom: 'PCS', price: '32000', piv: true, genProd: 'GOODS', vatProd: 'VAT10', bunaa: '4526000', barcode: '2000000000015', barcodeType: 'GS1', taxProductCode: null },
      { no: 'I00006', name: 'USB гар', type: 'NON_INVENTORY', uom: 'PCS', price: '49500', piv: true, genProd: 'GOODS', vatProd: 'VAT10', bunaa: '4526000', barcode: '2000000000022', barcodeType: 'GS1', taxProductCode: null },
      { no: 'I00007', name: 'USB флаш 64GB', type: 'NON_INVENTORY', uom: 'PCS', price: '18700', piv: true, genProd: 'GOODS', vatProd: 'VAT10', bunaa: '4527000', barcode: '2000000000039', barcodeType: 'GS1', taxProductCode: null },
      { no: 'I00008', name: 'Принтерийн хор', type: 'NON_INVENTORY', uom: 'PCS', price: '99000', piv: true, genProd: 'GOODS', vatProd: 'VAT10', bunaa: '4529000', barcode: '2000000000046', barcodeType: 'GS1', taxProductCode: null },
      { no: 'I00009', name: 'Компьютерийн анхан шатны сургалт (тусгай зөвшөөрөлтэй)', type: 'SERVICE', uom: 'SERVICE', price: '350000', piv: false, genProd: 'SERVICES', vatProd: 'EXEMPT', bunaa: '9290000', barcode: null, barcodeType: 'UNDEFINED', taxProductCode: '305' }
    ],

    // Draft sales invoices (sales.sales_header OPEN) — editable in the prototype
    drafts: [
      { no: 'DSI-000034', docType: 'INVOICE', customer: 'C00001', documentDate: '2026-10-05', postingDate: '2026-10-05',
        lines: [{ type: 'ITEM', no: 'I00002', qty: '1' }, { type: 'ITEM', no: 'I00001', qty: '4' }], createdBy: 'U2' },
      { no: 'DSI-000035', docType: 'INVOICE', customer: 'C00006', documentDate: '2026-10-08', postingDate: '2026-10-08',
        lines: [{ type: 'ITEM', no: 'I00005', qty: '2' }, { type: 'ITEM', no: 'I00007', qty: '1' }], createdBy: 'U2' },
      { no: 'DSI-000036', docType: 'INVOICE', customer: 'C00004', documentDate: '2026-10-08', postingDate: '2026-10-08',
        note: 'FR-SAL-003 AC1-ийн бөөрөнхийлөлтийн жишээ (3 × 333.335, хөнгөлөлт 10%) ба дансны мөр',
        lines: [{ type: 'ITEM', no: 'I00001', qty: '3', price: '333.335', disc: '10', description: 'Засвар үйлчилгээ (жишээ үнэ)' },
          { type: 'GL_ACCOUNT', no: '8100', qty: '1', price: '50000', description: 'Компьютерийн тоног төхөөрөмжийн түрээс', classificationCode: '7312400' }], createdBy: 'U2' }
    ],
    draftCounters: { SI_DRAFT: 36, SC_DRAFT: 3, PI_DRAFT: 14, JNL_DRAFT: 52 },

    // Bank statement lines that are on the bank's statement but not (yet) in the books — used by the
    // reconciliation screen (cash-bank builder). The rest of the statement is derived from posted bank entries.
    bankStatementExtras: [
      { bank: 'KHAN01', date: '2026-09-30', amount: '-2500.00', text: 'ШИМТГЭЛ — дансны хөтлөлт 9-р сар' },
      { bank: 'KHAN01', date: '2026-09-30', amount: '715000.00', text: 'Мөнгөн Ус ХХК SI-2026-00024 төлбөр' },
      { bank: 'GOLOMT01', date: '2026-09-30', amount: '1240.00', text: 'ХАДГАЛАМЖИЙН ХҮҮ 9-р сар' }
    ],
    reconciledThrough: { KHAN01: '2026-08-31', GOLOMT01: '2026-08-31' },

    sources: null   // filled below
  };

  // ---------------------------------------------------------------------------
  // SOURCE TRANSACTIONS (Jan–Sep 2026). The engine posts them in date order on startup.
  // Types: journal | salesInvoice | salesCreditMemo | purchaseInvoice | receipt | vendorPayment |
  //        bankGl | transfer | vatSettlement | vatPayment
  // ---------------------------------------------------------------------------
  var src = [];
  function add(o) { src.push(o); return o; }
  function I(no, qty, extra) { var l = { type: 'ITEM', no: no, qty: String(qty) }; for (var k in extra || {}) l[k] = extra[k]; return l; }
  function G(acc, qty, price, desc, code) { var l = { type: 'GL_ACCOUNT', no: acc, qty: String(qty), price: price, description: desc }; if (code) l.classificationCode = code; return l; }

  // Opening balances at go-live (D-D7): receivables and payables per document
  add({ t: 'journal', id: 'OB1', date: '2026-01-01', series: 'OB', source: 'OPENING', reason: 'OPENING', desc: 'Эхний үлдэгдэл 2026.01.01',
    lines: [
      { bank: 'CASH01', amt: '850000.00', desc: 'Кассын эхний үлдэгдэл' },
      { bank: 'KHAN01', amt: '18400000.00', desc: 'Хаан банкны эхний үлдэгдэл' },
      { bank: 'GOLOMT01', amt: '5100000.00', desc: 'Голомт банкны эхний үлдэгдэл' },
      { cust: 'C00001', amt: '2200000.00', ref: 'OB-C00001', extDoc: 'ТМ1-2025-0412', due: '2026-01-15', desc: 'Авлага: 2025 оны 12-р сарын нэхэмжлэх' },
      { cust: 'C00002', amt: '1650000.00', ref: 'OB-C00002', extDoc: 'ТМ1-2025-0418', due: '2026-01-20', desc: 'Авлага: 2025 оны 12-р сарын нэхэмжлэх' },
      { acc: '1630', amt: '8500000.00', desc: 'Компьютер, дагалдах хэрэгсэл (өртөг)' },
      { acc: '1690', amt: '-2125000.00', desc: 'Хуримтлагдсан элэгдэл' },
      { vend: 'V00004', amt: '-1320000.00', ref: 'OB-V00004', extDoc: 'БТХ-2025-771', due: '2026-01-20', desc: 'Өглөг: 2025 оны 12-р сарын нэхэмжлэх' },
      { acc: '2310', amt: '-480000.00', desc: 'НӨАТ-ын тооцоо: 2025 оны 12-р сар (төлөх)' },
      { acc: '3100', amt: '-10000000.00', desc: 'Өмч (дүрмийн сан)' },
      { acc: '3400', amt: '-22775000.00', desc: 'Хуримтлагдсан ашиг' }
    ] });

  // Sales invoices. ebarimt: SUCCESS (default) | ERROR | UNKNOWN | PENDING
  var SALES = [
    ['S1', '2026-01-08', 'C00001', [I('I00002', 1), I('I00001', 6)]],
    ['S2', '2026-01-14', 'C00006', [I('I00005', 2), I('I00007', 3)]],
    ['S3', '2026-01-22', 'C00002', [I('I00003', 1), I('I00001', 4)]],
    ['S4', '2026-02-05', 'C00001', [I('I00002', 1)]],
    ['S5', '2026-02-17', 'C00003', [I('I00008', 10, { disc: '5' })]],
    ['S6', '2026-02-26', 'C00005', [I('I00009', 1), I('I00006', 1)]],
    ['S7', '2026-03-04', 'C00001', [I('I00002', 1)]],
    ['S8', '2026-03-19', 'C00004', [I('I00002', 1), I('I00001', 12), I('I00004', 12)]],
    ['S9', '2026-03-27', 'C00006', [I('I00005', 3), I('I00006', 2), I('I00008', 1)]],
    ['S10', '2026-04-06', 'C00001', [I('I00002', 1)]],
    ['S11', '2026-04-15', 'C00002', [I('I00009', 6)]],
    ['S12', '2026-04-28', 'C00003', [I('I00003', 2), I('I00007', 20)]],
    ['S13', '2026-05-07', 'C00001', [I('I00002', 1), I('I00001', 3)]],
    ['S14', '2026-05-21', 'C00006', [I('I00007', 5), I('I00008', 2)]],
    ['S15', '2026-06-03', 'C00001', [I('I00002', 1)]],
    ['S16', '2026-06-16', 'C00004', [I('I00002', 1), I('I00001', 8)]],
    ['S17', '2026-06-29', 'C00005', [I('I00006', 1), I('I00005', 1)]],
    ['S18', '2026-07-06', 'C00001', [I('I00002', 1)]],
    ['S19', '2026-07-20', 'C00003', [I('I00008', 15)]],
    ['S20', '2026-08-04', 'C00001', [I('I00002', 1), I('I00003', 1)]],
    ['S21', '2026-08-18', 'C00002', [I('I00001', 10), G('8100', 1, '50000', 'Компьютерийн тоног төхөөрөмжийн түрээс (8-р сар)', '7312400')]],
    ['S22', '2026-08-27', 'C00006', [I('I00005', 4), I('I00007', 4)]],
    ['S23', '2026-09-03', 'C00001', [I('I00002', 1)]],
    ['S24', '2026-09-12', 'C00004', [I('I00002', 1), I('I00001', 6), I('I00003', 1)]],
    ['S25', '2026-09-22', 'C00003', [I('I00008', 8)], { ebarimt: 'UNKNOWN', ebarimtError: 'Timeout: PosAPI 20 секундэд хариу өгсөнгүй' }],
    ['S26', '2026-09-26', 'C00006', [I('I00006', 2)], { ebarimt: 'ERROR', ebarimtError: 'ebarimt.classification_code_rejected (жишээ алдаа)' }],
    ['S27', '2026-09-29', 'C00002', [I('I00001', 5)], { ebarimt: 'PENDING' }]
  ];
  SALES.forEach(function (s) {
    var o = { t: 'salesInvoice', id: s[0], date: s[1], cust: s[2], lines: s[3] };
    var x = s[4] || {};
    for (var k in x) o[k] = x[k];
    add(o);
  });

  // Credit memos (D-F6: posted on their own date, auto-applied to the corrected invoice)
  add({ t: 'salesCreditMemo', id: 'CM1', date: '2026-02-20', cust: 'C00003', appliesTo: 'S5', reason: 'RETURN', lines: [I('I00008', 2, { disc: '5' })] });
  add({ t: 'salesCreditMemo', id: 'CM2', date: '2026-05-25', cust: 'C00006', appliesTo: 'S14', reason: 'RETURN', lines: [I('I00007', 1)] });
  add({ t: 'salesCreditMemo', id: 'CM3', date: '2026-08-30', cust: 'C00001', appliesTo: 'S20', reason: 'PRICE_ADJ', lines: [I('I00003', 1, { price: '30000', description: 'Сүлжээ суурилуулалт — үнийн тохируулга' })] });

  // Purchase invoices with the supplier's eBarimt ДДТД (33 digits, fake). confirm = input VAT confirmed (D-E4)
  var PURCH = [
    ['P1', '2026-01-06', 'V00001', 'ТОТ-26-001', [G('7210', 3, '600000', 'Оффисын түрээс 1-р улирал')], true],
    ['P2', '2026-01-15', 'V00004', 'БТХ-26-014', [G('6100', 1, '620000', 'Дагалдах хэрэгсэл (хулгана, флаш) борлуулах зориулалттай')], true],
    ['P3', '2026-02-10', 'V00002', 'ДХ-26-0210', [G('7212', 3, '120000', 'Интернэт 1-р улирал'), G('7231', 1, '90000', 'Хостинг серверийн түрээс')], true],
    ['P4', '2026-03-12', 'V00003', 'ШТ-0312-88', [G('7220', 1, '180000', 'Шатахуун 2-3 сар')], true],
    ['P5', '2026-04-03', 'V00001', 'ТОТ-26-002', [G('7210', 3, '600000', 'Оффисын түрээс 2-р улирал')], true],
    ['P6', '2026-04-20', 'V00004', 'БТХ-26-061', [G('6100', 1, '890000', 'Принтерийн хор, гар')], true],
    ['P7', '2026-05-08', 'V00004', 'БТХ-26-077', [G('1630', 1, '2400000', 'Зөөврийн компьютер (засварын ажлын байр)')], true],
    ['P8', '2026-05-14', 'V00002', 'ДХ-26-0514', [G('7212', 3, '120000', 'Интернэт 2-р улирал'), G('7231', 1, '90000', 'Хостинг серверийн түрээс')], true],
    ['P9', '2026-06-18', 'V00003', 'ШТ-0618-14', [G('7220', 1, '210000', 'Шатахуун 4-6 сар')], true],
    ['P10', '2026-07-02', 'V00001', 'ТОТ-26-003', [G('7210', 3, '600000', 'Оффисын түрээс 3-р улирал')], true],
    ['P11', '2026-07-22', 'V00004', 'БТХ-26-120', [G('6100', 1, '980000', 'Принтерийн хор, гар, флаш')], true],
    ['P12', '2026-08-11', 'V00002', 'ДХ-26-0811', [G('7212', 3, '120000', 'Интернэт 3-р улирал'), G('7231', 1, '90000', 'Хостинг серверийн түрээс')], true],
    ['P13', '2026-09-12', 'V00004', 'БТХ-26-164', [G('6100', 1, '760000', 'Хулгана, принтерийн хор')], false, 'NO_DDTD'],
    ['P14', '2026-09-25', 'V00003', 'ШТ-0925-41', [G('7220', 1, '150000', 'Шатахуун 7-9 сар')], false]
  ];
  var vtin = { V00001: '00000000611', V00002: '00000000712', V00003: '00000000813', V00004: '00000000914' };
  PURCH.forEach(function (p, i) {
    var d = p[1].replace(/-/g, '');
    var ddtd = p[6] === 'NO_DDTD' ? null : ('0' + vtin[p[2]] + d + '0915' + String(30 + i).padStart(2, '0') + String(1000 + i * 7).padStart(7, '0'));
    add({ t: 'purchaseInvoice', id: p[0], date: p[1], vend: p[2], vendorInvoiceNo: p[3], lines: p[4], ddtd: ddtd, confirm: p[5] });
  });

  // Customer receipts (bank or cash). appliesTo = source id of the invoice / opening entry (Applies-to Doc.);
  // amount null = the remaining amount of that entry (the bank paid it in full), otherwise a partial payment
  [
    ['2026-01-12', 'KHAN01', 'C00001', '2200000.00', 'OB-C00001'],
    ['2026-01-25', 'GOLOMT01', 'C00002', '1650000.00', 'OB-C00002'],
    ['2026-02-03', 'KHAN01', 'C00001', null, 'S1'],
    ['2026-02-04', 'GOLOMT01', 'C00002', null, 'S3'],
    ['2026-03-02', 'KHAN01', 'C00001', null, 'S4'],
    ['2026-03-15', 'KHAN01', 'C00003', null, 'S5'],
    ['2026-04-01', 'KHAN01', 'C00001', null, 'S7'],
    ['2026-04-10', 'GOLOMT01', 'C00004', null, 'S8'],
    ['2026-04-29', 'GOLOMT01', 'C00002', null, 'S11'],
    ['2026-05-04', 'KHAN01', 'C00001', null, 'S10'],
    ['2026-05-25', 'KHAN01', 'C00003', '1500000.00', 'S12'],
    ['2026-06-04', 'KHAN01', 'C00001', null, 'S13'],
    ['2026-06-20', 'KHAN01', 'C00003', null, 'S12'],
    ['2026-06-25', 'GOLOMT01', 'C00004', null, 'S16'],
    ['2026-07-02', 'KHAN01', 'C00001', null, 'S15'],
    ['2026-08-03', 'KHAN01', 'C00001', null, 'S18'],
    ['2026-08-14', 'KHAN01', 'C00003', '800000.00', 'S19'],
    ['2026-09-05', 'KHAN01', 'C00001', null, 'S20'],
    ['2026-09-10', 'GOLOMT01', 'C00002', null, 'S21']
  ].forEach(function (r) { add({ t: 'receipt', date: r[0], bank: r[1], cust: r[2], amount: r[3], appliesTo: r[4] }); });

  // Vendor payments. 6th column = МГТ category override on the bank entry (BR-RPT-73, 10 §5.14): a payment to 2100 would
  // otherwise land in 1.2.3 "бараа материал" — rent and internet are 1.2.4, fuel 1.2.5, the laptop (P7, 1630) is investing 2.2.1
  [
    ['2026-01-20', 'KHAN01', 'V00004', '1320000.00', 'OB-V00004'],
    ['2026-01-16', 'KHAN01', 'V00001', null, 'P1', 'OP_OPERATING_EXP'],
    ['2026-02-12', 'KHAN01', 'V00004', null, 'P2'],
    ['2026-02-20', 'GOLOMT01', 'V00002', null, 'P3', 'OP_OPERATING_EXP'],
    ['2026-03-16', 'KHAN01', 'V00003', null, 'P4', 'OP_FUEL_TRANSPORT'],
    ['2026-04-14', 'KHAN01', 'V00001', null, 'P5', 'OP_OPERATING_EXP'],
    ['2026-05-18', 'KHAN01', 'V00004', null, 'P6'],
    ['2026-05-20', 'KHAN01', 'V00004', null, 'P7', 'INV_FA_BUY'],
    ['2026-05-27', 'GOLOMT01', 'V00002', null, 'P8', 'OP_OPERATING_EXP'],
    ['2026-06-24', 'KHAN01', 'V00003', null, 'P9', 'OP_FUEL_TRANSPORT'],
    ['2026-07-15', 'KHAN01', 'V00001', null, 'P10', 'OP_OPERATING_EXP'],
    ['2026-08-19', 'KHAN01', 'V00004', null, 'P11'],
    ['2026-08-25', 'GOLOMT01', 'V00002', null, 'P12', 'OP_OPERATING_EXP']
  ].forEach(function (r) { add({ t: 'vendorPayment', date: r[0], bank: r[1], vend: r[2], amount: r[3], appliesTo: r[4], cf: r[5] || null }); });

  // Payroll journal import (PAYROLLJNL, R2 import format; amounts computed outside the ERP):
  // 2 employees × gross 900 000 = 1 800 000. Employee НДШ 11.5 % = 103 500 each (207 000); ХХОАТ 10 % × (900 000 − 103 500)
  // = 79 650 less the monthly tax credit 18 000 for income 500 001–1 000 000 (pit.credit_table_monthly) = 61 650 each (123 300);
  // net 1 800 000 − 207 000 − 123 300 = 1 469 700; employer НДШ 12.5 % = 225 000 (si.employer_rate*, risk class 1).
  var months = ['01', '02', '03', '04', '05', '06', '07', '08', '09'];
  var mdays = { '01': 31, '02': 28, '03': 31, '04': 30, '05': 31, '06': 30, '07': 31, '08': 31, '09': 30 };
  months.forEach(function (m) {
    var end = '2026-' + m + '-' + mdays[m];
    add({ t: 'journal', id: 'PAY' + m, date: end, series: 'GJ', source: 'PAYROLLJNL', desc: 'Цалин ' + Number(m) + '-р сар (импорт)',
      lines: [
        { acc: '7201', amt: '1800000.00', desc: 'Цалингийн зардал' },
        { acc: '7202', amt: '225000.00', desc: 'НДШ (ажил олгогч)' },
        { acc: '2200', amt: '-1469700.00', desc: 'Олгох цалин' },
        { acc: '2340', amt: '-123300.00', desc: 'ХХОАТ суутгасан (хөнгөлөлтийн дараа)' },
        { acc: '2350', amt: '-432000.00', desc: 'НДШ (ажилтан + ажил олгогч)' }
      ] });
  });
  // Salary and tax payments for Jan–Aug (September's are paid in October)
  months.slice(0, 8).forEach(function (m, i) {
    var nm = months[i + 1];
    add({ t: 'bankGl', date: '2026-' + nm + '-05', bank: 'KHAN01', acc: '2200', amount: '-1469700.00', desc: 'Цалин олгосон: ' + Number(m) + '-р сар' });
    add({ t: 'bankGl', date: '2026-' + nm + '-09', bank: 'KHAN01', acc: '2340', amount: '-123300.00', desc: 'ХХОАТ төлсөн: ' + Number(m) + '-р сар' });
    add({ t: 'bankGl', date: '2026-' + nm + '-09', bank: 'KHAN01', acc: '2350', amount: '-432000.00', desc: 'НДШ төлсөн: ' + Number(m) + '-р сар' });
  });
  // Bank fees (8300, finance cost) — monthly on Хаан, quarterly on Голомт
  months.forEach(function (m) {
    add({ t: 'bankGl', date: '2026-' + m + '-' + mdays[m], bank: 'KHAN01', acc: '8300', amount: '-2500.00', desc: 'ШИМТГЭЛ — дансны хөтлөлт ' + Number(m) + '-р сар' });
  });
  // September's Хаан fee is on the statement but intentionally NOT yet posted (see bankStatementExtras)
  src = src.filter(function (x) { return !(x.t === 'bankGl' && x.acc === '8300' && x.date === '2026-09-30'); });
  ['03', '06'].forEach(function (m) {
    add({ t: 'bankGl', date: '2026-' + m + '-' + mdays[m], bank: 'GOLOMT01', acc: '8300', amount: '-5000.00', desc: 'ШИМТГЭЛ — улирлын үйлчилгээ' });
    add({ t: 'bankGl', date: '2026-' + m + '-' + mdays[m], bank: 'GOLOMT01', acc: '8110', amount: '3600.00', desc: 'ХАДГАЛАМЖИЙН ХҮҮ — улирал' });
  });
  // Opening VAT payable for Dec 2025, paid on 2026-01-10
  add({ t: 'bankGl', date: '2026-01-10', bank: 'KHAN01', acc: '2310', amount: '-480000.00', desc: 'НӨАТ төлсөн: 2025 оны 12-р сар' });

  // Cash vouchers (МХ-2 small expenses; no supplier eBarimt → no input VAT, journal lines carry no VAT)
  add({ t: 'bankGl', date: '2026-03-10', bank: 'CASH01', acc: '7213', amount: '-45000.00', desc: 'Бичиг хэрэг (бэлнээр)', party: 'Жишээ дэлгүүр' });
  add({ t: 'bankGl', date: '2026-05-12', bank: 'CASH01', acc: '7270', amount: '-120000.00', desc: 'Төлөөлөх зардал', party: 'Б. Наранбаатар' });
  add({ t: 'bankGl', date: '2026-07-15', bank: 'CASH01', acc: '7222', amount: '-180000.00', desc: 'Томилолт Дархан (засварын дуудлага)', party: 'Г. Төмөрбаатар' });
  add({ t: 'bankGl', date: '2026-09-08', bank: 'CASH01', acc: '7213', amount: '-38000.00', desc: 'Бичиг хэрэг, хэвлэлийн цаас', party: 'Жишээ дэлгүүр' });

  // Cash to bank deposits (transfer)
  add({ t: 'transfer', date: '2026-03-31', from: 'CASH01', to: 'KHAN01', amount: '500000.00', desc: 'Касс → Хаан банк тушаалт' });
  add({ t: 'transfer', date: '2026-06-30', from: 'CASH01', to: 'KHAN01', amount: '400000.00', desc: 'Касс → Хаан банк тушаалт' });
  add({ t: 'transfer', date: '2026-08-31', from: 'CASH01', to: 'KHAN01', amount: '300000.00', desc: 'Касс → Хаан банк тушаалт' });

  // Quarterly depreciation, entered manually in R1 (FA module is R2): 7260 Дт / 1690 Кт, straight line, 4-year (48-month) book life.
  // Opening computers 8 500 000 / 16 quarters = 531 250 per quarter. Laptop P7 (2 400 000, in use 2026-05-08) is depreciated from
  // the 1st of the next month (D-G4): 2 400 000 / 48 = 50 000 per month → Q2 June 50 000, Q3 150 000.
  [['2026-03-31', '531250.00'], ['2026-06-30', '581250.00'], ['2026-09-30', '681250.00']].forEach(function (d, i) {
    add({ t: 'journal', id: 'DEP' + (i + 1), date: d[0], series: 'GJ', source: 'GENJNL', desc: 'Элэгдэл ' + (i + 1) + '-р улирал (гар журнал)',
      lines: [{ acc: '7260', amt: d[1], desc: 'Үндсэн хөрөнгийн элэгдэл' }, { acc: '1690', amt: '-' + d[1], desc: 'Хуримтлагдсан элэгдэл' }] });
  });

  // Monthly VAT settlement (BC VAT Settlement: 2300/1300 → 2310) and payment on the 10th; amounts are derived by the engine
  months.slice(0, 8).forEach(function (m, i) {
    add({ t: 'vatSettlement', period: '2026-' + m, date: '2026-' + m + '-' + mdays[m] });
    add({ t: 'vatPayment', period: '2026-' + m, date: '2026-' + months[i + 1] + '-10', bank: 'KHAN01' });
  });

  ERP.data.sources = src;
})();
