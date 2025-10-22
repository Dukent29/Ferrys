// Minimal SPA for ferry search -> results -> details -> passengers -> payment

const state = {
  search: {
    direction: 'oneway',
    supplierId: 'ALL',
    departPort: 'CAEN',
    arrivePort: 'PORS',
    departDate: new Date().toISOString().slice(0,10).replace(/-/g,''),
    returnDate: '',
    adults: 1,
    children: 0,
    childrenAges: [],
    pets: 0,
    vehicles: 0,
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
  state.results = Array.isArray(data.results) ? data.results : [];
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
  if(route === 'search') return renderSearch();
  if(route === 'results') return renderResults();
  if(route === 'details') return renderDetails();
  if(route === 'passengers') return renderPassengers();
  if(route === 'payment') return renderPayment();
  renderSearch();
}

function renderSearch(){
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header"><h2>Ferry Search</h2><span class="muted">Demo</span></div>
        <div class="tabs">
          <button class="${state.search.direction==='oneway'?'active':''}" data-dir="oneway">One Way</button>
          <button class="${state.search.direction==='return'?'active':''}" data-dir="return">Return</button>
        </div>
        <div class="row">
          <div class="col"><label>From</label>
            <input list="fromList" id="departPort" value="${state.search.departPort}"/>
            <datalist id="fromList">
              ${Object.keys(state.routes.byFrom).sort().map(p=>`<option value="${p}">`).join('')}
            </datalist>
          </div>
          <div class="col"><label>To</label>
            <input list="toList" id="arrivePort" value="${state.search.arrivePort}"/>
            <datalist id="toList">
              ${(state.routes.byFrom[state.search.departPort]||[]).map(p=>`<option value="${p}">`).join('')}
            </datalist>
          </div>
        </div>
        <!-- Method selection hidden since company selection is removed -->
        <div class="row">
          <div class="col"><label>Depart Date</label><input type="date" id="departDate" value="${fmtDateInput(state.search.departDate)}" /></div>
          <div class="col ${state.search.direction==='return'?'':'muted'}"><label>Return Date</label><input type="date" id="returnDate" ${state.search.direction==='return'?'':'disabled'} value="${fmtDateInput(state.search.returnDate)}"/></div>
        </div>
        <div class="row">
          <div class="col"><label>Adults</label><input type="number" min="0" id="adults" value="${state.search.adults}"/></div>
          <div class="col"><label>Children</label><input type="number" min="0" id="children" value="${state.search.children}"/></div>
          <div class="col"><label>Pets</label><input type="number" min="0" id="pets" value="${state.search.pets}"/></div>
          <div class="col"><label>Vehicles</label><input type="number" min="0" id="vehicles" value="${state.search.vehicles}"/></div>
        </div>
        ${(state.search.children>0?`
          <div class="row">
            <div class="col"><label>Children Ages (each)</label>
              <div class="row" id="childAges">
                ${Array.from({length:state.search.children}).map((_,i)=>{
                  const val = state.search.childrenAges[i] ?? '';
                  return `<div class="col"><input type="number" min="0" max="17" data-age-index="${i}" value="${val}" placeholder="Age #${i+1}"/></div>`;
                }).join('')}
              </div>
            </div>
          </div>
        `:'')}
        <div class="spacer"></div>
        <button id="searchBtn">Search Sailings</button>
      </div>
    </div>
  `;

  app.querySelectorAll('.tabs button').forEach(btn=>{
    btn.addEventListener('click',()=>{
      state.search.direction = btn.dataset.dir;
      render();
    });
  });
  $('#searchBtn').addEventListener('click', async ()=>{
    state.search.departPort = $('#departPort').value.trim();
    state.search.arrivePort = $('#arrivePort').value.trim();
    state.search.departDate = ($('#departDate').value||'').replace(/-/g,'');
    state.search.returnDate = ($('#returnDate')?.value||'').replace(/-/g,'');
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
    await doSearch();
    location.hash = 'results';
  });
  $('#departPort').addEventListener('change', ()=>{
    // When changing From, reset To list and re-render suggestions
    state.search.departPort = $('#departPort').value.trim();
    renderSearch();
  });
}

function renderResults(){
  const currency = (state.fees&&state.fees.currency)||'EUR';
  const emptyTip = state.results.length === 0 ? `
      <div class="card">
        <div class="header"><strong>No sailings found</strong></div>
        <div class="muted">Tips:</div>
        <ul class="muted">
          <li>Try BFT from CAEN to PORS on 2025-10-20</li>
          <li>Or POT from DOVER to CALAIS on 2025-10-21</li>
        </ul>
        <div class="spacer"></div>
        <button class="secondary" id="sample1">Use BFT CAEN→PORS 2025-10-20</button>
        <button class="secondary" id="sample2" style="margin-left:6px">Use POT DOVER→CALAIS 2025-10-21</button>
      </div>
  ` : '';

  // derive badges (best price)
  const minPrice = state.results.length ? Math.min(...state.results.map(r=>Number(r.price?.total||0))) : null;
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header">
          <div>
            <strong>${state.search.departPort} → ${state.search.arrivePort}</strong>
            <div class="muted">${fmtDateInput(state.search.departDate)}</div>
          </div>
          <div>
            <button class="secondary" id="changeSearch">Change Search</button>
          </div>
        </div>
        <div class="row">
          <div class="col">
            <label>Sort by</label>
            <select id="sortBy">
              <option value="best">Best match</option>
              <option value="price">Price</option>
              <option value="depart">Departure time</option>
            </select>
          </div>
          <div class="col"><label>Filter company</label>
            <select id="filterCo"><option value="">All</option><option value="BFT">BFT</option><option value="POT">POT</option></select>
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
              <div><strong>${r.departPort} → ${r.arrivePort}</strong> <span class="chip">${r.supplierId}</span>${isBest?'<span class="badge best">Best price</span>':''}</div>
              <div class="muted">${r.departTime} → ${r.arriveTime} • ${r.vessel||'—'}</div>
            </div>
            <div>
              <div class="price">${fmtMoney(r.price?.total||0,currency)}</div>
              <button data-i="${i}" class="choose">Choose</button>
            </div>
          </div>
        `}).join('')}
      </div>
    </div>
  `;
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
    if(v){ state.results = state.results.filter(r=>r.supplierId===v); renderResults(); }
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
          <h3>Ticket Details</h3>
          <button class="secondary" id="back">Back</button>
        </div>
        <div class="stack">
          <div><strong>${state.selection.departPort} → ${state.selection.arrivePort}</strong> <span class="chip">${state.selection.supplierId}</span></div>
          <div class="muted">${state.selection.departTime} → ${state.selection.arriveTime} • ${state.selection.vessel||'—'}</div>
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Add Cabins</strong><span class="muted">optional</span></div>
        <div class="row">
          ${state.cabins.map((c,i)=>`
            <div class="col">
              <div class="card">
                <div><strong>${c.label}</strong></div>
                <div class="muted">Capacity ${c.capacity}</div>
                <div class="price">${fmtMoney(c.price,currency)}</div>
                <div class="spacer"></div>
                <button class="addCabin" data-i="${i}">Add</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Seats</strong><span class="muted">optional</span></div>
        <div class="row">
          <div class="col"><label>Seat Count</label><input type="number" id="seats" min="0" max="4" value="${state.seatsCount}"/></div>
          <div class="col"><label>Seat Price</label><div class="price">${fmtMoney((state.fees?.seat)||15,currency)} each</div></div>
        </div>
        <div class="spacer"></div>
        <button id="updatePrice" class="secondary">Update Price</button>
      </div>
      <div class="card result">
        <div><strong>Total</strong><div class="muted">Updates with cabins</div></div>
        <div class="price">${fmtMoney(total.total,total.currency)}</div>
      </div>
      <div class="container"><button id="continue">Continue</button></div>
    </div>
  `;
  $('#back').addEventListener('click',()=>{ location.hash='results'; });
  document.querySelectorAll('.addCabin').forEach(btn=>{
    btn.addEventListener('click',()=>{
      const c = state.cabins[Number(btn.dataset.i)];
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
        <h3>Passengers & Vehicle</h3>
        <button class="secondary" id="back">Back</button>
      </div>
      <div class="card">
        ${state.passengers.map((p,i)=>`
          <div class="row">
            <div class="col"><label>${p.type.toUpperCase()} First Name</label><input data-i="${i}" data-f="firstName" value="${p.firstName}"/></div>
            <div class="col"><label>Last Name</label><input data-i="${i}" data-f="lastName" value="${p.lastName}"/></div>
          </div>
        `).join('')}
      </div>
      <div class="card">
        <div class="row">
          <div class="col"><label>Vehicle Type</label><input id="vehType" placeholder="e.g., Car"/></div>
          <div class="col"><label>Plate</label><input id="vehPlate" placeholder="e.g., ABC-123"/></div>
        </div>
      </div>
      <div class="card">
        <div class="header"><strong>Travel Insurance</strong><span class="muted">required to choose</span></div>
        <div class="row">
          <div class="col">
            <label>Choose option</label>
            <select id="insurance">
              <option value="">Select…</option>
              <option value="yes" ${state.insuranceChoice==='yes'?'selected':''}>Add insurance (${fmtMoney((state.fees?.insurance)||10,(state.fees?.currency)||'EUR')})</option>
              <option value="no" ${state.insuranceChoice==='no'?'selected':''}>No insurance</option>
            </select>
          </div>
        </div>
      </div>
      <div class="container"><button id="continue">Continue to Payment</button></div>
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
      alert('Please choose insurance option to continue.');
      return;
    }
    state.vehicleInfo = { type: $('#vehType').value, plate: $('#vehPlate').value };
    location.hash='payment';
  });
}

function renderPayment(){
  const total = computeTotal();
  app.innerHTML = `
    <div class="container">
      <div class="card">
        <div class="header"><h3>Payment</h3><span class="price">${fmtMoney(total.total,total.currency)}</span></div>
        <div class="row">
          <div class="col"><label>Method</label>
            <select id="method"><option value="card">Card</option><option value="paypal">PayPal</option></select>
          </div>
        </div>
        <div class="spacer"></div>
        <button id="pay">Pay (Mock)</button>
        <span class="muted" style="margin-left:8px">No real payment processed</span>
      </div>
      <div class="card">
        <div class="header"><strong>Summary</strong></div>
        <div class="stack">
          <div>${state.search.adults} adult(s), ${state.search.children} child(ren), ${state.search.pets} pet(s), ${state.search.vehicles} vehicle(s)</div>
          <div>${state.selection.departPort} → ${state.selection.arrivePort} • ${state.selection.departTime}</div>
          <div>Cabins: ${state.chosenCabins.map(c=>c.label).join(', ')||'None'}</div>
        </div>
      </div>
    </div>
  `;
  $('#pay').addEventListener('click',()=>{
    alert('Booking confirmed (demo).');
    location.hash='search';
    state.results=[]; state.selection=null; state.chosenCabins=[]; state.passengers=[]; state.vehicleInfo=null;
  });
}

window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', async ()=>{
  await loadRefs();
  await loadRoutes();
  render();
});
