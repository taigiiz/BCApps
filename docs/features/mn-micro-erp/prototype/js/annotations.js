/* =============================================================================
   js/annotations.js — window.ERP.notes: the explanation ("Тайлбар") framework + shell notes.

   A note explains one UI element. Elements opt in with data-note="<id>"; app.js puts numbered hotspot
   markers on them while explanation mode is on and opens the right-hand panel on click.

   Note shape (all text in Mongolian):
     {
       title: 'Гарчиг',
       what:  'Юу хийдэг вэ — plain language for a business owner',
       why:   'Яагаад — business / legal reason',
       bc:    'BC-д — the Business Central object it mirrors (e.g. Table 17 G/L Entry)',
       rules: ['BR-SAL-22', 'D-E3', 'FR-TAX-004'],        // rule ids from the specs
       data:  ['gl.gl_entry.amount', ...],                  // db tables / columns (db/schema)
       doc:   [{ file: '06-sales-receivables.md', section: '6.3 НӨАТ — үнэ НӨАТ-гүй (`prices_including_vat = false`)' }]
     }
   doc.section must be the exact heading text (without the leading #'s); the link anchor is computed with the
   GitHub slug rules, and tests/engine_check.js verifies that every heading exists.

   Registration (per screen, from js/notes/<area>.js):
     ERP.notes.register('sales', 'Борлуулалтын нэхэмжлэх', { 'sales.customer': {...}, ... });
   ========================================================================== */
(function () {
  'use strict';
  var ERP = (window.ERP = window.ERP || {});
  var items = {};        // id → note
  var screens = [];      // [{ screen, title, ids: [] }]

  function slug(text) {                      // GitHub heading anchor
    var t = String(text)
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')  // [label](link) → label
      .replace(/`/g, '')
      .trim()
      .toLowerCase();
    t = t.replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, '');
    return t.replace(/ /g, '-');
  }
  function link(doc) {
    var base = doc.file.indexOf('db/') === 0 || doc.file.indexOf('adr/') === 0 ? '../' + doc.file : '../' + doc.file;
    return base + (doc.section ? '#' + slug(doc.section) : '');
  }

  ERP.notes = {
    register: function (screen, title, notes) {
      var s = screens.filter(function (x) { return x.screen === screen; })[0];
      if (!s) { s = { screen: screen, title: title, ids: [] }; screens.push(s); }
      Object.keys(notes).forEach(function (id) {
        var n = notes[id];
        n.id = id; n.screen = screen;
        n.rules = n.rules || []; n.data = n.data || [];
        n.doc = n.doc ? (Array.isArray(n.doc) ? n.doc : [n.doc]) : [];
        items[id] = n;
        if (s.ids.indexOf(id) < 0) s.ids.push(id);
      });
    },
    get: function (id) { return items[id] || null; },
    all: function () { return Object.keys(items).map(function (k) { return items[k]; }); },
    byScreen: function () { return screens.map(function (s) { return { screen: s.screen, title: s.title, notes: s.ids.map(function (i) { return items[i]; }) }; }); },
    slug: slug,
    link: link
  };

  // ---------------------------------------------------------------------------
  // Shell notes (top bar, navigation, prototype pages)
  // ---------------------------------------------------------------------------
  ERP.notes.register('shell', 'Програмын хүрээ (бүх дэлгэц)', {
    'shell.sample': {
      title: 'Жишээ өгөгдөл',
      what: 'Энэ прототипийн компани, харилцагч, дүн бүгд зохиомол. ТТД нь "000…" гэж эхэлдэг тул бодит байгууллагатай давхцахгүй. Гэхдээ дансны төлөвлөгөө, posting-ийн тохиргоо, НӨАТ-ын матриц, дугаарын цуврал, Маягт А-гийн мөрүүд нь системийн MN seed-ээс шууд хуулагдсан.',
      why: 'Хөгжүүлэгч, нягтлан, бизнес эзэн гурвуулаа ижил жишээн дээр ярилцаж, тооцоо зөв эсэхийг шалгах боломжтой. Бодит өгөгдөл ашиглахгүй тул хувийн мэдээлэл задрахгүй.',
      bc: 'BC-ийн CRONUS демо компани (Company.IsDemo / "ТУРШИЛТ" badge) -тай адил санаа.',
      rules: ['UX-NAV-04', 'D-A1'],
      data: ['platform.company.is_demo', 'db/seed/mn_*.sql'],
      doc: [{ file: 'db/seed/README.md', section: '3.2 Дансны жагсаалт' }, { file: '15-ui-ux.md', section: '2.2 Навигацийн дүрэм' }]
    },
    'shell.notes-toggle': {
      title: 'Тайлбарын горим',
      what: 'Асаалттай үед дэлгэцийн чухал хэсэг бүрд дугаартай шар тэмдэг гарна. Тэмдэг эсвэл хэсгийг дарахад баруун талд тайлбар нээгдэнэ: юу хийдэг, яагаад, Business Central-ийн аль объектыг дуурайдаг, ямар дүрэм, ямар хүснэгт, ямар баримтын хэсэг.',
      why: 'Прототипийг үзсэн хүн дэлгэц бүрийн цаадах нягтлан бодох логикийг хөгжүүлэлтийн баримттай шууд холбож ойлгох шаардлагатай.',
      bc: 'BC-д байхгүй. Ойролцоо нь tooltip ба "Learn more" холбоос.',
      rules: ['UXP-03'],
      data: [],
      doc: [{ file: '15-ui-ux.md', section: '1.2 UX зарчим' }]
    },
    'shell.role': {
      title: 'Хэрэглэгчийн үүрэг (role)',
      what: 'Эзэн ба Нягтлан хоёрын нүүр хуудас өөр: эзэн мөнгө, авлага, татварын эрсдэлийг хардаг бол нягтлан хийх ажлын жагсаалт (ноорог, тулгалт, eBarimt алдаа, хаалт)-ыг хардаг.',
      why: 'BC-ийн Role Center нь эрх биш, зөвхөн харагдац. Эрхийг сервер шалгана; энд үүрэг солих нь зөвхөн нүүрийн хувилбарыг солино.',
      bc: 'Profile / Role Center (Page 9022 Business Manager RC, Page 9027 Accountant RC).',
      rules: ['UX-HOME-01', 'D-I2', 'FR-PLT-005'],
      data: ['platform.user_company_role', 'platform.role'],
      doc: [{ file: '15-ui-ux.md', section: '3.1 Нүүр хуудсын хувилбар сонгох' }, { file: '13-security-audit-tenancy.md', section: '6.5 Built-in role (тенант бүрд provisioning-ээр, `is_builtin = true`)' }]
    },
    'shell.nav': {
      title: 'Цэсийн мод',
      what: 'Цэс нь баримтаар эхэлнэ: Борлуулалт, Худалдан авалт, Мөнгө, eBarimt; дараа нь Санхүү, Татвар, Хаалт, Тайлан. "Удахгүй" тэмдэгтэй хэсгийг прототипийн дараагийн шатанд бүтээнэ.',
      why: 'Бичил бизнесийн хэрэглэгч ихэвчлэн баримт (нэхэмжлэх, кассын баримт) бичдэг; гар журнал нь нягтлангийн хэрэгсэл тул доор байрлана.',
      bc: 'Role Center-ийн navigation menu (Sales, Purchasing, Cash Management, Finance).',
      rules: ['UXP-01', 'UX-NAV-05', 'UX-NAV-06'],
      data: [],
      doc: [{ file: '15-ui-ux.md', section: '2.3 Цэсийн мод (монгол)' }]
    },
    'checks.list': {
      title: 'Хөдөлгүүрийн инвариант',
      what: 'Энэ хуудас дэлгэц нээгдэх бүрд бүх ledger-ийг дахин шалгана: гүйлгээ бүр тэнцсэн эсэх, авлага/өглөг/банкны дэд дэвтэр хяналтын данстайгаа тэнцэх эсэх, НӨАТ-ын тайлан VAT entry-тэй, баланс тэнцэх эсэх гэх мэт. Шинэ нэхэмжлэх батлаад энд ирэхэд шалгалт дахин ажиллана.',
      why: 'Бодит системд эдгээрийг DB-ийн trigger, CHECK ба шөнийн бүрэн бүтэн байдлын шалгалт хангана. Прототипт ижил дүрмийг JavaScript-ээр давтаж, тооцоолол зөв болохыг нотолно.',
      bc: 'CU12 Gen. Jnl.-Post Line-ийн тэнцлийн шалгалт, Report 6 Trial Balance, "G/L - Receivables" тулгалт.',
      rules: ['INV-01', 'INV-04', 'INV-08', 'INV-11', 'INV-15', 'INV-19', 'D-C5', 'FR-GL-028'],
      data: ['gl.gl_entry', 'party.v_receivables_reconciliation', 'tax.vat_entry'],
      doc: [{ file: '03-domain-model.md', section: '5. Гол инвариантууд (invariants)' }]
    },
    'notes.list': {
      title: 'Тайлбарын жагсаалт',
      what: 'Прототип дахь бүх тайлбарыг дэлгэцээр нь бүлэглэж харуулна. Мөр бүрээс тухайн дэлгэц рүү шилжиж, баримтын хэсэг рүү холбоосоор орно.',
      why: 'Баримт бичигтэй уялдааг (traceability) нэг дороос хянах боломж.',
      bc: '—',
      rules: [],
      data: [],
      doc: [{ file: '15-ui-ux.md', section: '15. Дэлгэцийн жагсаалт (screen inventory)' }]
    }
  });
})();
