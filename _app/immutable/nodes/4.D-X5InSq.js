import{A as e,D as t,E as n,G as r,J as i,K as a,M as o,O as s,P as c,R as l,T as u,V as d,W as f,Y as p,Z as m,ct as h,d as g,v as _,y as v}from"../chunks/CR6bl6CV.js";import"../chunks/D1hYfEew.js";import"../chunks/D0LADO62.js";import{t as y}from"../chunks/OOg0S6ZJ.js";var b=e(`<meta name="description" content="Edit graph configuration and dataset for KliqueASP"/>`),x=e(`<div class="error-box svelte-doo034"><strong>JSON error</strong> <span> </span></div>`),S=e(`<aside class="editor-panel svelte-doo034"><div class="editor-header svelte-doo034"><div><h1 class="svelte-doo034">KliqueASP Sandbox</h1> <p class="svelte-doo034">Modifica <code class="svelte-doo034">graph.config.json</code> e <code class="svelte-doo034">my-dataset.json</code>, poi applica il nuovo grafo.</p></div> <button class="ghost-button svelte-doo034" type="button">Hide</button></div> <div class="editor-section svelte-doo034"><label for="graph-config" class="svelte-doo034">graph.config.json</label> <textarea id="graph-config" spellcheck="false" class="svelte-doo034"></textarea></div> <div class="editor-section svelte-doo034"><label for="graph-dataset" class="svelte-doo034">my-dataset.json</label> <textarea id="graph-dataset" spellcheck="false" class="svelte-doo034"></textarea></div> <!> <div class="editor-actions svelte-doo034"><button type="button" class="svelte-doo034">Apply JSON</button> <button class="secondary-button svelte-doo034" type="button">Reset example</button></div></aside>`),C=e(`<button class="open-editor-button svelte-doo034" type="button">Open JSON editor</button>`),w=e(`<div class="sandbox-page svelte-doo034"><!> <main><!></main></div>`);function T(e){let T=`{
  "nodeTypes": {
    "actor": {
      "timeline": {
        "startField": "$.data.active_from",
        "endField": "$.data.active_to"
      },
      "macroAreaField": "$.data.affiliations[*].group"
    }
  }
}`,E=`{
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
}`,D=p(T),O=p(E),k=p(JSON.parse(T)),A=p(JSON.parse(E)),j=p(0),M=p(``),N=p(!0);function P(){try{let e=JSON.parse(c(D)),t=JSON.parse(c(O));m(k,e),m(A,I(t)),m(j,c(j)+1),m(M,``)}catch(e){m(M,e?.message??`Invalid JSON`)}}function F(){m(D,T),m(O,E),P()}function I(e){return{nodes:Array.isArray(e?.nodes)?e.nodes:[],edges:Array.isArray(e?.edges)?e.edges:Array.isArray(e?.links)?e.links:[]}}var L=w();v(`doo034`,e=>{var t=b();l(()=>{r.title=`KliqueASP Sandbox`}),s(e,t)});var R=a(L),z=e=>{var r=S(),l=a(r),u=i(a(l),2);h(l);var p=i(l,2),_=i(a(p),2);f(_),h(p);var v=i(p,2),y=i(a(v),2);f(y),h(v);var b=i(v,2),C=e=>{var n=x(),r=i(a(n),2),o=a(r,!0);h(r),h(n),d(()=>t(o,c(M))),s(e,n)};n(b,e=>{c(M)&&e(C)});var w=i(b,2),T=a(w),E=i(T,2);h(w),h(r),o(`click`,u,()=>m(N,!1)),g(_,()=>c(D),e=>m(D,e)),g(y,()=>c(O),e=>m(O,e)),o(`click`,T,P),o(`click`,E,F),s(e,r)},B=e=>{var t=C();o(`click`,t,()=>m(N,!0)),s(e,t)};n(R,e=>{c(N)?e(z):e(B,-1)});var V=i(R,2);let H;u(a(V),()=>c(j),e=>{y(e,{get graphConfig(){return c(k)},get graphData(){return c(A)}})}),h(V),h(L),d(()=>H=_(V,1,`graph-area svelte-doo034`,null,H,{"with-editor":c(N)})),s(e,L)}export{T as component};