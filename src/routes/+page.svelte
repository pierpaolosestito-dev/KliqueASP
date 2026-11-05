<script lang="ts">
  import { base } from "$app/paths";
  import { getGraphExampleCatalog } from "$lib/kliqueasp/graph/exampleCatalog";

  const homeHref = `${base}/`;
  const workspaceHref = `${base}/Sandbox/`;
  const caseStudyHref = `${base}/PsychologyHistoryGraph/`;
  const graphExamples = getGraphExampleCatalog(base);
</script>

<svelte:head>
  <title>KliqueASP · Analisi di reti</title>
  <meta
    name="description"
    content="Esplora la struttura dei tuoi grafi, analizza le relazioni e porta con te i risultati."
  />
</svelte:head>

<main class="start-page">
  <header class="topbar">
    <a class="brand" href={homeHref} aria-label="KliqueASP, pagina iniziale">
      <svg class="brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <path d="M9 11.5 20 7l11 7.5-2 13-10 6-11-8zM9 11.5l10 14m12-11L19 25.5m10 2L9 11.5m10 14L8 25.5m11 0 10 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="9" cy="11.5" r="3.3" fill="#F4B860" />
        <circle cx="20" cy="7" r="3.3" fill="#44C4AF" />
        <circle cx="31" cy="14.5" r="3.3" fill="#44C4AF" />
        <circle cx="29" cy="27.5" r="3.3" fill="#44C4AF" />
        <circle cx="19" cy="33.5" r="3.3" fill="#44C4AF" />
        <circle cx="8" cy="25.5" r="3.3" fill="#44C4AF" />
        <circle cx="19" cy="25.5" r="4" fill="#F4B860" />
      </svg>
      <span>Klique<span class="brand-accent">ASP</span></span>
    </a>

    <a class="case-study-link" href={caseStudyHref}>
      <span>Caso studio</span>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
  </header>

  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow"><span></span> Analisi di rete</p>
      <h1 id="hero-title">Dai dati alla struttura della rete.</h1>
      <p class="intro">Esplora connessioni, gruppi e percorsi. Parti da un tuo grafo o da un esempio.</p>

      <nav class="start-actions" aria-label="Inizia un'analisi">
        <a class="start-action start-action--primary" href={`${workspaceHref}?start=data`}>
          <span class="action-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v5h14v-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="action-copy"><strong>Carica i miei dati</strong><small>Importa un dataset JSON</small></span>
          <svg class="action-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>

        <a class="start-action" href={`${workspaceHref}?start=project`}>
          <span class="action-icon action-icon--project" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6H10l2 2h6.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /><path d="M9 13h6m-3-3v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>
          </span>
          <span class="action-copy"><strong>Apri un progetto</strong><small>Riprendi un file KliqueASP</small></span>
          <svg class="action-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>

        <a class="start-action" href={`${workspaceHref}?start=example&example=karate-club`} target="_blank" rel="noopener">
          <span class="action-icon action-icon--example" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="m12 3 2.2 5.3L20 10l-4.5 3.5.2 5.8-4.7-3.1-4.7 3.1.2-5.8L2 10l5.8-1.7z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="action-copy"><strong>Prova un esempio</strong><small>Esplora il Karate Club · 34 nodi</small></span>
          <svg class="action-arrow" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </a>
      </nav>
    </div>

    <div class="hero-art" aria-hidden="true">
      <div class="art-caption"><span class="live-dot"></span> Rete e relazioni</div>
      <svg class="network-art" viewBox="0 0 520 440" fill="none">
        <g class="network-edges">
          <path d="M69 207 145 107 205 159 261 67 327 131 403 91 456 190 391 263 443 344 335 357 276 293 182 355 113 291 69 207Z" />
          <path d="m69 207 136-48 56-92 66 64-51 162-71-134 125-30 70-38-12 172-116-132 12 226-59-64-94 62-69-64 20-132 69 84-44-84 136 48 65 56-118-94 53 99-53-99 142 59-77-168-13 97-118-94" />
          <path d="m145 107 37 248m23-196 130 226m-74-318 130 172m69-148-180 226m123-132-130 132m-90-134 130-30m-143 114 143-114m-143 114 118 86" />
        </g>
        <g class="network-nodes">
          <circle cx="69" cy="207" r="10" /><circle cx="145" cy="107" r="8" />
          <circle cx="205" cy="159" r="12" /><circle cx="261" cy="67" r="9" />
          <circle cx="327" cy="131" r="11" /><circle cx="403" cy="91" r="8" />
          <circle cx="456" cy="190" r="10" /><circle cx="391" cy="263" r="13" />
          <circle cx="443" cy="344" r="8" /><circle cx="335" cy="357" r="10" />
          <circle cx="276" cy="293" r="16" /><circle cx="182" cy="355" r="9" />
          <circle cx="113" cy="291" r="11" /><circle cx="133" cy="223" r="7" />
          <circle cx="260" cy="191" r="9" /><circle cx="328" cy="225" r="8" />
        </g>
        <g class="network-focus">
          <circle cx="205" cy="159" r="18" /><circle cx="327" cy="131" r="17" />
          <circle cx="391" cy="263" r="20" /><circle cx="276" cy="293" r="23" />
          <circle cx="260" cy="191" r="16" /><circle cx="328" cy="225" r="15" />
        </g>
      </svg>
      <div class="art-note"><span class="note-marker"></span><span>Relazioni osservate</span><span class="note-divider"></span><span class="note-marker note-marker--focus"></span><span>Struttura selezionata</span></div>
      <div class="art-orbit art-orbit--one"></div>
      <div class="art-orbit art-orbit--two"></div>
    </div>
  </section>

  <aside class="case-study-card" aria-label="Caso studio in evidenza">
    <div class="case-study-mark" aria-hidden="true">
      <svg viewBox="0 0 28 28" fill="none"><path d="M5 7h18M5 14h18M5 21h18M9 4v20m10-20v20" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /><circle cx="9" cy="7" r="2.3" fill="#F4B860" /><circle cx="19" cy="14" r="2.3" fill="#44C4AF" /><circle cx="9" cy="21" r="2.3" fill="#44C4AF" /></svg>
    </div>
    <div class="case-study-copy">
      <p class="case-study-eyebrow">Caso di studio</p>
      <h2>La rete degli psicologi italiani</h2>
      <p>Esplora il grafo storico usato nel progetto.</p>
    </div>
    <a class="case-study-button" href={caseStudyHref}>
      Apri il caso studio
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </a>
  </aside>

  <section class="examples-section" id="examples" aria-labelledby="examples-title">
    <div class="examples-heading">
      <div>
        <p class="case-study-eyebrow">Esempi</p>
        <h2 id="examples-title">Esplora gli esempi</h2>
      </div>
      <p>Ogni esempio si apre in una nuova scheda, così il lavoro già aperto resta intatto.</p>
    </div>
    <div class="examples-grid">
      {#each graphExamples as example (example.id)}
        <a class="example-card" href={example.href} target="_blank" rel="noopener">
          <span class="example-card-title">{example.title}</span>
          <span class="example-card-description">{example.description}</span>
          <span class="example-card-open">Apri in una nuova scheda <span aria-hidden="true">↗</span></span>
        </a>
      {/each}
    </div>
  </section>

  <footer class="page-footer">
    <span>Grafo, analisi e risultati in un unico spazio.</span>
    <span class="footer-version">KLIQUEASP</span>
  </footer>
</main>

<style>
  :global(html) { min-width: 280px; min-height: 100%; background: #f4f7f5; }
  :global(body) { min-width: 280px; min-height: 100vh; margin: 0; background: #f4f7f5; }

  .start-page {
    --ink: #172a32;
    --muted: #61727a;
    --teal: #17675f;
    --mint: #44c4af;
    position: relative;
    display: flex;
    min-height: 100vh;
    min-height: 100dvh;
    box-sizing: border-box;
    flex-direction: column;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 0 clamp(24px, 7vw, 112px);
    background:
      radial-gradient(ellipse at 77% 46%, rgba(68, 196, 175, .11), transparent 36%),
      linear-gradient(135deg, #f7f9f7 0%, #f0f5f3 100%);
    color: var(--ink);
    font-family: Arial, Helvetica, sans-serif;
  }

  .topbar {
    display: flex;
    min-height: 84px;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgba(23, 42, 50, .1);
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--ink);
    font-size: 18px;
    font-weight: 780;
    letter-spacing: -.055em;
    text-decoration: none;
  }

  .brand-mark { width: 38px; height: 38px; color: #244a50; }
  .brand-accent { color: var(--teal); }

  .case-study-link {
    display: inline-flex;
    min-height: 40px;
    align-items: center;
    gap: 9px;
    padding: 0 13px;
    border: 1px solid rgba(23, 42, 50, .15);
    border-radius: 999px;
    color: #38505a;
    font-size: 12px;
    font-weight: 650;
    text-decoration: none;
    transition: color 140ms ease, border-color 140ms ease, background 140ms ease;
  }

  .case-study-link svg { width: 17px; height: 17px; }
  .case-study-link:hover { border-color: rgba(23, 103, 95, .35); background: rgba(255, 255, 255, .72); color: var(--teal); }

  .hero {
    display: grid;
    width: min(100%, 1260px);
    flex: 1 0 auto;
    grid-template-columns: minmax(390px, .95fr) minmax(430px, 1.05fr);
    align-items: center;
    gap: clamp(30px, 5vw, 90px);
    margin: 0 auto;
    padding: clamp(42px, 6vh, 78px) 0 clamp(30px, 5vh, 64px);
  }

  .hero-copy { position: relative; z-index: 1; max-width: 580px; }
  .eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 19px; color: #47736d; font-size: 11px; font-weight: 650; letter-spacing: .01em; }
  .eyebrow span { width: 7px; height: 7px; border-radius: 50%; background: #e8a544; box-shadow: 0 0 0 4px rgba(232, 165, 68, .14); }
  h1 { max-width: 570px; margin: 0; color: var(--ink); font-size: clamp(42px, 5.2vw, 70px); font-weight: 620; letter-spacing: -.065em; line-height: 1.035; }
  .intro { max-width: 440px; margin: 20px 0 29px; color: var(--muted); font-size: 15px; line-height: 1.65; }

  .start-actions { display: grid; max-width: 470px; gap: 9px; }
  .start-action {
    display: grid;
    min-height: 67px;
    box-sizing: border-box;
    grid-template-columns: 42px minmax(0, 1fr) 20px;
    align-items: center;
    gap: 12px;
    padding: 10px 15px;
    border: 1px solid rgba(30, 59, 65, .12);
    border-radius: 13px;
    background: rgba(255, 255, 255, .76);
    box-shadow: 0 5px 18px rgba(25, 53, 58, .035);
    color: var(--ink);
    text-decoration: none;
    transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background 150ms ease;
  }
  .start-action:hover { transform: translateY(-1px); border-color: rgba(23, 103, 95, .34); background: #fff; box-shadow: 0 9px 24px rgba(25, 53, 58, .08); }
  .start-action--primary { border-color: #17675f; background: #17675f; color: #fff; box-shadow: 0 7px 20px rgba(23, 103, 95, .2); }
  .start-action--primary:hover { border-color: #12554f; background: #12554f; box-shadow: 0 10px 25px rgba(23, 103, 95, .24); }
  .action-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 11px; background: rgba(255, 255, 255, .14); color: #fff; }
  .action-icon svg { width: 22px; height: 22px; }
  .start-action:not(.start-action--primary) .action-icon { background: #e6f2ef; color: #17675f; }
  .start-action:not(.start-action--primary) .action-icon--project { background: #eef0f7; color: #58638a; }
  .start-action:not(.start-action--primary) .action-icon--example { background: #fbf1df; color: #a36d1c; }
  .action-copy { display: grid; min-width: 0; gap: 3px; }
  .action-copy strong { overflow: hidden; font-size: 13px; font-weight: 720; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
  .action-copy small { color: #5d6d74; font-size: 11px; line-height: 1.35; }
  .start-action--primary .action-copy small { color: #fff; }
  .action-arrow { width: 18px; height: 18px; color: #718188; }
  .start-action--primary .action-arrow { color: rgba(255, 255, 255, .85); }

  .hero-art {
    position: relative;
    display: grid;
    min-height: 390px;
    place-items: center;
    isolation: isolate;
  }
  .hero-art::before { position: absolute; z-index: -1; width: min(92%, 510px); aspect-ratio: 1; border: 1px solid rgba(50, 129, 116, .1); border-radius: 50%; content: ""; }
  .hero-art::after { position: absolute; z-index: -1; width: min(72%, 390px); aspect-ratio: 1; border: 1px dashed rgba(50, 129, 116, .12); border-radius: 50%; content: ""; }
  .network-art { width: min(100%, 560px); overflow: visible; filter: drop-shadow(0 14px 20px rgba(31, 80, 77, .08)); }
  .network-edges { stroke: #77a49a; stroke-width: 1.15; stroke-opacity: .48; }
  .network-nodes circle { fill: #fdfefd; stroke: #5f9a8d; stroke-width: 2; }
  .network-focus circle { fill: #e6ad55; fill-opacity: .2; stroke: #d89535; stroke-width: 1.6; }
  .network-focus circle:nth-child(2n) { fill: #39b69f; fill-opacity: .18; stroke: #269781; }
  .art-caption { position: absolute; top: 9%; left: 12%; display: flex; align-items: center; gap: 8px; color: #52696f; font-size: 10px; font-weight: 600; letter-spacing: .01em; }
  .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #3bb39e; box-shadow: 0 0 0 4px rgba(59, 179, 158, .12); }
  .art-note { position: absolute; right: 7%; bottom: 8%; display: flex; align-items: center; gap: 7px; padding: 11px 13px; border: 1px solid rgba(23, 42, 50, .09); border-radius: 10px; background: rgba(255, 255, 255, .76); box-shadow: 0 8px 24px rgba(25, 53, 58, .07); color: #61727a; font-size: 9px; white-space: nowrap; }
  .note-marker { width: 7px; height: 7px; border-radius: 50%; background: #78a49a; }
  .note-marker--focus { background: #e4a747; }
  .note-divider { width: 1px; height: 14px; margin: 0 3px; background: rgba(23, 42, 50, .13); }
  .art-orbit { position: absolute; z-index: -1; width: 8px; height: 8px; border-radius: 50%; background: #e7ae56; box-shadow: 0 0 0 6px rgba(231, 174, 86, .12); }
  .art-orbit--one { top: 21%; right: 13%; }
  .art-orbit--two { bottom: 23%; left: 9%; width: 6px; height: 6px; background: #46bda7; box-shadow: 0 0 0 5px rgba(70, 189, 167, .12); }

  .case-study-card {
    display: grid;
    width: min(100%, 1260px);
    box-sizing: border-box;
    grid-template-columns: 50px minmax(0, 1fr) auto;
    align-items: center;
    gap: 15px;
    margin: 0 auto clamp(20px, 3vh, 34px);
    padding: 17px 20px;
    border: 1px solid rgba(27, 63, 66, .11);
    border-radius: 14px;
    background: rgba(255, 255, 255, .67);
  }
  .case-study-mark { display: grid; width: 46px; height: 46px; place-items: center; border-radius: 12px; background: #e8f1ed; color: #446d67; }
  .case-study-mark svg { width: 28px; height: 28px; }
  .case-study-copy { min-width: 0; }
  .case-study-eyebrow { margin: 0 0 3px; color: #55706b; font-size: 10px; font-weight: 600; letter-spacing: .01em; }
  .case-study-copy h2 { margin: 0; color: #263d43; font-size: 13px; font-weight: 700; letter-spacing: -.015em; }
  .case-study-copy > p:last-child { margin: 3px 0 0; color: #5d6d74; font-size: 11px; }
  .case-study-button { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; gap: 9px; padding: 0 12px; border-radius: 8px; color: #17675f; font-size: 11px; font-weight: 700; text-decoration: none; }
  .case-study-button:hover { background: #e8f2ef; }
  .case-study-button svg { width: 16px; height: 16px; }
  .examples-section { width: min(100%, 1260px); margin: 0 auto clamp(22px, 3vh, 36px); }
  .examples-heading { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 12px; }
  .examples-heading h2 { margin: 0; color: #263d43; font-size: 17px; font-weight: 700; letter-spacing: -.025em; }
  .examples-heading > p { max-width: 420px; margin: 0; color: #5d6d74; font-size: 11px; line-height: 1.5; text-align: right; }
  .examples-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
  .example-card { display: flex; min-height: 112px; box-sizing: border-box; flex-direction: column; gap: 6px; padding: 12px; border: 1px solid rgba(27, 63, 66, .11); border-radius: 11px; background: rgba(255, 255, 255, .72); color: #263d43; text-decoration: none; transition: border-color 140ms ease, background 140ms ease, transform 140ms ease; }
  .example-card:hover { transform: translateY(-1px); border-color: rgba(23, 103, 95, .34); background: #fff; }
  .example-card-title { color: #263d43; font-size: 12px; font-weight: 700; line-height: 1.3; }
  .example-card-description { flex: 1; color: #5d6d74; font-size: 10px; line-height: 1.4; }
  .example-card-open { display: flex; align-items: center; justify-content: space-between; color: #17675f; font-size: 9px; font-weight: 700; }
  .page-footer { display: flex; min-height: 38px; align-items: center; justify-content: space-between; border-top: 1px solid rgba(23, 42, 50, .09); color: #5d6d74; font-size: 10px; }
  .footer-version { font-size: 9px; font-weight: 750; letter-spacing: .14em; }

  @media (min-width: 1440px) and (min-height: 850px) {
    .hero { padding-top: 7vh; padding-bottom: 5vh; }
    .hero-art { min-height: 450px; }
  }

  @media (max-width: 1000px) {
    .start-page { padding-right: clamp(24px, 5vw, 60px); padding-left: clamp(24px, 5vw, 60px); }
    .hero { grid-template-columns: minmax(340px, .95fr) minmax(300px, 1.05fr); gap: 20px; }
    h1 { font-size: clamp(42px, 6vw, 60px); }
    .hero-art { min-height: 330px; }
    .art-note { right: 0; }
    .examples-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }

  @media (max-width: 760px) {
    .start-page { min-height: 100vh; min-height: 100dvh; overflow: visible; padding: 0 22px; }
    .topbar { min-height: 68px; }
    .brand { gap: 8px; font-size: 16px; }
    .brand-mark { width: 33px; height: 33px; }
    .case-study-link { min-height: 36px; gap: 5px; padding: 0 9px; font-size: 10px; }
    .case-study-link svg { width: 15px; height: 15px; }
    .hero { width: 100%; grid-template-columns: 1fr; gap: 15px; padding: 38px 0 26px; }
    .hero-copy { max-width: 560px; margin: 0 auto; }
    .eyebrow { margin-bottom: 13px; font-size: 9px; }
    h1 { max-width: 520px; font-size: clamp(40px, 10vw, 60px); }
    .intro { max-width: 450px; margin: 14px 0 22px; font-size: 13px; }
    .start-actions { max-width: 560px; gap: 8px; }
    .start-action { min-height: 62px; }
    .hero-art { grid-row: 1; min-height: 205px; max-height: 250px; }
    .hero-art::before { width: 205px; }
    .hero-art::after { width: 155px; }
    .network-art { width: min(100%, 270px); max-height: 230px; }
    .art-caption { top: 0; left: 5%; font-size: 8px; }
    .art-note { right: 0; bottom: -2px; gap: 5px; padding: 8px 9px; font-size: 8px; }
    .art-orbit--one { top: 14%; right: 8%; }
    .art-orbit--two { bottom: 18%; left: 5%; }
    .case-study-card { grid-template-columns: 42px minmax(0, 1fr); gap: 11px; margin-bottom: 16px; padding: 13px; }
    .case-study-mark { width: 40px; height: 40px; }
    .case-study-mark svg { width: 24px; height: 24px; }
    .case-study-button { grid-column: 2; justify-self: start; min-height: 32px; margin-left: -10px; padding: 0 10px; }
    .examples-heading { align-items: start; flex-direction: column; gap: 5px; }
    .examples-heading > p { text-align: left; }
    .examples-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .example-card { min-height: 108px; padding: 10px; }
    .page-footer { min-height: 34px; font-size: 9px; }
  }

  @media (max-width: 380px) {
    .start-page { padding-right: 16px; padding-left: 16px; }
    .case-study-link { padding: 0 7px; font-size: 9px; }
    .hero { padding-top: 30px; }
    h1 { font-size: 39px; }
    .intro { font-size: 12px; }
    .action-copy strong { font-size: 12px; }
    .action-copy small { font-size: 10px; }
    .start-action { grid-template-columns: 38px minmax(0, 1fr) 16px; gap: 9px; padding-right: 11px; padding-left: 11px; }
    .action-icon { width: 36px; height: 36px; }
    .art-note { font-size: 7px; }
    .case-study-copy h2 { font-size: 12px; }
    .case-study-copy > p:last-child { font-size: 10px; }
    .examples-grid { gap: 7px; }
    .example-card-title { font-size: 11px; }
    .example-card-open { font-size: 8px; }
  }

  @media (max-width: 340px) {
    .hero { gap: 0; padding-top: 22px; }
    .hero-art { display: none; }
    .case-study-link span { max-width: 85px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  }

  @media (prefers-reduced-motion: reduce) {
    .case-study-link, .start-action { transition: none; }
    .start-action:hover { transform: none; }
  }
</style>
