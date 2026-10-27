# Piano operativo — redesign completo della UI/UX

**Stato:** roadmap rivista con descrizione della UI-obiettivo, flusso end-to-end ed esportazione 2D. In questo checkpoint è stato aggiornato soltanto il documento; il codice applicativo non è stato modificato.

## Obiettivo

KliqueASP deve accompagnare una persona dall'inserimento dei propri dati fino alla comprensione e all'esportazione dei risultati: caricare o preparare il grafo, controllare che sia interpretabile, configurare l'analisi, esplorare i witness e ottenere output riutilizzabili. La UI deve essere chiara per chi conosce i grafi ma non ASP; non deve richiedere ASP per imparare a usare l'app.

La priorità è l'usabilità quotidiana dell'applicazione. Il redesign non deve organizzare l'interfaccia per scrivere un paper, raccontare una metodologia o produrre figure secondo convenzioni editoriali. Deve però mantenere corretti e verificabili input, ambito, stato del calcolo e risultato.

La direzione visiva resta una toolbar superiore compatta e minimale. La riduzione dei testi elimina ripetizioni e usa livelli di dettaglio; non nasconde impostazioni che cambiano il risultato.

## Descrizione della UI finale proposta

Questa è la schermata-obiettivo del redesign. La rete resta il luogo in cui si lavora; le azioni seguono un percorso prevedibile e i pannelli mostrano solo il contenuto necessario al passo corrente.

### Primo accesso e caricamento dei dati

Quando non è ancora aperto un grafo, l'utente vede una schermata iniziale semplice con tre scelte principali: **Carica i miei dati**, **Apri un progetto** e **Prova un esempio**. Il caricamento guidato accetta inizialmente i JSON nel formato supportato. L'editor JSON rimane disponibile come modalità avanzata, non come passaggio obbligatorio. La schermata mostra quali file sono richiesti e permette di continuare con il dataset e la configurazione già disponibili quando appropriato.

Dopo il caricamento, una fase di controllo presenta un riepilogo leggibile di nodi, archi e campi riconosciuti. Gli errori portano direttamente al record o al mapping da correggere. Le opzioni di tipo, direzione, gruppi, attributi e tempo compaiono quando i dati o la configurazione li supportano; l'utente può applicare le correzioni e vedere un'anteprima della rete prima di eseguire analisi.

### Area di lavoro desktop

La schermata di lavoro usa una sola toolbar orizzontale, una barra compatta di stato e una grande area per il grafo. Il pannello aperto è ancorato a lato, scorre internamente e non si sovrappone ad altri pannelli.

| Area | Contenuto e comportamento |
| --- | --- |
| Barra superiore | Progetto e stato di salvataggio; Dati; menu Analisi; Proiezione; ricerca nodo; Vista; Esporta. Una riga compatta, con gruppi di azioni brevi. |
| Stato della rete | Conteggi di nodi e archi e riepilogo compatto della proiezione corrente; diventa evidente quando filtri o scenario sono attivi. |
| Area centrale | Grafo 3D interattivo, che occupa la maggior parte dello spazio. Legenda discreta, selezione e focus della rete restano visibili. |
| Pannello laterale | Dati, configurazione, controlli e risultati dell'analisi corrente. Si apre quando serve, ha scroll interno e può essere chiuso senza perdere il witness selezionato. |
| Bordo inferiore | Timeline solo se disponibile; non copre i pulsanti del pannello né i risultati. |

Selezione del nodo e cronologia sono richiamabili senza lasciare una fila permanente di schede o finestre flottanti.

- **Progetto** apre, salva, rinomina o crea un progetto; segnala modifiche non salvate.
- **Dati** mostra caricamento, validazione e mapping. L'editor JSON è raggiungibile da qui come strumento avanzato.
- **Analisi** apre un catalogo breve per famiglie di domande: gruppi densi, comunità, percorsi/connessione, motivi/relazioni, copertura, scenari e qualità dei dati. Ogni voce indica se si può eseguire e, se manca un requisito, quale.
- **Proiezione** apre filtri, gruppi, scenario e tempo in un unico pannello contestuale. I filtri attivi sono anche visibili come chip rimovibili. Un indicatore distingue una proiezione filtrata dalla rete di partenza.
- **Cerca nodo** porta al nodo selezionato senza aprire l'editor o un'analisi.
- **Vista** contiene zoom, adatta alla rete, etichette e modalità di visualizzazione. La rete 3D è la vista interattiva predefinita; la preview 2D serve a controllare e preparare l'export.
- **Esporta** propone gli output disponibili nel contesto corrente: risultato 2D, CSV/JSON oppure progetto, quando supportati.

### Pannello di analisi e risultato

Scegliendo un'analisi si apre il pannello laterale con il nome del task, una riga che chiarisce la domanda e l'ambito attivo. Per esempio, in un k-core l'utente vede la soglia k e se il grado è entrante, uscente, reciproco o non orientato quando applicabile. Per la modularità vede la risoluzione e i vincoli configurati. Le opzioni meno comuni restano chiuse sotto **Altre opzioni**.

I parametri precedono un solo pulsante primario, ad esempio **Calcola k-core**. Se manca un prerequisito, il pannello spiega come correggerlo e non induce a lanciare un task impossibile. Durante il calcolo compare uno stato sintetico; il dettaglio del solver non interrompe il flusso.

Al termine, la parte alta del pannello mostra il dato che serve per decidere cosa ispezionare: dimensione o valore, numero di risultati e stato di completezza. Sotto c'è l'elenco ordinabile dei risultati. Selezionando una riga, il witness viene evidenziato nel grafo e resta selezionato mentre l'utente consulta la sua evidenza. Comandi vicini consentono di mostrare la rete completa, isolare il risultato nella vista o esportarlo. Le liste grandi hanno ricerca/paginazione e indicano quanti elementi sono mostrati; l'export dichiara se include tutti i risultati o solo quello selezionato.

La spiegazione in superficie risponde a «che cosa ho trovato?» e «quali nodi/archi lo mostrano?». I dettagli tecnici ASP, i certificati estesi e le statistiche sono apribili su richiesta. Il testo è breve e operativo: non contiene una narrazione da paper, ma non nasconde impostazioni che cambiano l'esito.

### Anteprima ed esportazione del grafo 2D

Dal risultato l'utente sceglie **Esporta grafo 2D** e vede una preview dedicata. Nella preview può passare tra **Proiezione con risultato evidenziato** e **Solo witness**, vedere quanti nodi e archi saranno inclusi, attivare etichette e legenda, controllare tipi/direzione e selezionare SVG o PNG. Il pannello riepiloga anche filtri e scenario, così è chiaro quale parte dei dati si sta esportando.

La preview usa un layout planare calcolato dai dati del grafo; non è uno screenshot della vista 3D. Clique, k-plex, cammini, triadi e violazioni evidenziano il witness pertinente. Una partizione comunitaria assegna un colore a ogni comunità; il k-core può mostrare il core number; separatori e controfattuali distinguono gli elementi rimossi o ipotetici da quelli osservati. Quando un task restituisce solo un conteggio o una misura aggregata senza witness, l'immagine mostra la proiezione con quel riepilogo, senza simulare una soluzione.

**Scarica SVG** produce una figura vettoriale; **Scarica PNG** un'immagine pronta da condividere. CSV/JSON restano separati per chi vuole analizzare righe e dati. Reti troppo dense o grandi ricevono un avviso e opzioni per esportare il solo witness o i dati tabellari; l'app non rimuove elementi senza dichiararlo.

### Schermi piccoli

Su mobile la toolbar diventa una riga compatta con ricerca e analisi sempre raggiungibili; le altre azioni stanno in un menu ordinato. Il pannello di analisi si apre come bottom sheet a tutta larghezza disponibile, con titolo, azione principale e stato raggiungibili. La rete resta dietro il pannello e torna immediatamente fruibile quando questo viene chiuso o ridotto. Filtri e timeline si aprono uno alla volta; non si impilano sopra al risultato.

### Esempio di percorso completato

Una persona carica un dataset JSON, corregge il mapping degli estremi e controlla l'anteprima. Dal catalogo sceglie **Gruppi densi → k-plex**, lascia visibile la soglia e avvia il calcolo. Il pannello mostra il numero di risultati e se l'elenco è completo; la persona seleziona un witness, lo ispeziona sul grafo, passa alla preview 2D e scarica SVG o PNG insieme al CSV del risultato. In ogni passaggio può vedere quale proiezione e quali filtri hanno prodotto quel risultato.

## Percorso end-to-end da supportare

- [ ] **Aprire o creare un progetto:** scegliere un esempio oppure caricare dataset e configurazione dell'utente. Il formato JSON attuale resta il primo percorso supportato. L'editor JSON può rimanere per chi lo desidera, ma non deve essere l'unico modo di fornire i dati.
- [ ] **Controllare e preparare i dati:** validare struttura e campi; mostrare errori per file, record e proprietà, con indicazione concreta di come correggerli. Far vedere un riepilogo iniziale di nodi, archi, direzione, tipi e attributi riconosciuti.
- [ ] **Configurare il grafo:** guidare l'utente nell'associazione dei campi JSON a ID, estremi, tipi e attributi rilevanti. Distinguere i campi già riconosciuti dalle capability opzionali non mappate. Consentire di applicare e rivedere la configurazione senza perdere i dati di origine.
- [ ] **Esplorare e definire l'ambito:** mostrare rete, filtri, gruppo, scenario e finestra temporale; rendere evidente quali controlli cambiano l'input dell'analisi e quali cambiano solo la vista.
- [ ] **Scegliere e lanciare una domanda:** trovare il task dalla domanda di graph analysis, impostare i soli parametri pertinenti, controllare l'ambito e avviare l'esecuzione. La UI deve indicare prerequisiti, avanzamento, annullamento se supportato e stato del calcolo.
- [ ] **Esplorare i risultati:** leggere il riepilogo, navigare risultati multipli, aprire un witness nel grafo, confrontare scenari o alternative, tornare alla proiezione completa e riaprire analisi precedenti.
- [ ] **Portare fuori il lavoro:** esportare dati e risultati tabellari, un grafo 2D leggibile con il risultato rappresentato e, dove utile, dataset/configurazione o stato del progetto per riprendere il lavoro.
- [ ] **Gestire progetti e sessioni:** decidere una modalità esplicita per salvare dataset, configurazione e impostazioni dell'analisi in un progetto riapribile. La serializzazione dei risultati va inclusa solo quando è stabile e non può essere ricostruita senza ambiguità.

### Confine dei formati d'ingresso

- [x] La ricognizione del componente JSON Editor mostra due aree di testo per dataset e configurazione, preset di esempio e applicazione dei JSON; in quel flusso non risulta un controllo standard per selezionare file.
- [ ] Nella prima fase, semplificare il caricamento dei JSON nel formato già accettato dall'app e la correzione dei mapping. Valutare separatamente importatori CSV/GraphML o altri formati dopo aver definito i campi e le semantiche che possono essere convertiti senza perdita.
- [ ] Se un importatore non può rappresentare direzione, archi paralleli, tipi, attributi, intervalli o identità degli archi, segnalare esplicitamente la trasformazione o la perdita; non dichiarare compatibilità generica con «qualsiasi grafo».

## Ricognizione e fattibilità dell'esportazione 2D

- [x] La vista attuale è una rete 3D costruita con 3d-force-graph e Three.js; i flussi di esportazione individuati sono prevalentemente CSV dei risultati. Non risulta un renderer di rete 2D né un'esportazione grafica 2D già implementata.
- [x] La dipendenza d3-force-3d già presente supporta simulazioni in due dimensioni. I dati normalizzati e molti witness sono già disponibili alla UI: è quindi fattibile aggiungere un layout 2D e una rappresentazione esportabile senza modificare il solver ASP.
- [x] La fattibilità è buona per una prima esportazione SVG e PNG, ma richiede un renderer 2D dedicato e la definizione di come ogni famiglia di risultati si traduce in elementi grafici. Non equivale a salvare uno screenshot della telecamera 3D o a proiettare le coordinate x/y/z esistenti: il risultato deve avere un layout planare calcolato per quel grafo.
- [ ] Prima della generalizzazione, costruire e verificare un prototipo con un witness piccolo, una proiezione con tipi e archi paralleli, un risultato con molti nodi e almeno una partizione comunitaria.

### Specifica funzionale dell'export 2D

- [ ] Inserire «Esporta grafo 2D» nell'area coerente dei risultati e offrire un'anteprima prima del download. L'anteprima deve permettere di adattare la vista, attivare/disattivare etichette e legenda e scegliere l'ambito, senza diventare un secondo ambiente di analisi complesso.
- [ ] Prevedere due viste di base:
  - **Proiezione corrente con risultato evidenziato:** esporta nodi e archi della proiezione effettivamente analizzata, includendo il risultato selezionato o la codifica dell'analisi.
  - **Solo risultato/testimone:** esporta gli elementi che costituiscono il witness selezionato, con gli archi sorgente quando il task li identifica.
- [ ] Aggiungere una rappresentazione specifica quando il risultato descrive una struttura estesa: partizione comunitaria con colori per comunità; core number con legenda per soglia; cammino ordinato con direzione; taglio con elementi rimossi e lati risultanti; motivo/triade con ruoli e tipi; violazione con entità coinvolte; proposta controfattuale con archi ipotetici chiaramente distinti da quelli osservati.
- [ ] Non inventare un witness grafico per un conteggio o una misura aggregata che non ne restituisce uno. In quei casi offrire la proiezione corrente con il riepilogo della misura e dire chiaramente che non esiste un singolo witness associato.
- [ ] Esportare inizialmente in **SVG** per una figura vettoriale e in **PNG** per un'immagine semplice da condividere. Mantenere CSV/JSON per tabelle e dati strutturati: un'immagine non sostituisce l'export dei dati.
- [ ] Includere titolo breve, legenda, ID o etichette secondo opzione, tipi e direzione degli archi, stato del risultato e indicazione dell'ambito. L'immagine deve poter essere capita senza riaprire il pannello, ma evitare lunghi testi descrittivi.
- [ ] Conservare l'identità dei record d'arco nella rappresentazione e nell'eventuale descrizione SVG. L'aggregazione visiva degli archi paralleli deve essere un'opzione dichiarata e non deve cancellare gli ID dalla sorgente o dai CSV.
- [ ] Consentire scelte pratiche: risultato completo o testimone selezionato, etichette on/off, legenda on/off, sfondo chiaro/trasparente e dimensioni PNG. Indicare conteggio nodi/archi inclusi. Per reti troppo grandi avvisare e proporre il solo witness o un export tabellare; non troncare in silenzio.
- [ ] Usare un layout ripetibile per lo stesso input e le stesse opzioni, evitando che un nuovo export riordini arbitrariamente gli elementi. Se l'utente dispone di coordinate 2D esplicitamente mappate, valutare l'uso opzionale di tali coordinate; non interpretare coordinate 3D come coordinate planari.
- [ ] Dichiarare il perimetro esportato: dataset completo, proiezione filtrata, scenario o witness. Le opzioni non devono includere elementi fuori dal dominio corrente senza avvertire l'utente.

## Principi d'interazione e vincoli

- [ ] Conservare le funzionalità implementate, i contratti dei task, evidenza, selezione 3D e CSV. Riorganizzare l'accesso non deve cambiare implicitamente la semantica ASP.
- [ ] Mantenere compatibilità con grafi legacy e configurazioni schema v2. Catalogo e configuratore devono essere data-driven: capability disponibile, non applicabile o priva di prerequisiti, con motivazione breve e azione possibile.
- [ ] Distinguere dati di origine, proiezione analizzata e focus solo visuale. Filtri, scenario e tempo che cambiano la query devono essere visibili vicino al risultato e riflessi nell'export.
- [ ] Preservare distinzioni matematiche utili a scegliere e leggere correttamente l'analisi: massimo/massimale, partizione ottima/singola partizione, taglio/costo, risultato completo/interrotto, dato mancante/relazione assente.
- [ ] Lasciare all'utente il controllo su filtri, layout, dettaglio, ordinamento, export e reset. Azioni distruttive o che scartano modifiche devono essere distinguibili e reversibili quando possibile.
- [ ] Evitare di imporre all'interfaccia il vocabolario, la struttura o il flusso di un articolo scientifico. I termini di grafo necessari all'uso restano precisi; ASP resta un dettaglio tecnico facoltativo.

## Architettura dell'informazione

- [ ] Trattare la rete 3D come una delle viste di lavoro centrali, con toolbar compatta e pannelli che la coprono il meno possibile.
- [ ] Riorganizzare la toolbar per funzione:
  - **Dati:** nuovo/carica progetto, esempi e stato di validazione.
  - **Analisi:** catalogo di domande e accesso all'analisi attiva.
  - **Proiezione:** filtri, scenario, soglia e tempo quando disponibili; indicatore discreto quando non è al default.
  - **Cerca:** nodo e suggerimenti.
  - **Vista:** adatta, zoom, etichette e ritorno alla rete completa.
  - **Risultati:** pannello corrente, cronologia ed export.
  - **Configurazione:** mapping avanzato ed editor JSON.
- [ ] Raggruppare il catalogo per domanda, senza chiedere all'utente di conoscere i nomi interni dei task:
  - **Gruppi densi:** clique, k-plex massimi e massimali, k-core.
  - **Comunità:** modularità, vincoli e stabilità.
  - **Connessione e percorsi:** componenti, cammini, cammini tipizzati/temporali, separatori e tagli.
  - **Motivi e relazioni:** motivi tipizzati, triadi firmate, gruppi contestuali.
  - **Copertura:** insieme dominante e varianti configurate.
  - **Scenari e cambiamenti:** confronti di provenienza, diagnosi e controfattuali.
  - **Qualità dei dati:** integrità e proposte di riparazione.
- [ ] Nel catalogo, mostrare subito ciò che è eseguibile; lasciare consultabili le altre voci con requisito mancante e rimedio. Evitare sia pulsanti attivi che falliscono dopo il click sia elenchi tecnici sempre aperti.
- [ ] Usare un pannello di lavoro coerente, laterale su desktop e drawer/bottom sheet su mobile. Un pannello di analisi alla volta; dati/configurazione e scheda nodo hanno percorsi distinguibili. Timeline e filtri non devono coprire azioni principali.
- [ ] Dare a ogni schermata un passo successivo chiaro: correggi dati, configura, filtra, analizza, seleziona witness, esporta o torna alla rete.

## Modello comune dei pannelli

- [ ] **Titolo e domanda:** concetto di grafo più una frase breve sul compito. Non ripetere il titolo e non spiegare ASP come premessa.
- [ ] **Ambito:** mostrare filtri, gruppo candidato/obiettivo, scenario, tempo e modalità/direzione quando applicabili; chiarire se il focus cambia soltanto la vista.
- [ ] **Parametri:** presentare solo quelli pertinenti; spostare opzioni rare in «Altre opzioni». Aiuti brevi per scelte non ovvie.
- [ ] **Prerequisiti:** dire quale campo/mapping/configurazione manca e come raggiungere la correzione.
- [ ] **Azione:** un comando primario con verbo e risultato atteso, stato di esecuzione e annullamento se supportato.
- [ ] **Riepilogo:** cardinalità, soglia, numero di soluzioni o valore/scala della misura; distinguere ottimo provato, enumerazione completa, parziale, infeasible e nessun witness.
- [ ] **Risultati:** elementi selezionabili e collegati alla vista. Per liste grandi usare ricerca, ordinamento o paginazione; indicare quanti record si stanno vedendo.
- [ ] **Evidenza:** sintesi ispezionabile subito, dettagli estesi e certificati apribili su richiesta.
- [ ] **Esportazione:** accesso coordinato a immagine 2D, CSV/JSON e, se previsto, progetto riapribile. Dichiarare sempre il perimetro.
- [ ] **Dettagli ASP:** encoding, versione, predicati, parser, statistiche e memoria in una sezione tecnica secondaria, accessibile ma non dominante.

## Contenuti e feedback orientati all'uso

- [ ] Usare una lingua coerente in viste, controlli, errori e stati; ipotesi iniziale: italiano. Se si aggiunge l'inglese, gestirlo tramite localizzazione.
- [ ] Fare l'inventario delle stringhe visibili e separare etichette, istruzioni, stati, spiegazioni del risultato e dettagli tecnici. Togliere ripetizioni e testi che non aiutano a decidere o agire.
- [ ] Usare livelli di dettaglio: indicazione breve nel flusso, chiarimento vicino al controllo, dettaglio apribile per semantiche lunghe. Le informazioni indispensabili non devono apparire solo al passaggio del puntatore.
- [ ] Mantenere coerenti termini di graph analysis: clique massima/massimale, k-plex, k-core/core number, modularità/risoluzione, membership brave/cautious e controfattuale. Spiegare in breve le differenze che incidono sulla scelta o sulla lettura.
- [ ] Presentare misure con unità e popolazione di riferimento quando servono per capire il valore. Evitare metriche senza denominatore o senza ambito esplicito.
- [ ] Usare stati comuni e comprensibili: in esecuzione, completato, ottimo provato, enumerazione completa, limite/timeout, interrotto, non fattibile, nessun risultato, prerequisito mancante ed errore.
- [ ] Rendere chiaro cosa può fare l'utente dopo: aprire elemento, restringere la lista, cambiare proiezione, rifare il calcolo, correggere configurazione, esportare o salvare.

## Vista, accessibilità e comportamento responsive

- [ ] Definire gerarchie coerenti per titoli, testo secondario, controlli, azioni primarie/secondarie, badge, risultati, disclosure ed errori.
- [ ] Usare icone con nome accessibile e tooltip quando serve; mantenere etichette testuali per azioni ambigue. Separare pulizia risultati, reset vista e reset progetto/dati.
- [ ] Coordinare pannelli e viste 3D/2D: selezionare un risultato evidenzia il witness; «Rete completa» ripristina la proiezione; il pannello conserva la selezione mentre l'utente consulta l'evidenza.
- [ ] Evitare sovrapposizioni: scroll interno e altezza massima dei pannelli, timeline e filtri non devono nascondere toolbar o azioni. Su mobile usare un ordine prevedibile e controlli raggiungibili.
- [ ] Verificare tastiera, focus visibile, etichette/stati espansi, annunci degli aggiornamenti, contrasto e non dipendenza dal solo colore. Offrire anche elenchi testuali per esplorare witness e risultati.

## Fasi operative

1. **Flusso dati e requisiti**
   - [ ] Mappare l'intero ciclo: apertura, caricamento, validazione, mapping, esplorazione, query, lettura, export e ripresa del progetto.
   - [ ] Definire errori recuperabili, stato delle modifiche non applicate, reset, preset e requisiti di prestazione per grafi di dimensioni differenti.
   - [ ] Decidere quali formati oltre al JSON attuale sono convertibili senza perdita e in quale fase affrontarli.
2. **Architettura e prototipo**
   - [ ] Disegnare il flusso dati, la toolbar, il catalogo analisi, i pannelli, export e layout mobile prima di modificare i componenti.
   - [ ] Provare i percorsi con Psicologia, un grafo schema v2 tipizzato/temporale e un input con errori o mapping incompleto.
   - [ ] Verificare che l'utente distingua filtri di calcolo e focus visivo e sappia sempre cosa fare dopo.
3. **Importazione e configurazione**
   - [ ] Semplificare caricamento dei JSON, validazione e mapping; offrire editor avanzato senza imporlo a chi vuole soltanto fornire dati.
   - [ ] Mostrare anteprima del grafo e contatori prima di lanciare analisi costose; consentire di correggere e riapplicare.
4. **Shell, toolbar e navigazione**
   - [ ] Definire shell condivisa, menu, pannello attivo, cronologia, stato progetto, vista, responsive, tastiera e persistenza della selezione.
5. **Prototipo ed export 2D**
   - [ ] Costruire un renderer 2D separato dal renderer 3D, basato sulla stessa proiezione normalizzata e sugli ID sorgente.
   - [ ] Mappare per ogni famiglia i dati che possono essere disegnati e le forme senza witness grafico; non inferire archi o membership mancanti.
   - [ ] Generare SVG e PNG da una scena 2D autonoma; evitare dipendenza da screenshot o coordinate 3D. Conservare direzione, tipi, parallelismi dichiarati, legenda, highlight e ambito.
   - [ ] Aggiungere anteprima, modalità proiezione/witness, opzioni essenziali, gestione dei grafi grandi e nome file informativo.
   - [ ] Confrontare immagine, dati sorgente e risultati ASP su fixture per ogni tipo di witness implementato; verificare leggibilità a schermo e stampa ordinaria, senza obiettivi di impaginazione editoriale.
6. **Migrazione dei pannelli**
   - [ ] Migrare prima clique e analisi strutturali; separare famiglie nel catalogo senza duplicare logica né alterare i contratti.
   - [ ] Validare molte soluzioni a pari merito, liste ampie, certificati lunghi e proiezioni filtrate.
   - [ ] Applicare il modello a motivi/triadi, integrità/riparazioni, provenienza, controfattuali, editor, scheda nodo, cronologia e timeline.
7. **Salvataggio ed export del lavoro**
   - [ ] Coordinare immagini 2D, CSV/JSON e configurazione; valutare un pacchetto riapribile con dati e impostazioni, preservando il perimetro dell'analisi.
   - [ ] Verificare nomi, contenuti, encoding e possibilità di riaprire i file con strumenti comuni.
8. **Verifica d'uso end-to-end**
   - [ ] Far completare compiti reali a persone che analizzano reti senza dare un tutorial ASP: caricare un proprio JSON, correggere un mapping, trovare k-core o k-plex, capire l'ambito, ispezionare un witness, produrre un grafo 2D, esportare una tabella e riaprire il progetto.
   - [ ] Registrare errori, esitazioni, passaggi inutili, risultati interpretati male e problemi nei file scaricati; dare priorità ai blocchi che impediscono di completare il lavoro.
   - [ ] Ripetere le verifiche su dataset Psicologia legacy, Karate/Davis, preset con tipizzazione/triadi/temporalità e dati utente nel formato supportato, su desktop e mobile.

## Criteri di accettazione

- [ ] Un nuovo utente può passare dai propri dati a un'analisi e poi a un export senza essere costretto a conoscere ASP o modificare JSON a mano per i casi di base.
- [ ] Errori e prerequisiti indicano il dato o mapping da correggere e il passo successivo.
- [ ] È sempre identificabile quale grafo/proiezione è stato analizzato e quali impostazioni vengono esportate.
- [ ] La UI espone risultati parziali/completi in modo distinto; witness e risultato si collegano alla vista interattiva.
- [ ] Per le famiglie con witness, l'utente può esportare SVG/PNG della proiezione annotata o del solo risultato. Le forme aggregate senza witness non vengono presentate come un singolo gruppo trovato.
- [ ] Il grafo 2D conserva identità, tipi e direzione richiesti, dichiara aggregazioni e rimane leggibile entro dimensioni concordate; grafi grandi non vengono troncati silenziosamente.
- [ ] CSV/JSON e output ASP mantengono i contratti; immagine, tabelle e dati si riferiscono allo stesso ambito.
- [ ] Desktop e mobile permettono di completare i percorsi principali senza pannelli bloccanti, overflow orizzontale o ostacoli da tastiera.

## Decisione del checkpoint

- [ ] Adottare questa roadmap rivista; prossimo deliverable: prototipo end-to-end per caricamento/configurazione e anteprima/export 2D prima di migrare i pannelli.
- [ ] Considerare la prima esportazione 2D ad alta fattibilità per SVG/PNG, ma non implementata: dipende da layout 2D, mapping witness per task e prove su grafi piccoli e grandi.
