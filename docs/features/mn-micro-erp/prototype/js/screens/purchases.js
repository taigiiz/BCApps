/* =============================================================================
   js/screens/purchases.js — #purchase-invoices (S-PUR-05 list + S-PUR-09 ДДТД confirmation, read-mostly).
   Owned by the foundation build; a later purchases builder may extend it (draft editor, credit memo).
   ========================================================================== */
(function () {
  'use strict';
  var ERP = window.ERP, ui = ERP.ui, app = ERP.app;

  function render(el, ctx) {
    var E = ERP.engine;
    var list = E.purchases.list().slice().reverse();
    var S = E.state();
    var unc = E.vat.unconfirmedInput();
    var html = '<div class="page-head"><div class="title-wrap"><h1>Худалдан авалтын нэхэмжлэх</h1></div><span class="small muted">' + list.length + ' батлагдсан баримт</span></div>';
    if (unc.length) {
      html += '<div class="banner warn" data-note="purch.unconfirmed">' + unc.length + ' баримтын орцын НӨАТ (' + E.money.fmt(unc.reduce(function (s, e) { return s + e.amount; }, 0), { sym: true }) +
        ') баталгаажаагүй тул НӨАТ-ын тайланд хасагдахгүй (D-E4). Нийлүүлэгчийн eBarimt ДДТД-ийг бүртгээд баталгаажуулна уу.</div>';
    }
    html += '<div class="card" data-note="purch.list"><div class="table-wrap"><table class="grid-table"><thead><tr><th>Дугаар</th><th>Огноо</th><th>Нийлүүлэгч</th><th>Нийлүүлэгчийн №</th><th>ДДТД</th><th class="num">Дүн</th><th class="num">НӨАТ</th><th class="num">Нийт</th><th class="num">Үлдэгдэл</th><th>Орцын НӨАТ</th><th>Төлөх огноо</th></tr></thead><tbody>' +
      list.map(function (p) {
        var vle = S.vle.filter(function (e) { return e.entryNo === p.vleEntryNo; })[0];
        var overdue = vle.open && vle.dueDate < ERP.data.meta.today;
        return '<tr><td class="code">' + p.no + '</td><td>' + ui.date(p.postingDate) + '</td><td>' + ui.esc(p.vendorName) + '</td><td class="code">' + ui.esc(p.vendorInvoiceNo) + '</td>' +
          '<td class="code" title="' + ui.esc(p.ddtd || '') + '">' + (p.ddtd ? '…' + p.ddtd.slice(-6) : '<span class="muted">бүртгээгүй</span>') + '</td>' +
          ui.moneyCell(p.amount) + ui.moneyCell(p.vatAmount) + ui.moneyCell(p.amountInclVat) + ui.moneyCell(-vle.remaining, { blankZero: true }) +
          '<td>' + (p.deductibleConfirmed ? ui.pill('OK', 'Баталгаажсан') : '<button class="btn sm" type="button" data-confirm="' + p.no + '" id="pc-' + p.no + '">Баталгаажуулах</button>') + '</td>' +
          '<td>' + ui.date(p.dueDate) + (overdue ? ' ' + ui.pill('OVERDUE') : '') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
    html += ui.calc('Тооцоог харах: худалдан авалтын posting', (function () {
      var p = list[0];
      if (!p) return '';
      var gl = S.glEntries.filter(function (e) { return e.transactionNo === p.transactionNo; });
      return '<p>Жишээ: ' + p.no + ' (' + ui.esc(p.vendorName) + '). Үнэ НӨАТ-гүй; НӨАТ = rv(суурь × 10 / 100). Зардал/бараа Дт, орцын НӨАТ 1300 Дт, өглөг 2100 Кт (07, BR-TAX-28).</p><div class="formula">' +
        gl.map(function (e) { return (e.amount > 0 ? 'Дт ' : 'Кт ') + e.account + '  ' + E.money.fmt(Math.abs(e.amount)).padStart(16, ' ') + '  ' + E.setup.account(e.account).name; }).join('\n') + '</div>' +
        '<p>VAT entry: deductible_confirmed = ' + (p.deductibleConfirmed ? 'true (ДДТД ' + (p.ddtd ? '…' + p.ddtd.slice(-6) : '') + ')' : 'false') + '. Зөвхөн баталгаажсан нь ТТ-03а-гийн 7, 8-р мөрөнд орно.</p>';
    })());
    el.innerHTML = html;
    ui.$$('[data-confirm]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var no = b.getAttribute('data-confirm');
        var p = E.purchases.list().filter(function (x) { return x.no === no; })[0];
        var m = ui.modal({ title: 'Орцын НӨАТ баталгаажуулах — ' + no,
          body: '<form id="pc-form" class="stack"><p>' + ui.esc(p.vendorName) + ' · НӨАТ ' + E.money.fmt(p.vatAmount, { sym: true }) + '</p><div class="field"><label for="pc-ddtd">Нийлүүлэгчийн eBarimt ДДТД (33 орон)</label><input class="input mono" id="pc-ddtd" inputmode="numeric" maxlength="33" value="' + ui.esc(p.ddtd || '') + '"></div><div id="pc-err"></div><p class="xs muted">BR-TAX-47/49: ДДТД 33 оронтой; баталгаажсан entry дараагийн нээлттэй НӨАТ-ын тайланд хасагдана.</p></form>',
          footer: [{ label: 'Болих' }, { label: 'Баталгаажуулах', kind: 'primary', onClick: function (close) {
            var v = ui.$('#pc-ddtd', m.el).value.replace(/\D/g, '');
            var r = E.purchases.confirmInputVat(no, v);
            if (!r.ok) { ui.$('#pc-err', m.el).innerHTML = ui.errList(r.errors, 'Баталгаажуулж чадсангүй'); return; }
            close(true); ui.toast('Орцын НӨАТ баталгаажлаа: ' + no); app.refresh();
          } }] });
        ui.$('#pc-form', m.el).addEventListener('submit', function (ev) { ev.preventDefault(); });
      });
    });
  }

  app.registerScreen({
    route: 'purchase-invoices', title: 'Худалдан авалтын нэхэмжлэх', crumbs: [['Худалдан авалт'], ['Нэхэмжлэх']], owner: 'js/screens/purchases.js',
    intro: ['Батлагдсан худалдан авалтын нэхэмжлэх, өглөгийн үлдэгдэл, нийлүүлэгчийн eBarimt ДДТД. Нягтлан орцын НӨАТ-ыг энд баталгаажуулна.',
      'Орцын НӨАТ зөвхөн нийлүүлэгчийн ДДТД бүртгэгдэж баталгаажсан үед НӨАТ-ын тайланд хасагдана (D-E4). Ноорог засварлагчийг дараагийн шатанд нэмнэ.'],
    render: render
  });
})();
