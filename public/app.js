// Minimal SPA for ferry search -> results -> details -> passengers -> payment

const state = {
  search: {
    direction: 'oneway',
    supplierId: 'ALL',
    departPort: 'CAEN',
    arrivePort: 'PORS',
    departDate: new Date().toISOString().slice(0,10).replace(/-/g,''),
    departTime: '',
    returnDate: '',
    returnTime: '',
    adults: 1,
    children: 0,
    childrenAges: [],
    pets: 0,
    vehicles: 0,
    vehicleDetail: { type:'', make:'', model:'', plate:'', caravan:'' },
    method: '',
  },
  fees: null,
  cabins: [],
  methods: [],
  routes: { list: [], byFrom: {} },
  results: [],
  selection: null, // selected sailing
  chosenCabins: [],
  seatsCount: 0,
  passengers: [],
  vehicleInfo: null,
  contactEmail: '',
  insuranceChoice: null, // 'yes' | 'no'
  payment: { method: 'card' },
};

const $ = (sel) => document.querySelector(sel);
const API_BASE = (location.port === '3000') ? '' : 'http://localhost:3000';
const app = document.getElementById('app');

function fmtDateInput(yyyymmdd){
  if(!yyyymmdd) return '';
  return `${yyyymmdd.slice(0,4)}-${yyyymmdd.slice(4,6)}-${yyyymmdd.slice(6,8)}`;
}
function fmtMoney(v,c='EUR'){ return new Intl.NumberFormat(undefined,{style:'currency',currency:c}).format(v); }

async function loadRefs(){
  const fees = await fetch(`${API_BASE}/api/fees`).then(r=>r.json()).catch(()=>({fees:{}}));
  const cabins = await fetch(`${API_BASE}/api/cabins`).then(r=>r.json()).catch(()=>({cabins:[]}));
  state.fees = fees.fees||{};
  state.cabins = cabins.cabins||[];
}

async function loadMethods(supplierId){
  if(!supplierId || supplierId==='ALL') { state.methods=[]; return; }
  try {
    const res = await fetch(`${API_BASE}/api/methods/${supplierId}`).then(r=>r.json());
    state.methods = res.methods||[];
  } catch { state.methods=[]; }
}

async function doSearch(){
  const q = new URLSearchParams({
    supplierId: state.search.supplierId,
    departPort: state.search.departPort,
    arrivePort: state.search.arrivePort,
    departDate: state.search.departDate,
    adults: String(state.search.adults||0),
    children: String(state.search.children||0),
    childrenAges: (state.search.childrenAges||[]).join(','),
    pets: String(state.search.pets||0),
    vehicles: String(state.search.vehicles||0),
    method: state.search.method||'',
  });
  const data = await fetch(`${API_BASE}/api/search?${q.toString()}`).then(r=>r.json());
  let results = Array.isArray(data.results) ? data.results : [];
  const pref = (state.search.departTime||'').trim();
  if (pref) {
    results = results.filter(r => {
      const t = String(r?.departTime||'');
      const hhmm = t.includes('T') ? t.slice(11,16) : '';
      return !hhmm || hhmm >= pref;
    });
  }
  state.results = results;
}

async function loadRoutes(){
  try {
    const data = await fetch(`${API_BASE}/api/routes`).then(r=>r.json());
    const routes = Array.isArray(data.routes)?data.routes:[];
    const byFrom = {};
    routes.forEach(r=>{
      byFrom[r.departPort] = byFrom[r.departPort] || new Set();
      byFrom[r.departPort].add(r.arrivePort);
    });
    Object.keys(byFrom).forEach(k=>byFrom[k]=Array.from(byFrom[k]).sort());
    state.routes = { list: routes, byFrom };
  } catch { state.routes = { list: [], byFrom: {} }; }
}

function render(){
  const route = location.hash.slice(1) || 'search';
  if(route === 'search') return renderSearchUX();
  if(route === 'results') return renderResults();
  if(route === 'details') return renderDetails();
  if(route === 'passengers') return renderPassengers();
  if(route === 'payment') return renderPayment();
  renderSearch();
}

// header/footer removed per request

function renderSearch(){
  const routeValue = `${state.search.departPort}__${state.search.arrivePort}`;
  // Build route options including reverse directions for convenience
  const pairsSet = new Set();
  (state.routes.list||[]).forEach(r=>{
    if (r && r.departPort && r.arrivePort) {
      pairsSet.add(`${r.departPort}__${r.arrivePort}`);
      pairsSet.add(`${r.arrivePort}__${r.departPort}`);
    }
  });
  const routeOptions = Array.from(pairsSet).sort((a,b)=>a.localeCompare(b));
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header"><h2>Rechercher des billets de ferry</h2><span class="muted">Démo</span></div>
        <div class="tabs">
          <input type="radio" id="oneWay" name="tripType" value="oneway" ${state.search.direction === 'oneway' ? 'checked' : ''}>
          <label for="oneWay">Aller simple</label>

          <input type="radio" id="return" name="tripType" value="return" ${state.search.direction === 'return' ? 'checked' : ''}>
          <label for="return">Aller-retour</label>
        </div>
        <div class="row">
          <div class="col"><label>Route</label>
            <select id="routePair">
              ${routeOptions.map(val=>{
                const [from,to] = val.split('__');
                const lbl = `${from} -> ${to}`;
                const sel = val===routeValue? 'selected' : '';
                return `<option value="${val}" ${sel}>${lbl}</option>`;
              }).join('')}
            </select>
            <button id="swapRoute" class="secondary" style="margin-left:6px">Échanger</button>
          </div>
          <div class="col"><label>Date de départ</label><input type="date" id="departDate" value="${fmtDateInput(state.search.departDate)}" /></div>
          <div class="col"><label>Heure préférée</label><input type="time" id="departTime" value="${state.search.departTime||''}"/></div>
          <div class="col ${state.search.direction==='return'?'':'muted'}"><label>Date de retour</label><input type="date" id="returnDate" ${state.search.direction==='return'?'':'disabled'} value="${fmtDateInput(state.search.returnDate)}"/></div>
        </div>
        <div class="row">
          <div class="col"><label>Adultes</label><input type="number" min="0" id="adults" value="${state.search.adults}"/></div>
          <div class="col"><label>Enfants</label><input type="number" min="0" id="children" value="${state.search.children}"/></div>
          <div class="col"><label>Animaux</label><input type="number" min="0" id="pets" value="${state.search.pets}"/></div>
          <div class="col"><label>Véhicules</label><input type="number" min="0" id="vehicles" value="${state.search.vehicles}"/></div>
        </div>
        ${(state.search.children>0?`
          <div class=\"row\">
            <div class=\"col\"><label>Âges des enfants (chacun)</label>
              <div class=\"row\" id=\"childAges\">
                ${Array.from({length:state.search.children}).map((_,i)=>{
                  const val = state.search.childrenAges[i] ?? '';
                  return `<div class=\"col\"><input type=\"number\" min=\"0\" max=\"17\" data-age-index=\"${i}\" value=\"${val}\" placeholder=\"Âge #${i+1}\"/></div>`;
                }).join('')}
              </div>
            </div>
          </div>
        `:'')}
        <div class="spacer"></div>
        <button id="searchBtn">Rechercher des traversées</button>
      </div>
    </div>
  `;

  app.querySelectorAll('.tabs input').forEach(btn=>{
    btn.addEventListener('change',()=>{
      state.search.direction = btn.value;
      renderSearch();
    });
  });
  $('#searchBtn').addEventListener('click', async ()=>{
    const rp = $('#routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = from;
      state.search.arrivePort = to;
    }
    state.search.departDate = ($('#departDate').value||'').replace(/-/g,'');
    state.search.returnDate = ($('#returnDate')?.value||'').replace(/-/g,'');
    state.search.departTime = ($('#departTime')?.value||'').trim();
    state.search.adults = Number($('#adults').value)||0;
    state.search.children = Number($('#children').value)||0;
    if (state.search.children>0) {
      state.search.childrenAges = Array.from(document.querySelectorAll('[data-age-index]')).map(inp=>Number(inp.value)||0);
    } else {
      state.search.childrenAges = [];
    }
    state.search.pets = Number($('#pets').value)||0;
    state.search.vehicles = Number($('#vehicles').value)||0;
    state.search.method = '';
    // Always search across all companies unless a sample preset was chosen later
    state.search.supplierId = 'ALL';
    await doSearch();
    location.hash = 'results';
  });
  $('#routePair').addEventListener('change', ()=>{
    const rp = $('#routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = from;
      state.search.arrivePort = to;
    }
  });
  $('#swapRoute').addEventListener('click', ()=>{
    const rp = $('#routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = to;
      state.search.arrivePort = from;
      renderSearch();
    }
  });
}

function renderResults(){
  const currency = (state.fees&&state.fees.currency)||'EUR';
  const emptyTip = state.results.length === 0 ? `
      <div class="card">
        <div class="header"><strong>Aucune traversée trouvée</strong></div>
        <div class="muted">Astuces :</div>
        <ul class="muted">
          <li>Essayez BFT de CAEN à PORS le 2025-10-20</li>
          <li>Ou POT de DOVER à CALAIS le 2025-10-21</li>
        </ul>
        <div class="spacer"></div>
        <button class="secondary" id="sample1">Utiliser BFT CAENâ†’PORS 2025-10-20</button>
        <button class="secondary" id="sample2" style="margin-left:6px">Utiliser POT DOVERâ†’CALAIS 2025-10-21</button>
      </div>
  ` : '';

  // derive badges (best price)
  const minPrice = state.results.length ? Math.min(...state.results.map(r=>Number(r.price?.total||0))) : null;
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header">
          <div>
            <strong>${state.search.departPort} â†’ ${state.search.arrivePort}</strong>
            <div class="muted">${fmtDateInput(state.search.departDate)}</div>
          </div>
          <div>
            <button class="secondary" id="changeSearch">Modifier la recherche</button>
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Trier par</label>
            <select id="sortBy">
              <option value="best">Meilleure correspondance</option>
              <option value="price">Prix</option>
              <option value="depart">Heure de départ</option>
            </select>
          </div>
          <div class="col"><label>Filtrer par compagnie</label>
            <select id="filterCo"></select>
          </div>
        </div>
      </div>
      ${emptyTip}
      <div class="list">
        ${state.results.map((r,i)=>{
          const isBest = (minPrice!==null) && Number(r.price?.total||0)===minPrice;
          return `
          <div class="card result">
            <div>
              <div><strong>${r.departPort} â†’ ${r.arrivePort}</strong> <span class="chip">${r.supplierId}</span>${isBest?'<span class="badge best">Meilleur prix</span>':''}</div>
              <div class="muted">${r.departTime} â†’ ${r.arriveTime} â€¢ ${r.vessel||'â€”'}</div>
            </div>
            <div>
              <div class="price">${fmtMoney(r.price?.total||0,currency)}</div>
              <button data-i="${i}" class="choose">Choisir</button>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;
  // Build company filter options from current results
  const coSel = $('#filterCo');
  if (coSel) {
    const uniqCos = Array.from(new Set(state.results.map(r=>r.supplierId))).sort();
    coSel.innerHTML = ['<option value="">Toutes</option>'].concat(uniqCos.map(c=>`<option value="${c}">${c}</option>`)).join('');
  }
  $('#changeSearch').addEventListener('click',()=>{ location.hash='search'; });
  if ($('#sample1')) {
    $('#sample1').addEventListener('click', async ()=>{
      state.search = { ...state.search, supplierId:'BFT', departPort:'CAEN', arrivePort:'PORS', departDate:'20251020' };
      await doSearch();
      renderResults();
    });
  }
  if ($('#sample2')) {
    $('#sample2').addEventListener('click', async ()=>{
      state.search = { ...state.search, supplierId:'POT', departPort:'DOVER', arrivePort:'CALAIS', departDate:'20251021' };
      await doSearch();
      renderResults();
    });
  }
  document.querySelectorAll('button.choose').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.selection = state.results[Number(btn.dataset.i)];
      location.hash = 'details';
    });
  });
  $('#sortBy').addEventListener('change', e=>{
    const v = e.target.value;
    if(v==='price') state.results.sort((a,b)=>(a.price.total)-(b.price.total));
    else if(v==='depart') state.results.sort((a,b)=>String(a.departTime).localeCompare(String(b.departTime)));
    else state.results.sort((a,b)=>0);
    renderResults();
  });
  $('#filterCo').addEventListener('change', e=>{
    const v = e.target.value;
    // Keep a backup to restore when selecting All
    if (!state._resultsBackup) state._resultsBackup = state.results.slice();
    if (v) {
      state.results = state._resultsBackup.filter(r=>r.supplierId===v);
    } else {
      state.results = state._resultsBackup.slice();
    }
    renderResults();
  });
}

function computeTotal(){
  const fees = state.fees||{};
  const base = (state.selection?.price?.total)||0;
  const cabinsCost = (state.chosenCabins||[]).reduce((sum,c)=>sum + (Number(c.price)||0),0);
  const seatsCost = (Number(state.seatsCount)||0) * Number(fees.seat||15);
  const insuranceCost = state.insuranceChoice==='yes' ? Number(fees.insurance||10) : 0;
  return { currency: fees.currency||'EUR', total: base + cabinsCost + seatsCost + insuranceCost };
}

function renderDetails(){
  const currency = (state.fees&&state.fees.currency)||'EUR';
  const total = computeTotal();
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header">
          <h3>Détails du billet</h3>
          <button class="secondary" id="back">Retour</button>
        </div>
        <div class="stack">
          <div><strong>${state.selection.departPort} â†’ ${state.selection.arrivePort}</strong> <span class="chip">${state.selection.supplierId}</span></div>
          <div class="muted">${state.selection.departTime} â†’ ${state.selection.arriveTime} â€¢ ${state.selection.vessel||'â€”'}</div>
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Ajouter des cabines</strong><span class="muted">optionnel</span></div>
        <div class="row">
          ${state.cabins.map((c,i)=>`
            <div class="col">
              <div class="card">
                <div><strong>${c.label}</strong></div>
                <div class="muted">Capacité ${c.capacity}${c.features?` - ${c.features.join(', ')}`:''}</div>
                <div class="price">${fmtMoney(c.price,currency)}</div>
                <div class="spacer"></div>
                <button class="addCabin" data-i="${i}" ${state.chosenCabins.length>=2?'disabled':''}>Ajouter</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Sièges</strong><span class="muted">optionnel</span></div>
        <div class="row">
          <div class="col"><label>Nombre de sièges</label><input type="number" id="seats" min="0" max="4" value="${state.seatsCount}"/></div>
          <div class="col"><label>Prix par siège</label><div class="price">${fmtMoney((state.fees?.seat)||15,currency)} chacun</div></div>
        </div>
        <div class="spacer"></div>
        <button id="updatePrice" class="secondary">Mettre à jour le prix</button>
      </div>
      <div class="card result">
        <div><strong>Total</strong><div class="muted">Mise à jour avec les cabines</div></div>
        <div class="price">${fmtMoney(total.total,total.currency)}</div>
      </div>
      <div class="container"><button id="continue">Continuer</button></div>
    </div>
  `;
  $('#back').addEventListener('click',()=>{ location.hash='results'; });
  document.querySelectorAll('.addCabin').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const c = state.cabins[Number(btn.dataset.i)];
      if (state.chosenCabins.length >= 2) { alert('Vous pouvez sélectionner jusqu\'à deux cabines.'); return; }
      state.chosenCabins.push(c);
      renderDetails();
    });
  });
  $('#updatePrice').addEventListener('click',()=>{
    state.seatsCount = Number($('#seats').value)||0;
    renderDetails();
  });
  $('#continue').addEventListener('click',()=>{ location.hash='passengers'; });
}

function renderPassengers(){
  const count = (state.search.adults||0)+(state.search.children||0);
  if(!state.passengers.length){
    state.passengers = Array.from({length:count}).map((_,i)=>({ firstName:'', lastName:'', type: i < state.search.adults ? 'adult':'child' }));
  }
  app.innerHTML = `
    <div class="container">
      <div class="card header">
        <h3>Passagers & Véhicule</h3>
        <button class="secondary" id="back">Retour</button>
      </div>
      <div class="card">
        <div class="row">
          <div class="col"><label>Email de contact</label><input type="email" id="contactEmail" placeholder="name@example.com" value="${state.contactEmail||''}"/></div>
        </div>
      </div>
      <div class="card">
        ${state.passengers.map((p,i)=>`
          <div class="row">
            <div class="col"><label>${p.type.toUpperCase()} Prénom</label><input data-i="${i}" data-f="firstName" value="${p.firstName}"/></div>
            <div class="col"><label>Nom de famille</label><input data-i="${i}" data-f="lastName" value="${p.lastName}"/></div>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <div class="row">
          <div class="col"><label>Type de véhicule</label><input id="vehType" placeholder="ex: Voiture"/></div>
          <div class="col"><label>Immatriculation</label><input id="vehPlate" placeholder="ex: ABC-123"/></div>
        </div>
        <div class="row">
          <div class="col"><label>Marque</label><input id="vehMake" placeholder="ex: Toyota"/></div>
          <div class="col"><label>Modèle</label><input id="vehModel" placeholder="ex: Corolla"/></div>
          <div class="col"><label>Caravane</label>
            <select id="vehCaravan">
              <option value="">Sélectionnerâ€¦</option>
              <option value="no">Non</option>
              <option value="yes">Oui</option>
            </select>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Assurance Voyage</strong><span class="muted">obligatoire pour choisir</span></div>
        <div class="row">
          <div class="col">
            <label>Choisir une option</label>
            <select id="insurance">
              <option value="">Sélectionnerâ€¦</option>
              <option value="yes" ${state.insuranceChoice==='yes'?'selected':''}>Ajouter une assurance (${fmtMoney((state.fees?.insurance)||10,(state.fees?.currency)||'EUR')})</option>
              <option value="no" ${state.insuranceChoice==='no'?'selected':''}>Pas d'assurance</option>
            </select>
          </div>
        </div>
      </div>
      <div class="container"><button id="continue">Continuer vers le paiement</button></div>
    </div>
  `;
  $('#back').addEventListener('click',()=>{ location.hash='details'; });
  document.querySelectorAll('input[data-i]').forEach(inp=>{
    inp.addEventListener('input', e=>{
      const i = Number(e.target.dataset.i); const f = e.target.dataset.f;
      state.passengers[i][f] = e.target.value;
    });
  });
  $('#insurance').addEventListener('change', e=>{ state.insuranceChoice = e.target.value||null; });
  $('#continue').addEventListener('click',()=>{
    if(!state.insuranceChoice){
      alert('Veuillez choisir une option d\'assurance pour continuer.');
      return;
    }
    const email = ($('#contactEmail').value||'').trim();
    const emailOk = /.+@.+\..+/.test(email);
    if(!emailOk){
      alert('Veuillez entrer un email valide pour recevoir votre billet et votre facture.');
      return;
    }
    state.contactEmail = email;

    const vehiclesCount = Number(state.search.vehicles||0);
    const type = ($('#vehType').value||'').trim();
    const plate = ($('#vehPlate').value||'').trim();
    const make = ($('#vehMake')?.value||'').trim();
    const model = ($('#vehModel')?.value||'').trim();
    const caravanSel = ($('#vehCaravan')?.value||'').trim();
    if (vehiclesCount > 0) {
      if(!make || !model || !caravanSel){
        alert('Veuillez fournir la marque, le modèle et la sélection de la caravane du véhicule.');
        return;
      }
    }
    state.vehicleInfo = {
      type, plate, make, model,
      hasCaravan: caravanSel==='yes'
    };
    location.hash='payment';
  });
}

function renderPayment(){
  const total = computeTotal();
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header"><h3>Paiement</h3><span class="price">${fmtMoney(total.total,total.currency)}</span></div>
        <div class="row">
          <div class="col"><label>Méthode</label>
            <select id="method"><option value="card">Carte</option><option value="paypal">PayPal</option></select>
          </div>
        </div>
        <div class="spacer"></div>
        <button id="pay">Payer (Démo)</button>
        <span class="muted" style="margin-left:8px">Aucun paiement réel traité</span>
      </div>
      <div class="card">
        <div class="header"><strong>Résumé</strong></div>
        <div class="stack">
          <div>${state.search.adults} adulte(s), ${state.search.children} enfant(s), ${state.search.pets} animal(aux), ${state.search.vehicles} véhicule(s)</div>
          <div>${state.selection.departPort} â†’ ${state.selection.arrivePort} â€¢ ${state.selection.departTime}</div>
          <div>Cabines: ${state.chosenCabins.map(c=>c.label).join(', ')||'Aucune'}</div>
          <div>Contact: ${state.contactEmail||'-'}</div>
          <div>Véhicule: ${state.vehicleInfo?`${state.vehicleInfo.make||''} ${state.vehicleInfo.model||''} ${state.vehicleInfo.type||''} ${state.vehicleInfo.plate||''} ${state.vehicleInfo.hasCaravan?'(avec caravane)' : '(sans caravane)'}`:'-'}</div>
        </div>
      </div>
    </div>
  `;
  $('#pay').addEventListener('click',()=>{
    alert('Réservation confirmée (démo).');
    location.hash='search';
    state.results=[]; state.selection=null; state.chosenCabins=[]; state.passengers=[]; state.vehicleInfo=null; state.contactEmail='';
  });
}

function renderSearchUX(){
  const routeValue = `${state.search.departPort}__${state.search.arrivePort}`;
  const pairsSet = new Set();
  (state.routes.list||[]).forEach(r=>{
    if (r && r.departPort && r.arrivePort) {
      pairsSet.add(`${r.departPort}__${r.arrivePort}`);
      pairsSet.add(`${r.arrivePort}__${r.departPort}`);
    }
  });
  const routeOptions = Array.from(pairsSet).sort((a,b)=>a.localeCompare(b));
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header"><h2>Ferry Search</h2><span class="muted">Demo</span></div>
        <div class="tabs">
          <input type="radio" id="oneWay" name="tripType" value="oneway" ${state.search.direction === 'oneway' ? 'checked' : ''}>
          <label for="oneWay">One way</label>
          <input type="radio" id="return" name="tripType" value="return" ${state.search.direction === 'return' ? 'checked' : ''}>
          <label for="return">Return Trip</label>
        </div>
        <div class="row">
          <div class="col"><label>Route</label>
            <select id="routePair">
              ${routeOptions.map(val=>{
                const [from,to] = val.split('__');
                const lbl = `${from} -> ${to}`;
                const sel = val===routeValue? 'selected' : '';
                return `<option value="${val}" ${sel}>${lbl}</option>`;
              }).join('')}
            </select>
            <button id="swapRoute" class="secondary" style="margin-left:6px">Swap</button>
          </div>
          <div class="col"><label>Depart Date</label><input type="date" id="departDate" value="${fmtDateInput(state.search.departDate)}" /></div>
          <div class="col"><label>Depart Time</label><input type="time" id="departTime" value="${state.search.departTime||''}"/></div>
          <div class="col ${state.search.direction==='return'?'':'muted'}"><label>Return Date</label><input type="date" id="returnDate" ${state.search.direction==='return'?'':'disabled'} value="${fmtDateInput(state.search.returnDate)}"/></div>
          <div class="col ${state.search.direction==='return'?'':'muted'}"><label>Return Time</label><input type="time" id="returnTime" ${state.search.direction==='return'?'':'disabled'} value="${state.search.returnTime||''}"/></div>
        </div>
        <div class="row">
          <div class="col"><label>Adults</label><input type="number" min="0" id="adults" value="${state.search.adults}"/></div>
          <div class="col"><label>Children</label><input type="number" min="0" id="children" value="${state.search.children}"/></div>
          <div class="col"><label>Pets</label><input type="number" min="0" id="pets" value="${state.search.pets}"/></div>
          <div class="col"><label>Vehicles</label><input type="number" min="0" id="vehicles" value="${state.search.vehicles}"/></div>
        </div>
        ${ (state.search.vehicles>0 ? `
          <div class="row">
            <div class="col"><label>Vehicle Type</label><input id="vehTypeSearch" placeholder="e.g., Car" value="${state.search.vehicleDetail.type||''}"/></div>
            <div class="col"><label>Make</label><input id="vehMakeSearch" placeholder="e.g., Toyota" value="${state.search.vehicleDetail.make||''}"/></div>
            <div class="col"><label>Model</label><input id="vehModelSearch" placeholder="e.g., Corolla" value="${state.search.vehicleDetail.model||''}"/></div>
          </div>
          <div class="row">
            <div class="col"><label>Plate</label><input id="vehPlateSearch" placeholder="e.g., ABC-123" value="${state.search.vehicleDetail.plate||''}"/></div>
            <div class="col"><label>Caravan</label>
              <select id="vehCaravanSearch">
                <option value="">Select…</option>
                <option value="no" ${state.search.vehicleDetail.caravan==='no'?'selected':''}>No</option>
                <option value="yes" ${state.search.vehicleDetail.caravan==='yes'?'selected':''}>Yes</option>
              </select>
            </div>
          </div>
        `: '') }
        ${ (state.search.children>0 ? `
          <div class="row">
            <div class="col"><label>Children Ages (each)</label>
              <div class="row" id="childAges">
                ${Array.from({length:state.search.children}).map((_,i)=>{
                  const val = state.search.childrenAges[i] ?? '';
                  return `<div class=\"col\"><input type=\"number\" min=\"0\" max=\"17\" data-age-index=\"${i}\" value=\"${val}\" placeholder=\"Age #${i+1}\"/></div>`;
                }).join('')}
              </div>
            </div>
          </div>
        `: '') }
        <div class="spacer"></div>
        <button id="searchBtn">Search Sailings</button>
      </div>
    </div>
  `;

  document.querySelectorAll('.tabs input').forEach(btn=>{
    btn.addEventListener('change',()=>{
      state.search.direction = btn.value;
      renderSearchUX();
    });
  });
  document.getElementById('searchBtn').addEventListener('click', async ()=>{
    const rp = document.getElementById('routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = from;
      state.search.arrivePort = to;
    }
    state.search.departDate = (document.getElementById('departDate').value||'').replace(/-/g,'');
    state.search.returnDate = (document.getElementById('returnDate')?.value||'').replace(/-/g,'');
    state.search.departTime = (document.getElementById('departTime')?.value||'').trim();
    state.search.returnTime = (document.getElementById('returnTime')?.value||'').trim();
    state.search.adults = Number(document.getElementById('adults').value)||0;
    state.search.children = Number(document.getElementById('children').value)||0;
    if (state.search.children>0) {
      state.search.childrenAges = Array.from(document.querySelectorAll('[data-age-index]')).map(inp=>Number(inp.value)||0);
    } else {
      state.search.childrenAges = [];
    }
    state.search.pets = Number(document.getElementById('pets').value)||0;
    state.search.vehicles = Number(document.getElementById('vehicles').value)||0;
    if (state.search.vehicles > 0) {
      state.search.vehicleDetail = {
        type: (document.getElementById('vehTypeSearch')?.value||'').trim(),
        make: (document.getElementById('vehMakeSearch')?.value||'').trim(),
        model: (document.getElementById('vehModelSearch')?.value||'').trim(),
        plate: (document.getElementById('vehPlateSearch')?.value||'').trim(),
        caravan: (document.getElementById('vehCaravanSearch')?.value||'').trim(),
      };
    } else {
      state.search.vehicleDetail = { type:'', make:'', model:'', plate:'', caravan:'' };
    }
    state.search.method = '';
    state.search.supplierId = 'ALL';
    await doSearch();
    location.hash = 'results';
  });
  document.getElementById('routePair').addEventListener('change', ()=>{
    const rp = document.getElementById('routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = from;
      state.search.arrivePort = to;
    }
  });
  document.getElementById('swapRoute').addEventListener('click', ()=>{
    const rp = document.getElementById('routePair').value;
    if (rp && rp.includes('__')) {
      const [from,to] = rp.split('__');
      state.search.departPort = to;
      state.search.arrivePort = from;
      renderSearchUX();
    }
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadRefs();
  await loadRoutes();
  render();
});
