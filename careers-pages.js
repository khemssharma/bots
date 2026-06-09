/* =============================================================================
 *  Careers-Page Opener  —  paste-into-console edition
 *  Opens the official careers portals of the 50 biggest IT companies in India,
 *  in small batches, so you can apply on each company's own site.
 *
 *  HOW TO USE
 *  ----------
 *  1. Open any normal browser tab (the page you're on doesn't matter).
 *  2. Open DevTools console (Windows: Ctrl+Shift+J, Mac: Cmd+Option+J).
 *  3. Paste this whole file and press Enter. A small panel appears.
 *  4. Click "Open next 10". Apply on those tabs, come back, repeat.
 *     (Opening in batches avoids overwhelming the browser and the pop-up
 *      blocker. If a batch is blocked, allow pop-ups for this site and retry.)
 *
 *  This only OPENS the portals. You review the roles and apply yourself —
 *  each company uses its own login + application form, by design.
 * ========================================================================== */

(() => {
  if (window.__careersOpenerLoaded) { alert('Careers Opener already open.'); return; }
  window.__careersOpenerLoaded = true;

  const COMPANIES = [
    ['Tata Consultancy Services', 'https://www.tcs.com/careers'],
    ['Infosys', 'https://www.infosys.com/careers/'],
    ['HCLTech', 'https://www.hcltech.com/careers'],
    ['Wipro', 'https://careers.wipro.com/'],
    ['Tech Mahindra', 'https://careers.techmahindra.com/'],
    ['LTIMindtree', 'https://www.ltimindtree.com/careers/'],
    ['Persistent Systems', 'https://www.persistent.com/careers/'],
    ['Coforge', 'https://www.coforge.com/careers'],
    ['Mphasis', 'https://careers.mphasis.com/'],
    ['Oracle Financial Services', 'https://www.oracle.com/in/corporate/careers/'],
    ['L&T Technology Services', 'https://www.ltts.com/careers'],
    ['Birlasoft', 'https://www.birlasoft.com/careers'],
    ['Hexaware', 'https://hexaware.com/careers/'],
    ['Zensar', 'https://www.zensar.com/careers'],
    ['Cyient', 'https://www.cyient.com/careers'],
    ['KPIT Technologies', 'https://www.kpit.com/careers/'],
    ['Sonata Software', 'https://www.sonata-software.com/careers'],
    ['Mastek', 'https://www.mastek.com/careers'],
    ['Tata Elxsi', 'https://www.tataelxsi.com/careers'],
    ['Tata Technologies', 'https://www.tatatechnologies.com/careers/'],
    ['Happiest Minds', 'https://www.happiestminds.com/careers/'],
    ['Newgen Software', 'https://newgensoft.com/company/careers/'],
    ['Intellect Design Arena', 'https://www.intellectdesign.com/careers/'],
    ['Firstsource', 'https://www.firstsource.com/careers/'],
    ['eClerx', 'https://eclerx.com/careers/'],
    ['Nucleus Software', 'https://www.nucleussoftware.com/careers'],
    ['Zoho', 'https://www.zoho.com/careers/'],
    ['Freshworks', 'https://www.freshworks.com/company/careers/'],
    ['Route Mobile', 'https://routemobile.com/careers/'],
    ['Tanla Platforms', 'https://www.tanla.com/careers'],
    ['Quick Heal / Seqrite', 'https://www.quickheal.co.in/careers'],
    ['RateGain', 'https://rategain.com/careers/'],
    ['LatentView Analytics', 'https://www.latentview.com/careers/'],
    ['Affle India', 'https://www.affle.com/careers'],
    ['Accenture (India)', 'https://www.accenture.com/in-en/careers'],
    ['Cognizant', 'https://careers.cognizant.com/global/en'],
    ['Capgemini', 'https://www.capgemini.com/careers/'],
    ['IBM', 'https://www.ibm.com/careers/'],
    ['DXC Technology', 'https://careers.dxc.com/'],
    ['NTT DATA', 'https://careers.nttdata.com/'],
    ['Genpact', 'https://www.genpact.com/careers'],
    ['Microsoft', 'https://careers.microsoft.com/'],
    ['Amazon (India)', 'https://www.amazon.jobs/en/locations/india'],
    ['Google', 'https://www.google.com/about/careers/applications/'],
    ['Oracle', 'https://www.oracle.com/in/corporate/careers/'],
    ['SAP Labs India', 'https://jobs.sap.com/'],
    ['Deloitte India', 'https://www2.deloitte.com/in/en/careers.html'],
    ['Cisco', 'https://jobs.cisco.com/'],
    ['Adobe', 'https://careers.adobe.com/'],
    ['Salesforce', 'https://careers.salesforce.com/'],
  ];
  const BATCH = 10;
  let idx = 0;

  const css = (el, o) => Object.assign(el.style, o);
  const panel = document.createElement('div');
  css(panel, { position: 'fixed', right: '18px', bottom: '18px', width: '300px',
    background: '#10243e', color: '#eef3f8', zIndex: 2147483647, borderRadius: '14px',
    border: '1px solid #23456b', boxShadow: '0 16px 40px rgba(0,0,0,.5)', padding: '14px',
    font: '13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif' });

  const h = document.createElement('div');
  h.textContent = 'Careers Opener · 50 IT companies';
  css(h, { fontWeight: 700, marginBottom: '8px' });

  const info = document.createElement('div');
  css(info, { color: '#9fb3c8', fontSize: '12px', marginBottom: '10px' });

  const btn = (label) => {
    const b = document.createElement('button'); b.textContent = label;
    css(b, { border: 'none', borderRadius: '999px', padding: '9px 12px', fontWeight: 700,
      cursor: 'pointer', background: '#2557a7', color: '#fff', width: '100%', marginBottom: '8px' });
    return b;
  };
  const openBtn = btn('Open next 10');
  const resetBtn = btn('Reset to start');
  css(resetBtn, { background: '#1d3c5f' });
  const closeBtn = btn('Close');
  css(closeBtn, { background: 'transparent', color: '#9fb3c8', marginBottom: 0 });

  function refresh() {
    const remaining = COMPANIES.length - idx;
    info.textContent = remaining > 0
      ? `${idx} opened · ${remaining} remaining. Next: ${COMPANIES[idx][0]}…`
      : 'All 50 opened. Use Reset to go through them again.';
    openBtn.style.opacity = remaining > 0 ? '1' : '0.5';
  }

  openBtn.addEventListener('click', () => {
    const slice = COMPANIES.slice(idx, idx + BATCH);
    if (!slice.length) return;
    let blocked = 0;
    slice.forEach(([, url]) => { if (!window.open(url, '_blank')) blocked++; });
    idx += slice.length; refresh();
    if (blocked) alert(`${blocked} tab(s) were blocked by the pop-up blocker.\n`
      + `Allow pop-ups for ${location.host}, then continue.`);
  });
  resetBtn.addEventListener('click', () => { idx = 0; refresh(); });
  closeBtn.addEventListener('click', () => { panel.remove(); window.__careersOpenerLoaded = false; });

  panel.append(h, info, openBtn, resetBtn, closeBtn);
  document.body.appendChild(panel);
  refresh();
})();
