import{A as e,B as t,D as n,E as r,F as i,G as a,H as o,J as s,K as c,N as l,O as u,Q as d,V as f,X as p,Y as m,at as h,b as g,g as _,it as v,j as y,k as b,l as x,lt as S,q as C,s as w,z as T}from"../chunks/BFuBlUEr.js";import"../chunks/D1hYfEew.js";import"../chunks/u3Sbd_oH.js";import{t as E}from"../chunks/CB4mQ8h2.js";var D=y(`<div class="error-box svelte-dch307"><strong>JSON error</strong> <span> </span></div>`),O=y(`<aside class="json-editor-panel svelte-dch307" aria-label="JSON editor"><div class="json-editor-header svelte-dch307"><div><h1 class="svelte-dch307">KliqueASP Sandbox</h1></div> <button class="ghost-button svelte-dch307" type="button">Hide</button></div> <div class="json-editor-body svelte-dch307"><section class="json-editor-section svelte-dch307"><label for="graph-config" class="svelte-dch307">graph.config.json</label> <textarea id="graph-config" spellcheck="false" class="svelte-dch307"></textarea></section> <section class="json-editor-section svelte-dch307"><label for="graph-dataset" class="svelte-dch307">my-dataset.json</label> <textarea id="graph-dataset" spellcheck="false" class="svelte-dch307"></textarea></section> <!></div> <div class="json-editor-actions svelte-dch307"><button type="button" class="svelte-dch307">Apply JSON</button> <button class="secondary-button svelte-dch307" type="button">Reset example</button></div></aside>`);function k(t,r){h(r,!1);let i=w(r,`open`,8,!1),c=w(r,`configText`,8,``),d=w(r,`datasetText`,8,``),f=w(r,`errorMessage`,8,``),p=w(r,`onConfigTextChange`,8,()=>{}),g=w(r,`onDatasetTextChange`,8,()=>{}),y=w(r,`onApply`,8,()=>{}),T=w(r,`onReset`,8,()=>{}),E=w(r,`onClose`,8,()=>{});x();var k=e(),A=s(k),j=e=>{var t=O(),r=C(t),i=m(C(r),2);S(r);var s=m(r,2),h=C(s),v=m(C(h),2);a(v),S(h);var x=m(h,2),w=m(C(x),2);a(w),S(x);var k=m(x,2),A=e=>{var t=D(),n=m(C(t),2),r=C(n,!0);S(n),S(t),o(()=>u(r,f())),b(e,t)};n(k,e=>{f()&&e(A)}),S(s);var j=m(s,2),M=C(j),N=m(M,2);S(j),S(t),o(()=>{_(v,c()),_(w,d())}),l(`click`,i,function(...e){E()?.apply(this,e)}),l(`input`,v,e=>p()(e.currentTarget.value)),l(`input`,w,e=>g()(e.currentTarget.value)),l(`click`,M,function(...e){y()?.apply(this,e)}),l(`click`,N,function(...e){T()?.apply(this,e)}),b(e,t)};n(A,e=>{i()&&e(j)}),b(t,k),v()}var A=y(`<meta name="description" content="Edit graph configuration and dataset for KliqueASP"/>`),j=y(`<div class="sandbox-page svelte-doo034"><!></div>`);function M(e,n){h(n,!1);let a=p(),o=`{
  "nodeTypes": {
    "actor": {
      "timeline": {
        "startField": "$.data.active_from",
        "endField": "$.data.active_to"
      },
      "group": "$.data.affiliations[*].group"
    }
  }
}`,s=`{
  "nodes": [
    {
      "id": "alice_rossi",
      "label": "Alice Rossi",
      "type": "actor",
      "data": {
        "active_from": 2018,
        "active_to": 2024,
        "affiliations": [
          {
            "group": "Network Analysis"
          }
        ]
      }
    },
    {
      "id": "bruno_verdi",
      "label": "Bruno Verdi",
      "type": "actor",
      "data": {
        "active_from": 2019,
        "active_to": 2025,
        "affiliations": [
          {
            "group": "Network Analysis"
          }
        ]
      }
    },
    {
      "id": "carla_bianchi",
      "label": "Carla Bianchi",
      "type": "actor",
      "data": {
        "active_from": 2020,
        "active_to": 2026,
        "affiliations": [
          {
            "group": "Knowledge Graphs"
          }
        ]
      }
    }
  ],
  "edges": [
    {
      "source": "alice_rossi",
      "target": "bruno_verdi",
      "type": "collaboration"
    },
    {
      "source": "bruno_verdi",
      "target": "carla_bianchi",
      "type": "collaboration"
    },
    {
      "source": "alice_rossi",
      "target": "carla_bianchi",
      "type": "collaboration"
    }
  ]
}`,l=p(o),u=p(s),m=p(JSON.parse(o)),_=p(M(JSON.parse(s))),y=p(0),x=p(``),w=p(!1);function D(){try{let e=JSON.parse(i(l)),t=JSON.parse(i(u));d(m,e),d(_,M(t)),d(y,i(y)+1),d(x,``)}catch(e){d(x,e?.message??`Invalid JSON`)}}function O(){d(l,o),d(u,s),D()}function M(e){return{nodes:Array.isArray(e?.nodes)?e.nodes:[],edges:Array.isArray(e?.edges)?e.edges:Array.isArray(e?.links)?e.links:[]}}t(()=>(i(w),i(l),i(u),i(x)),()=>{d(a,{open:i(w),configText:i(l),datasetText:i(u),errorMessage:i(x),onConfigTextChange:e=>{d(l,e)},onDatasetTextChange:e=>{d(u,e)},onApply:D,onReset:O,onOpen:()=>{d(w,!0)},onClose:()=>{d(w,!1)}})}),f();var N=j();g(`doo034`,e=>{var t=A();T(()=>{c.title=`KliqueASP Sandbox`}),b(e,t)}),r(C(N),()=>i(y),e=>{E(e,{get graphConfig(){return i(m)},get graphData(){return i(_)},get JsonEditor(){return k},get jsonEditorProps(){return i(a)}})}),S(N),b(e,N),v()}export{M as component};