// Where the data lives: app.py's /api/data when served from the PC ("server"),
// otherwise this device's browser storage ("local", e.g. the installed phone app).
const Store = (() => {
  const LS_DB = 'fund-db', LS_BACKUP = 'fund-last-backup';
  let mode = null;

  const empty = () => ({version: 1, debts: [], savings: {opening: 0}, months: []});
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  async function detect() {
    if (mode) return mode;
    try {
      const r = await fetch('api/data', {cache: 'no-store'});
      if (r.ok && (r.headers.get('Content-Type') || '').includes('json')) return mode = 'server';
    } catch (e) {}
    return mode = 'local';
  }

  // same rules as validate() in app.py
  function validate(db) {
    if (!db || !Array.isArray(db.months) || !Array.isArray(db.debts)) throw new Error('ไม่ใช่ไฟล์ข้อมูลกองทุน');
    for (const m of db.months) {
      if (!/^\d{4}-\d{2}$/.test(m.key || '')) throw new Error('key เดือนไม่ถูกต้อง');
      for (const sec of ['income', 'fund', 'personal'])
        for (const it of m[sec] || []) if (typeof it.amount !== 'number') throw new Error('จำนวนเงินไม่ถูกต้อง: ' + it.name);
    }
    return db;
  }

  async function load() {
    if (await detect() === 'server') {
      const r = await fetch('api/data', {cache: 'no-store'});
      if (!r.ok) throw new Error('โหลดข้อมูลไม่ได้ (' + r.status + ')');
      return r.json();
    }
    const raw = get(LS_DB);
    return raw ? JSON.parse(raw) : null;
  }

  async function save(db) {
    validate(db);
    if (await detect() === 'server') {
      const r = await fetch('api/data', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(db)});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      return;
    }
    try { localStorage.setItem(LS_DB, JSON.stringify(db)); }
    catch (e) { throw new Error('เครื่องไม่ยอมให้บันทึก (' + e.name + ')'); }
  }

  // ask Chrome not to clear our data when storage runs low
  async function persist() {
    try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; }
    catch (e) { return false; }
  }

  async function backup(db) {
    const d = new Date(), stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const name = `กองทุน-สำรอง-${stamp}.json`;
    const blob = new Blob([JSON.stringify(db, null, 1)], {type: 'application/json'});
    const file = new File([blob], name, {type: 'application/json'});
    if (navigator.canShare && navigator.canShare({files: [file]}) && matchMedia('(pointer:coarse)').matches) {
      await navigator.share({files: [file], title: name});
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }
    try { localStorage.setItem(LS_BACKUP, String(Date.now())); } catch (e) {}
    return name;
  }

  async function readBackup(file) {
    let db;
    try { db = JSON.parse(await file.text()); } catch (e) { throw new Error('อ่านไฟล์ไม่ได้ ต้องเป็นไฟล์ .json ที่สำรองจากแอปนี้'); }
    return validate(db);
  }

  const lastBackup = () => { const t = +get(LS_BACKUP); return t ? new Date(t) : null; };

  return {detect, load, save, persist, backup, readBackup, lastBackup, empty, validate, get mode() { return mode; }};
})();
