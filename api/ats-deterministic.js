const COMMON_STOPWORDS = new Set([
  'avec','pour','dans','vous','nous','les','des','une','aux','sur','qui','que','par','plus','vos','nos','notre','votre','leur','leurs','afin','ainsi','poste','mission','profil','équipe','equipe','candidat','candidate','emploi','travail','entreprise','client','clients','projet','projets','expérience','experience',
  'the','and','for','with','your','our','this','that','from','role','team','work','working','job','candidate','company','business','project','projects','experience','skills','required','requirements','responsibilities','profile','about','will','have','has','are','you','we','they','their','them','into','within',
  'of','an','a','to','in','on','is','as','or','be','by','at','it','its','if','not','do','does','did','can','could','would','should','all','any','each','more','most','some','such','than','then','there','these','those','what','when','where','which','who','why','how','i','my','me','us',
  // French function words — without these, prose fragments like "commercial et la",
  // "de haut niveau", "du capital humain" leak through as fake "skills".
  'le','la','les','un','une','de','du','des','et','ou','où','à','au','aux','en','dans','sur','sous','par','pour','avec','sans','ce','cet','cette','ces','son','sa','ses','leur','notre','votre','est','sont','être','etre','avoir','plus','moins','très','tres','tout','tous','toute','toutes','d','l','n','s','t','qu','vos','nos','ainsi','afin','selon','entre','vers','chez','dont','car','mais','donc','ni','soit'
])

const SKILL_SYNONYMS = [
  ['microsoft 365', ['office 365', 'm365', 'o365']],
  ['entra id', ['azure ad', 'aad', 'azure active directory']],
  ['intune', ['endpoint manager', 'microsoft endpoint manager', 'mem']],
  ['service desk', ['helpdesk', 'help desk', 'it support']],
  ['ci/cd', ['continuous integration', 'continuous delivery', 'continuous deployment']],
  ['node.js', ['nodejs', 'node js']],
  ['power bi', ['powerbi']],
  ['active directory', ['ad ds', 'windows ad']],
  ['itil', ['it service management', 'itsm']],
  ['jira', ['atlassian jira']],
  ['azure', ['microsoft azure']],
  ['aws', ['amazon web services']]
]

const TECH_PATTERNS = [
  'active directory','ad ds','amazon web services','api','autopilot','aws','azure','azure ad','backup','business continuity','ci/cd','cloud','compliance','cybersecurity','defender','devops','dns','docker','endpoint manager','entra id','firewall','freshdesk','gpo','helpdesk','iam','incident management','intune','itil','itsm','jamf','jira','kubernetes','linux','m365','mdm','mfa','microsoft 365','monitoring','network','office 365','okta','patch management','power bi','powershell','saml','security','service desk','servicenow','sharepoint','sla','slo','sql','sso','terraform','vpn','windows','windows 11','zendesk',
  'react','next.js','typescript','javascript','node.js','python','postgres','supabase','stripe','vercel','tailwind','firebase','graphql','rest api','html','css'
]

// Multilingual skill lexicon: a canonical (normalized, English) skill mapped to its
// surface forms across languages. Forms are matched as substrings after normalization
// (accents stripped, lowercased), so a French job's "gestion de projet" and an English
// CV's "project management" both resolve to the canonical "project management". This
// makes cross-language extraction AND matching reliable instead of merely deferred.
const SKILL_LEXICON = [
  ['project management', ['project management','gestion de projet','gestion de projets','conduite de projet','gestion de proyectos','projektmanagement','gestao de projetos','gestione progetti','projectmanagement']],
  ['program management', ['program management','gestion de programme','gestion de programa','programmmanagement']],
  ['team management', ['team management','people management','gestion d equipe','management d equipe','encadrement d equipe','encadrement','gestion de equipos','teamfuhrung','gestao de equipe','gestione del team','teammanagement']],
  ['leadership', ['leadership','liderazgo','lideranca','fuhrung','leiderschap']],
  ['communication', ['communication','comunicacion','kommunikation','comunicacao','comunicazione','communicatie']],
  ['customer relationship', ['customer relationship','relation client','relation clients','gestion de la relation client','customer relationship management','crm','atencion al cliente','relacion con el cliente','kundenbeziehung','relacionamento com o cliente']],
  ['customer service', ['customer service','service client','service clients','servicio al cliente','kundenservice','atendimento ao cliente','assistenza clienti','klantenservice']],
  ['sales', ['sales','vente','ventes','ventas','vertrieb','vendas','vendite','verkoop']],
  ['business development', ['business development','developpement commercial','developpement des affaires','desarrollo de negocio','geschaftsentwicklung','desenvolvimento de negocios','sviluppo commerciale']],
  ['marketing', ['marketing','mercadeo','mercadotecnia']],
  ['digital marketing', ['digital marketing','marketing digital','marketing numerique','digitales marketing']],
  ['accounting', ['accounting','comptabilite','contabilidad','buchhaltung','contabilidade','contabilita','boekhouding']],
  ['finance', ['finance','finanzas','finanzen','financas','financa','finanza','financien']],
  ['budget management', ['budget management','gestion budgetaire','gestion du budget','gestion de presupuesto','budgetverwaltung','gestao orcamentaria']],
  ['profit and loss management', ['profit and loss','p l management','p l ownership','compte de resultat','perdidas y ganancias','gewinn und verlust','demonstracao de resultados']],
  ['human resources', ['human resources','ressources humaines','recursos humanos','personalwesen','risorse umane','personeelszaken']],
  ['recruitment', ['recruitment','recruiting','recrutement','reclutamiento','rekrutierung','recrutamento','reclutamento','werving']],
  ['training', ['training','formation','formacion','schulung','formacao','formazione','opleiding']],
  ['negotiation', ['negotiation','negociation','negociacion','verhandlung','negociacao','negoziazione','onderhandeling']],
  ['problem solving', ['problem solving','resolution de problemes','resolucion de problemas','problemlosung','resolucao de problemas','problem-solving','probleemoplossing']],
  ['data analysis', ['data analysis','analyse de donnees','analisis de datos','datenanalyse','analise de dados','analisi dei dati','data-analyse']],
  ['strategy', ['strategy','strategie','estrategia','strategia']],
  ['consulting', ['consulting','conseil','consultoria','beratung','consulenza','advies']],
  ['digital transformation', ['digital transformation','transformation digitale','transformation numerique','transformacion digital','digitale transformation','transformacao digital','trasformazione digitale','digitale transformatie']],
  ['agile', ['agile','agil','methode agile','metodologia agil','metodo agile']],
  ['scrum', ['scrum']],
  ['software development', ['software development','developpement logiciel','desarrollo de software','softwareentwicklung','desenvolvimento de software','sviluppo software','softwareontwikkeling']],
  ['web development', ['web development','developpement web','desarrollo web','webentwicklung','desenvolvimento web','sviluppo web','webontwikkeling']],
  ['quality assurance', ['quality assurance','assurance qualite','controle qualite','aseguramiento de la calidad','qualitatssicherung','garantia de qualidade','controllo qualita']],
  ['supply chain', ['supply chain','chaine d approvisionnement','chaine logistique','cadena de suministro','lieferkette','cadeia de suprimentos','catena di fornitura','toeleveringsketen']],
  ['logistics', ['logistics','logistique','logistica','logistik','logistiek']],
  ['procurement', ['procurement','purchasing','achats','approvisionnement','compras','einkauf','beschaffung','acquisti','inkoop']],
  ['audit', ['audit','auditoria','auditing','wirtschaftsprufung']],
  ['reporting', ['reporting','reportes','informes','berichterstattung','relatorios','rapportage']],
  ['teamwork', ['teamwork','travail d equipe','travail en equipe','trabajo en equipo','teamarbeit','trabalho em equipe','lavoro di squadra','samenwerking']],
  ['autonomy', ['autonomy','autonomie','autonomia']],
  ['project planning', ['project planning','planification','planificacion','planejamento','pianificazione','planung']],
  ['risk management', ['risk management','gestion des risques','gestion de riesgos','risikomanagement','gestao de riscos','gestione del rischio','risicomanagement']],
  ['change management', ['change management','conduite du changement','gestion du changement','gestion del cambio','anderungsmanagement','gestao da mudanca','gestione del cambiamento','verandermanagement']],
  ['product management', ['product management','gestion de produit','gestion de producto','produktmanagement','gestao de produto','product owner']],
  ['stakeholder management', ['stakeholder management','gestion des parties prenantes','gestion de partes interesadas','stakeholdermanagement']],
  ['presentation', ['presentation','presentaciones','prasentation','apresentacao','presentazione','presentatie']],
  ['business analysis', ['business analysis','analyse metier','analyse fonctionnelle','analisis de negocio','geschaftsanalyse','analise de negocios']],
  ['account management', ['account management','gestion de comptes','gestion de cuentas','kundenbetreuung','gestao de contas','gestione clienti']],
  ['pre-sales', ['pre-sales','presales','avant-vente','preventa','vorverkauf','prevendita']],
  ['mentoring', ['mentoring','mentorat','mentoria','mentoring']],
  ['process improvement', ['process improvement','amelioration des processus','mejora de procesos','prozessverbesserung','melhoria de processos','miglioramento dei processi']],
  ['compliance', ['compliance','conformite','cumplimiento','conformidade','conformita','naleving']],
  // Data / AI
  ['machine learning', ['machine learning','apprentissage automatique','aprendizaje automatico','maschinelles lernen','aprendizado de maquina','apprendimento automatico']],
  ['artificial intelligence', ['artificial intelligence','intelligence artificielle','inteligencia artificial','kunstliche intelligenz','inteligencia artificial','intelligenza artificiale']],
  ['data science', ['data science','science des donnees','ciencia de datos','datenwissenschaft','ciencia de dados']],
  ['data engineering', ['data engineering','ingenierie des donnees','ingenieria de datos','dateningenieurwesen']],
  ['business intelligence', ['business intelligence','informatique decisionnelle','inteligencia de negocios','geschaftsanalytik']],
  ['statistics', ['statistics','statistiques','estadistica','statistik','estatistica','statistica']],
  ['data visualization', ['data visualization','visualisation de donnees','visualizacion de datos','datenvisualisierung','visualizacao de dados']],
  ['etl', ['etl','extract transform load','extraction transformation chargement']],
  // Software / engineering
  ['object oriented programming', ['object oriented programming','programmation orientee objet','programacion orientada a objetos','objektorientierte programmierung']],
  ['microservices', ['microservices','microservicios','mikroservices','microsservicos']],
  ['system design', ['system design','conception de systemes','diseno de sistemas','systemdesign']],
  ['mobile development', ['mobile development','developpement mobile','desarrollo movil','mobile entwicklung','desenvolvimento mobile']],
  ['version control', ['version control','gestion de versions','control de versiones','versionskontrolle','git']],
  ['testing', ['testing','tests','pruebas','softwaretest','automated testing','tests automatises']],
  ['debugging', ['debugging','debogage','depuracion','fehlerbehebung']],
  ['code review', ['code review','revue de code','revision de codigo','code-review']],
  ['data structures', ['data structures','structures de donnees','estructuras de datos','datenstrukturen']],
  // Marketing / sales / content
  ['seo', ['seo','search engine optimization','referencement naturel','optimizacion de motores de busqueda','suchmaschinenoptimierung']],
  ['content marketing', ['content marketing','marketing de contenu','marketing de contenidos','content-marketing','marketing de conteudo']],
  ['social media', ['social media','reseaux sociaux','redes sociales','soziale medien','midias sociais','social media management']],
  ['copywriting', ['copywriting','redaction publicitaire','redaccion publicitaria','texterstellung','redacao']],
  ['brand management', ['brand management','gestion de marque','gestion de marca','markenmanagement','gestao de marca']],
  ['market research', ['market research','etude de marche','investigacion de mercado','marktforschung','pesquisa de mercado']],
  ['email marketing', ['email marketing','marketing par email','marketing por correo','e-mail-marketing']],
  ['lead generation', ['lead generation','generation de leads','generacion de leads','leadgenerierung']],
  // Finance / legal / operations
  ['financial analysis', ['financial analysis','analyse financiere','analisis financiero','finanzanalyse','analise financeira']],
  ['financial modeling', ['financial modeling','modelisation financiere','modelado financiero','finanzmodellierung']],
  ['forecasting', ['forecasting','prevision','pronostico','prognose','previsao']],
  ['tax', ['tax','fiscalite','impuestos','steuern','impostos','taxation']],
  ['treasury', ['treasury','tresorerie','tesoreria','finanzwesen']],
  ['legal', ['legal','juridique','juridico','rechtlich','legale','contract law','droit des contrats']],
  ['operations management', ['operations management','gestion des operations','gestion de operaciones','betriebsmanagement','gestao de operacoes']],
  ['inventory management', ['inventory management','gestion des stocks','gestion de inventario','bestandsmanagement','gestao de estoque']],
  ['vendor management', ['vendor management','gestion des fournisseurs','gestion de proveedores','lieferantenmanagement']],
  // Healthcare / education / people
  ['patient care', ['patient care','soins aux patients','atencion al paciente','patientenversorgung','cuidados ao paciente']],
  ['clinical', ['clinical','clinique','clinico','klinisch','clinico']],
  ['nursing', ['nursing','soins infirmiers','enfermeria','krankenpflege','enfermagem']],
  ['teaching', ['teaching','enseignement','ensenanza','lehre','ensino','docencia']],
  ['curriculum development', ['curriculum development','conception pedagogique','desarrollo curricular','lehrplanentwicklung']],
  ['coaching', ['coaching','accompagnement','entrenamiento','begleitung']],
  ['performance management', ['performance management','gestion de la performance','gestion del desempeno','leistungsmanagement','gestao de desempenho']],
  // Design / product / cross-functional
  ['ux design', ['ux design','user experience','experience utilisateur','experiencia de usuario','nutzererfahrung','experiencia do usuario']],
  ['ui design', ['ui design','user interface','interface utilisateur','interfaz de usuario','benutzeroberflache']],
  ['graphic design', ['graphic design','design graphique','diseno grafico','grafikdesign','design grafico']],
  ['product design', ['product design','design produit','diseno de producto','produktdesign']],
  ['roadmap', ['roadmap','feuille de route','hoja de ruta','produkt-roadmap']],
  ['kpi', ['kpi','key performance indicators','indicateurs de performance','indicadores de desempeno','leistungskennzahlen']],
  ['time management', ['time management','gestion du temps','gestion del tiempo','zeitmanagement','gestao do tempo']],
  ['adaptability', ['adaptability','adaptabilite','adaptabilidad','anpassungsfahigkeit','adaptabilidade']],
  ['critical thinking', ['critical thinking','esprit critique','pensamiento critico','kritisches denken','pensamento critico']],
  ['attention to detail', ['attention to detail','souci du detail','atencion al detalle','liebe zum detail','atencao aos detalhes']]
]

// All language-neutral canonical skills (tech + multilingual lexicon). A required
// skill that maps to one of these is "known" — trustworthy regardless of the job's
// language — versus a raw prose n-gram guessed out of a sentence.
const KNOWN_CANONICAL_SKILLS = new Set([
  ...TECH_PATTERNS.map(term => term),
  ...SKILL_LEXICON.map(([canonical]) => canonical)
])

const PAGE_NOISE_PATTERNS = [
  'sign in','sign up','sign in to','sign in to continue','continue to join','join now','join linkedin','authwall','login','log in','create account','privacy policy','cookie policy','cookies policy','user agreement','terms of service','terms and conditions','community of','jobs people learning','skip to main content','open app','download app','followers','connections','1 week ago','2 weeks ago','3 weeks ago','posted on','promoted','save job','show more','show less','see who','applicants','be among the first','share this job','copy link','of madrid spain','madrid community of'
]

function normalizeText(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9+#./\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// True when a token is really part of a URL / tracking query-string / percent-encoding
// rather than a job skill. Failed restricted-board extractions (e.g. a LinkedIn redirect
// page) leave the raw URL behind, and `https://fr.linkedin.com/jobs/view/441...?trk=...`
// decodes into tokens like "https", "www.linkedin.com", "3a", "2f", "trk", "aero-v1".
function looksLikeUrlNoise(term = '') {
  const t = normalizeText(term)
  if (!t) return true
  if (/\b(https?|www|ftp)\b/.test(t)) return true
  if (/[a-z0-9-]+\.(com|net|org|io|ai|co|app|dev|fr|uk|de|es|eu|us|nl|it|pt|ca)\b/.test(t)) return true
  if (/linkedin|indeed|glassdoor|welcometothejungle|workday/.test(t)) return true
  if (/\b[0-9a-f]?2f[a-z0-9]*\b/.test(t)) return true   // %2F leftovers: 2f, 2fwww, 2fjobs, 2ffr
  if (/\b3a\b/.test(t)) return true                     // %3A leftover (the ":" in "https://")
  if (/\b(trk|utm[_a-z]*|ref|aero(-v\d+)?|sessionid|gclid|fbclid)\b/.test(t)) return true
  if (/\b\d{5,}\b/.test(t)) return true                 // long numeric ids (job ids)
  return false
}

function unique(items) {
  return [...new Set(items.filter(Boolean).map(item => String(item).trim()).filter(Boolean))]
}

const LANGUAGE_LABELS = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', pt: 'Portuguese', it: 'Italian', nl: 'Dutch' }

const LANGUAGE_MARKERS = {
  en: ['the','and','with','your','you','our','this','that','from','have','will','are','for','team','experience','requirements','responsibilities','role','skills','about','join','looking','years','strong'],
  fr: ['le','la','les','des','vous','nous','votre','notre','pour','dans','avec','une','poste','mission','equipe','recherchons','candidat','profil','sein','entreprise','competences','annees','et'],
  es: ['el','la','los','las','de','que','para','con','su','una','somos','equipo','experiencia','requisitos','empresa','trabajo','buscamos','anos','habilidades','y'],
  de: ['der','die','das','und','sie','mit','fur','ein','eine','wir','ihre','unternehmen','erfahrung','anforderungen','suchen','aufgaben','kenntnisse','jahre'],
  pt: ['o','a','os','as','de','que','para','com','uma','voce','equipe','experiencia','requisitos','empresa','trabalho','somos','procuramos','anos','habilidades','e'],
  it: ['il','la','le','gli','di','che','per','con','una','sei','esperienza','requisiti','azienda','cerchiamo','lavoro','competenze','anni'],
  nl: ['het','een','en','van','voor','met','je','jouw','wij','ons','ervaring','vereisten','bedrijf','baan','zoeken','vaardigheden','jaar']
}

export function detectTextLanguage(text = '') {
  const words = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length < 20) return { code: 'unknown', label: null }

  let best = { code: 'unknown', score: 0 }
  for (const [code, markers] of Object.entries(LANGUAGE_MARKERS)) {
    const markerSet = new Set(markers)
    const score = words.reduce((sum, word) => sum + (markerSet.has(word) ? 1 : 0), 0)
    if (score > best.score) best = { code, score }
  }

  if (best.score < 4 || best.score / words.length < 0.015) return { code: 'unknown', label: null }
  return { code: best.code, label: LANGUAGE_LABELS[best.code] }
}

function canonicalSkill(term = '') {
  const normalized = normalizeText(term)
  for (const [canonical, synonyms] of SKILL_SYNONYMS) {
    if (normalized === canonical || synonyms.some(syn => normalized === normalizeText(syn))) return canonical
  }
  for (const [canonical, forms] of SKILL_LEXICON) {
    if (normalized === canonical || forms.some(form => normalized === normalizeText(form))) return canonical
  }
  return normalized
}

// Find which canonical lexicon skills appear in the text, in any supported language.
// Used alongside TECH_PATTERNS so multilingual business/soft skills extract cleanly
// instead of leaking through as prose fragments.
function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lexiconSkillsIn(text = '') {
  const normalized = normalizeText(text)
  const found = []
  for (const [canonical, forms] of SKILL_LEXICON) {
    // Match on alphanumeric word boundaries so adjacent punctuation (e.g. a trailing
    // "." that normalizeText keeps for tokens like "node.js") doesn't hide a skill.
    if (forms.some(form => {
      const f = normalizeText(form)
      return f && new RegExp(`(^|[^a-z0-9])${escapeRegExp(f)}([^a-z0-9]|$)`).test(normalized)
    })) found.push(canonical)
  }
  return found
}

function isNoiseTerm(term = '') {
  const normalized = normalizeText(term)
  if (!normalized || normalized.length < 3) return true
  if (looksLikeUrlNoise(normalized)) return true
  if (PAGE_NOISE_PATTERNS.some(pattern => normalized.includes(normalizeText(pattern)))) return true
  if (/^\d+\s+(day|days|week|weeks|month|months|hour|hours)\s+ago$/.test(normalized)) return true
  if (/^(of|in|at|to|for|from)\s+/.test(normalized) && normalized.split(' ').length <= 4) return true
  if (['privacy','policy','cookie','cookies','terms','agreement','community','madrid','spain','join','continue','signin','login'].includes(normalized)) return true
  return false
}

function containsTerm(text, term) {
  const normalizedText = ` ${normalizeText(text)} `
  const normalizedTerm = normalizeText(term)
  if (!normalizedTerm) return false
  const terms = [normalizedTerm]
  for (const [canonical, synonyms] of SKILL_SYNONYMS) {
    if (normalizedTerm === canonical || synonyms.some(syn => normalizedTerm === normalizeText(syn))) {
      terms.push(canonical, ...synonyms.map(normalizeText))
    }
  }
  // Cross-language equivalence: matching a canonical skill should match any of its
  // surface forms in the text, so an English required skill hits a French CV (or vice versa).
  for (const [canonical, forms] of SKILL_LEXICON) {
    if (normalizedTerm === canonical || forms.some(form => normalizedTerm === normalizeText(form))) {
      terms.push(canonical, ...forms.map(normalizeText))
    }
  }
  return unique(terms).some(candidate => normalizedText.includes(` ${candidate} `) || normalizedText.includes(candidate))
}

export function validateJobTextQuality(jobText = '', { source = 'paste', url = '' } = {}) {
  const raw = String(jobText || '').trim()
  const normalized = normalizeText(raw)
  const hardReasons = []
  const softReasons = []
  const lowerUrl = String(url || '').toLowerCase()
  const isUrl = source === 'url'
  const restricted = ['linkedin.', 'indeed.', 'glassdoor.', 'workday', 'welcometothejungle.com'].some(domain => lowerUrl.includes(domain))

  if (raw.length < 450) softReasons.push('The extracted job text is too short to score accurately.')
  if (normalized.length < 300) softReasons.push('The extracted job text has too little readable content.')

  // Only genuine anti-bot / login-wall / JS-shell signals belong here, since a
  // match HARD-blocks the analysis. Generic footer phrases like "privacy policy"
  // or "user agreement" appear on legitimate job pages too, so they are handled
  // as soft PAGE_NOISE_PATTERNS instead of hard blockers (see #70 regression).
  const blockedPatterns = [
    'enable javascript','please enable javascript','sign in to continue','login to continue','cookies must be enabled','access denied','are you a human','captcha','bot detection','cloudflare','temporarily unavailable','just a moment','error 403','forbidden','continue to join','join linkedin','sign in join now'
  ]
  if (blockedPatterns.some(pattern => normalized.includes(normalizeText(pattern)))) hardReasons.push('The URL appears to return a login, JavaScript, cookie, or anti-bot page instead of the job description.')

  const sectionHits = [
    'responsibilities','missions','mission','requirements','qualifications','profile','profil','skills','competences','compétences','experience','expérience','about the role','what you will do','your role','le poste','vos missions','what you bring','required skills','job description','responsabilites','requis'
  ].filter(term => normalized.includes(normalizeText(term))).length

  const actionWordHits = [
    'manage','lead','support','deploy','configure','maintain','monitor','implement','coordinate','develop','design','deliver','analyze','secure','migrate','pilot','gérer','piloter','déployer','configurer','maintenir','coordonner','analyser','sécuriser','build','own','operate','supervise','administer'
  ].filter(term => normalized.includes(normalizeText(term))).length

  if (sectionHits < 2 && actionWordHits < 4) softReasons.push('The extracted text does not contain enough visible responsibilities or requirements.')

  const navNoiseHits = PAGE_NOISE_PATTERNS.filter(term => normalized.includes(normalizeText(term))).length
  const meaningfulJobSignals = sectionHits + actionWordHits
  if (navNoiseHits >= 3 && meaningfulJobSignals < 8) softReasons.push('The extracted text looks more like page navigation or login content than a real job posting.')
  if (restricted && isUrl && navNoiseHits >= 2 && raw.length < 2200) softReasons.push('This restricted job board returned partial or noisy content instead of the full job description.')
  if (restricted && isUrl && sectionHits < 3 && actionWordHits < 7) softReasons.push('This restricted job board did not expose enough job responsibilities or requirements to score reliably.')

  // A failed restricted-board extraction (e.g. a LinkedIn redirect/login page) leaves
  // mostly the raw URL + tracking params behind, which would otherwise be scored as if
  // the query-string were job "keywords". If the readable text is dominated by URL noise
  // and carries almost no real job signal, treat it as unusable rather than score junk.
  const words = normalized.split(' ').filter(Boolean)
  const urlNoiseWords = words.filter(word => looksLikeUrlNoise(word)).length
  const urlNoiseRatio = words.length ? urlNoiseWords / words.length : 0
  if (urlNoiseRatio >= 0.25 && meaningfulJobSignals < 6) hardReasons.push('The extracted content is mostly a link/redirect rather than the job description itself.')
  // Anything this short never contains a scorable job description, so block it even for
  // URLs (soft "too short" issues otherwise pass through for URL sources).
  if (raw.length < 220) hardReasons.push('The extracted job text is too short to contain a real job description — the page likely returned a redirect or login wall.')

  const reasons = [...hardReasons, ...softReasons]
  const ok = reasons.length === 0
  // URL extractions are mostly out of the user's control, so only hard-block on
  // unusable content (anti-bot/login pages). Soft quality issues still get
  // surfaced via `quality`/`reasons`, but the analysis still runs. Pasted text
  // is fully within the user's control, so soft issues block it too.
  const blocked = hardReasons.length > 0 || (!isUrl && softReasons.length > 0)
  const quality = ok && raw.length >= 1800 && sectionHits >= 3 ? 'strong' : ok ? 'partial' : 'thin'

  return {
    ok,
    blocked,
    quality,
    reasons,
    source,
    restricted,
    minRecommendedChars: 450,
    message: ok ? null : restricted || isUrl
      ? 'We could not reliably extract the full job description from this URL. Paste the full job description in Accurate paste mode for a trustworthy ATS score.'
      : 'The pasted job description is too short or incomplete. Paste the full responsibilities and requirements for an accurate ATS score.'
  }
}

export function extractSkillTerms(text = '', limit = 18) {
  const normalized = normalizeText(text)
  // Only recognized, canonical skills are returned: known tech (TECH_PATTERNS) and the
  // multilingual lexicon. We deliberately do NOT guess skills from raw prose n-grams —
  // those produced misleading junk like "technology -strategy" or "v beta t" in any
  // language. A clean short list beats a noisy long one; recall is grown by the lexicon
  // (and the AI step), not by scraping sentence fragments.
  const foundPatterns = TECH_PATTERNS.filter(term => containsTerm(normalized, term))
  const foundLexicon = lexiconSkillsIn(normalized)

  const scored = new Map()
  for (const term of [...foundPatterns, ...foundLexicon]) {
    const canonical = canonicalSkill(term)
    if (!canonical || isNoiseTerm(canonical) || COMMON_STOPWORDS.has(canonical)) continue
    scored.set(canonical, (scored.get(canonical) || 0) + 1)
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term)
    .slice(0, limit)
}

export function estimateYears(text = '') {
  const normalized = normalizeText(text)
  const explicit = [...normalized.matchAll(/(\d{1,2})\s*\+?\s*(?:years|ans|annees|anos|jahre|anni|jaar)/g)]
    .map(match => Number.parseInt(match[1], 10))
    .filter(Number.isFinite)
  if (explicit.length) return Math.max(...explicit)

  const years = [...normalized.matchAll(/\b(20\d{2}|19\d{2})\b/g)].map(match => Number.parseInt(match[1], 10))
  if (years.length >= 2) {
    const min = Math.min(...years)
    const max = Math.max(...years, new Date().getFullYear())
    return Math.max(0, Math.min(30, max - min))
  }
  return 0
}

function scoreExperience(candidateYears, requiredYears) {
  if (!requiredYears) return 80
  if (candidateYears >= requiredYears) return 100
  if (candidateYears >= requiredYears - 1) return 75
  if (candidateYears >= Math.max(1, requiredYears * 0.6)) return 55
  return 25
}

function scoreSeniority(candidateYears, requiredYears) {
  if (!requiredYears || !candidateYears) return 65
  const diff = candidateYears - requiredYears
  if (diff >= 0 && diff <= 5) return 90
  if (diff > 5) return 75
  if (diff >= -1) return 70
  if (diff >= -3) return 45
  return 25
}

// Pure scoring math, shared by the live score and the improvement simulator so a
// "what if I add this skill" projection uses the exact same formula as the real score.
function computeAtsScores(matchedCount, requiredCount, missingCount, experienceScore, seniorityScore) {
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)))
  const keywordScore = requiredCount ? Math.round((matchedCount / requiredCount) * 100) : 50
  const semanticScore = Math.round((keywordScore * 0.65) + (experienceScore * 0.35))
  const criticalGapPenalty = Math.min(20, Math.min(Math.max(0, missingCount), 4) * 5)
  const displayScore = clamp(
    keywordScore * 0.35 +
    experienceScore * 0.30 +
    semanticScore * 0.20 +
    seniorityScore * 0.10 +
    70 * 0.05 -
    criticalGapPenalty
  )
  const matchProbability = clamp(
    keywordScore * 0.20 +
    experienceScore * 0.30 +
    semanticScore * 0.25 +
    seniorityScore * 0.25 -
    criticalGapPenalty * 0.5
  )
  const verdict = displayScore >= 75 ? 'likely_passed' : displayScore >= 55 ? 'borderline' : 'likely_filtered'
  return { keywordScore, semanticScore, criticalGapPenalty, displayScore, matchProbability, verdict }
}

// Borderline = considered by an ATS/recruiter; interview = comfortably passes the filter.
const CONSIDERED_THRESHOLD = 55
const INTERVIEW_THRESHOLD = 75

// Project how the score would move if the candidate evidenced the missing skills, using
// the real scoring formula. The engine weights all skills equally, so we don't fake
// per-skill rankings; instead we report the cumulative path and how many skills are
// needed to cross each threshold — and honestly flag when skills alone can't get there
// (because the remaining gap is experience/seniority, not keywords).
export function simulateImprovements(ats) {
  const requiredCount = ats.requiredSkills.length
  const baseMatched = ats.matchedSkills.length
  const baseMissing = ats.missingSkills.length
  const current = ats.displayScore
  if (!requiredCount || baseMissing === 0) {
    return { current_score: current, addressable_skills: [], per_skill_points: 0, max_projected_score: current, to_considered: null, to_interview: null }
  }

  // Cumulative path: evidence missing skills one at a time, recomputing each step.
  const ordered = [...ats.missingSkills]
  const cumulative = ordered.map((skill, index) => {
    const added = index + 1
    const s = computeAtsScores(baseMatched + added, requiredCount, baseMissing - added, ats.experienceScore, ats.seniorityScore)
    return { skill, skills_addressed: added, projected_score: s.displayScore, verdict: s.verdict }
  })
  const maxProjected = cumulative[cumulative.length - 1].projected_score
  const firstStepGain = Math.max(0, cumulative[0].projected_score - current)

  const reach = threshold => {
    if (current >= threshold) return null
    const hit = cumulative.find(step => step.projected_score >= threshold)
    return hit
      ? { reachable: true, skills_needed: hit.skills_addressed, projected_score: hit.projected_score, skills: ordered.slice(0, hit.skills_addressed) }
      : { reachable: false, projected_score: maxProjected }
  }

  return {
    current_score: current,
    addressable_skills: ordered,
    per_skill_points: firstStepGain,
    max_projected_score: maxProjected,
    to_considered: reach(CONSIDERED_THRESHOLD),
    to_interview: reach(INTERVIEW_THRESHOLD)
  }
}

// One plain-language sentence explaining the verdict in terms of concrete strengths/gaps.
function describeScore({ verdict, keywordScore, experienceScore, seniorityScore }) {
  const strengths = []
  const gaps = []
  if (keywordScore >= 70) strengths.push('strong skill/keyword overlap')
  else if (keywordScore < 50) gaps.push('several required skills are missing')
  if (experienceScore >= 75) strengths.push('enough years of experience')
  else if (experienceScore < 55) gaps.push('less experience than the role asks for')
  if (seniorityScore >= 75) strengths.push('a seniority level that fits')
  else if (seniorityScore < 50) gaps.push('a seniority mismatch')
  const lead = verdict === 'likely_passed'
    ? 'You likely pass the ATS filter for this role.'
    : verdict === 'borderline'
      ? 'You are a borderline fit — an ATS or recruiter could go either way.'
      : 'You would likely be filtered out by an ATS for this role.'
  const s = strengths.length ? ` Strengths: ${strengths.join(', ')}.` : ''
  const g = gaps.length ? ` Main gaps: ${gaps.join(', ')}.` : ''
  return `${lead}${s}${g}`.trim()
}

// Coercion helpers + a normalizer that guarantees the analysis object always has the
// full expected shape with safe defaults, so a partial/malformed AI response can never
// leave the UI rendering blanks or crashing on undefined.
const asStr = (value, fallback = '') => (typeof value === 'string' && value.trim() ? value : fallback)
const asArr = value => (Array.isArray(value) ? value : [])
const asObj = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

export function normalizeAnalysisShape(analysis) {
  const a = asObj(analysis)
  return {
    ...a,
    job_context: { title: 'Not specified', company: 'Not specified', location: 'Not specified', work_mode: 'unknown', contract_type: 'unknown', salary_range: 'Not specified', experience_required: 'Not specified', languages_required: [], apply_url: null, easy_apply: false, hiring_contact: null, hiring_contact_linkedin: null, ...asObj(a.job_context) },
    job_sections: { about_company: null, about_role: null, key_responsibilities: [], key_requirements: [], benefits: null, ...asObj(a.job_sections) },
    job_summary: asStr(a.job_summary),
    match_reasoning: asStr(a.match_reasoning),
    recruiter_shortlist: { probability: 0, verdict: 'possible_shortlist', reason: '', top_screening_factors: [], likely_recruiter_concerns: [], ...asObj(a.recruiter_shortlist) },
    next_best_action: { action: '', label: '', reason: '', steps: [], ...asObj(a.next_best_action) },
    confidence: { level: 'low', score: 0, reasons: [], job_text_quality: 'partial', cv_text_quality: 'partial', ...asObj(a.confidence) },
    semantic_fit: { score: 0, matched_responsibilities: [], weak_or_missing_responsibilities: [], domain_fit: 'moderate', domain_reason: '', ...asObj(a.semantic_fit) },
    requirements_coverage: asArr(a.requirements_coverage),
    experience_depth: { score: 0, hands_on: 'unclear', leadership: 'unclear', scale: 'unclear', metrics: 'unclear', ownership: 'unclear', proof_summary: '', ...asObj(a.experience_depth) },
    proof_gaps: asArr(a.proof_gaps),
    hidden_expectations: asArr(a.hidden_expectations),
    red_flags: asArr(a.red_flags),
    salary_assessment: { specified: false, assessment: 'unknown', comment: '', ...asObj(a.salary_assessment) },
    verdict: asStr(a.verdict),
    overall_reason: asStr(a.overall_reason),
    format_warnings: asArr(a.format_warnings),
    quick_wins: asArr(a.quick_wins),
    jobseeker_strategy: { apply_message_angle: '', follow_up_timing: '', questions_to_ask_recruiter: [], skip_reason: null, ...asObj(a.jobseeker_strategy) },
    interview_prep: { show_prep: true, likely_questions: [], your_edges: [], weak_spots: [], salary_negotiation_hint: '', ...asObj(a.interview_prep) }
  }
}

export function buildDeterministicAts(jobText = '', cvText = '') {
  const requiredSkills = extractSkillTerms(jobText, 22)
  const candidateSkills = extractSkillTerms(cvText, 40)
  const matched = []
  const missing = []

  for (const required of requiredSkills) {
    const candidateMatch = candidateSkills.find(skill => canonicalSkill(skill) === canonicalSkill(required) || containsTerm(cvText, required) || containsTerm(required, skill))
    if (candidateMatch || containsTerm(cvText, required)) matched.push({ required_skill: required, matched_candidate_skill: candidateMatch || required })
    else missing.push(required)
  }

  const candidateYears = estimateYears(cvText)
  const requiredYears = estimateYears(jobText)
  const experienceScore = scoreExperience(candidateYears, requiredYears)
  const seniorityScore = scoreSeniority(candidateYears, requiredYears)
  const scores = computeAtsScores(matched.length, requiredSkills.length, missing.length, experienceScore, seniorityScore)
  const { keywordScore, semanticScore, displayScore, verdict } = scores

  // Decide whether the keyword overlap is trustworthy enough to drive the headline
  // score. It is NOT when the job and CV are in different languages (literal matching
  // breaks) or when extraction found few genuine skills (known tech terms or crisp
  // single-word skills) versus prose fragments. In those cases the caller should
  // defer to the AI's semantic read instead of this keyword estimate.
  const jobLang = detectTextLanguage(jobText)
  const cvLang = detectTextLanguage(cvText)
  const languageMismatch = jobLang.code !== 'unknown' && cvLang.code !== 'unknown' && jobLang.code !== cvLang.code
  // The multilingual lexicon resolves skills to language-neutral canonicals, so a
  // cross-language job/CV pair is still trustworthy as long as enough required skills
  // map to known canonical skills. Only when too few do (mostly prose fragments) is the
  // keyword signal unreliable and the caller should defer to the AI's semantic read.
  const knownSkillCount = requiredSkills.filter(skill => KNOWN_CANONICAL_SKILLS.has(canonicalSkill(skill))).length
  const keywordSignalReliable = knownSkillCount >= 3

  // match_probability reflects interview chances rather than ATS keyword passthrough,
  // so it leans more on experience/seniority fit and less on raw keyword density.
  const matchProbability = scores.matchProbability

  // Transparent breakdown: how each weighted factor contributes to the headline number,
  // so the score is explainable instead of a black box.
  const scoreBreakdown = [
    { key: 'keywords', label: 'Keyword & skill match', score: keywordScore, weight: 35 },
    { key: 'experience', label: 'Experience fit', score: experienceScore, weight: 30 },
    { key: 'semantic', label: 'Role / semantic fit', score: semanticScore, weight: 20 },
    { key: 'seniority', label: 'Seniority fit', score: seniorityScore, weight: 10 },
    { key: 'baseline', label: 'Baseline', score: 70, weight: 5 }
  ].map(factor => ({ ...factor, points: Math.round((factor.score * factor.weight) / 100 * 10) / 10 }))
  const scoreExplanation = describeScore({ verdict, keywordScore, experienceScore, seniorityScore })

  return {
    deterministic: true,
    requiredSkills,
    candidateSkills,
    matchedSkills: matched,
    missingSkills: missing,
    keywordScore,
    experienceScore,
    seniorityScore,
    semanticScore,
    displayScore,
    matchProbability,
    verdict,
    candidateYears,
    requiredYears,
    languageMismatch,
    keywordSignalReliable,
    criticalGapPenalty: scores.criticalGapPenalty,
    scoreBreakdown,
    scoreExplanation,
    confidence: !keywordSignalReliable ? 'low' : requiredSkills.length >= 6 ? 'medium' : 'low'
  }
}

export function applyDeterministicAts(analysis, jobText = '', cvText = '') {
  const ats = buildDeterministicAts(jobText, cvText)
  // Guarantee a complete, well-typed shape so the UI never renders blanks on a partial
  // or malformed AI response, then overlay the deterministic fields below.
  const merged = normalizeAnalysisShape(analysis)
  const matchedLabels = ats.matchedSkills.map(item => item.required_skill)
  const missingLabels = ats.missingSkills

  // Capture the AI's own read BEFORE we overwrite these fields with deterministic
  // values, so we can defer to it when keyword matching isn't trustworthy.
  const aiSemantic = Number(analysis?.semantic_fit?.score)
  const aiRecruiter = Number(analysis?.recruiter_shortlist?.probability)

  const jobLanguage = detectTextLanguage(jobText)
  const cvLanguage = detectTextLanguage(cvText)
  merged.language_check = {
    job: jobLanguage,
    cv: cvLanguage,
    mismatch: jobLanguage.code !== 'unknown' && cvLanguage.code !== 'unknown' && jobLanguage.code !== cvLanguage.code
  }

  merged.strict_ats_result = {
    ...(merged.strict_ats_result || {}),
    job_requirements: {
      ...(merged.strict_ats_result?.job_requirements || {}),
      required_skills: ats.requiredSkills,
      minimum_years_experience: ats.requiredYears
    },
    candidate_profile: {
      ...(merged.strict_ats_result?.candidate_profile || {}),
      candidate_skills: ats.candidateSkills,
      total_years_experience: ats.candidateYears
    },
    analysis: {
      ...(merged.strict_ats_result?.analysis || {}),
      matched_skills: ats.matchedSkills,
      missing_skills: missingLabels,
      experience_gap_years: Math.max(0, ats.requiredYears - ats.candidateYears)
    }
  }

  merged.display_score = ats.displayScore
  merged.match_probability = ats.matchProbability
  merged.overall_verdict = ats.verdict
  merged.keyword_match = {
    ...(merged.keyword_match || {}),
    score: ats.keywordScore,
    found: matchedLabels.slice(0, 10),
    missing_required: missingLabels.slice(0, 8)
  }
  merged.requirements_check = {
    ...(merged.requirements_check || {}),
    score: ats.experienceScore,
    must_have: ats.requiredSkills.slice(0, 12),
    met: matchedLabels.slice(0, 8),
    unmet: missingLabels.slice(0, 8)
  }
  merged.semantic_fit = {
    ...(merged.semantic_fit || {}),
    score: ats.semanticScore,
    matched_responsibilities: matchedLabels.slice(0, 6),
    weak_or_missing_responsibilities: missingLabels.slice(0, 6)
  }
  merged.seniority_fit = {
    ...(merged.seniority_fit || {}),
    score: ats.seniorityScore,
    risk: ats.seniorityScore >= 70 ? 'low' : ats.seniorityScore >= 45 ? 'medium' : 'high'
  }
  merged.seniority = {
    ...(merged.seniority || {}),
    score: ats.seniorityScore,
    risk: ats.seniorityScore >= 70 ? 'low' : ats.seniorityScore >= 45 ? 'medium' : 'high'
  }
  merged.requirements_analysis = {
    ...(merged.requirements_analysis || {}),
    requirements_met: matchedLabels.slice(0, 8),
    requirements_missing: missingLabels.slice(0, 8)
  }
  merged.keywords_analysis = {
    ...(merged.keywords_analysis || {}),
    found_in_cv: matchedLabels.slice(0, 10),
    missing_keywords: missingLabels.slice(0, 10)
  }
  merged.gaps_to_address = unique([...(merged.gaps_to_address || []), ...missingLabels]).slice(0, 8)
  merged.quick_wins = unique([...(merged.quick_wins || []), ...missingLabels.slice(0, 4).map(skill => `Add truthful evidence for ${skill} if you have it.`)]).slice(0, 6)

  // Requirement-by-requirement coverage: prefer the AI's grounded, per-requirement read.
  // When the AI didn't run (or returned none), synthesize a skill-level coverage map from
  // the deterministic match so the user still sees, per required skill, whether their CV
  // shows it and a truthful way to address it.
  const aiCoverage = Array.isArray(analysis?.requirements_coverage)
    ? analysis.requirements_coverage.filter(item => item && typeof item === 'object' && asStr(item.requirement))
    : []
  if (aiCoverage.length) {
    merged.requirements_coverage = aiCoverage.slice(0, 10)
  } else {
    merged.requirements_coverage = [
      ...matchedLabels.map(skill => ({ requirement: skill, status: 'met', evidence: 'Found in your CV.', suggestion: 'Keep it — add a concrete result or metric to make it stronger.' })),
      ...missingLabels.map(skill => ({ requirement: skill, status: 'missing', evidence: '', suggestion: `Add truthful evidence of ${skill} if you have it — a project, tool, or result that shows it.` }))
    ].slice(0, 12)
  }

  merged.keyword_signal_reliable = ats.keywordSignalReliable
  merged.language_check.mismatch = merged.language_check.mismatch || ats.languageMismatch

  if (!ats.keywordSignalReliable) {
    // Keyword overlap can't be trusted here (cross-language or junk extraction), so
    // defer the headline to the AI's semantic read; if the AI didn't run, fall back
    // to language-independent experience/seniority rather than a keyword-tanked score.
    const deferred = Number.isFinite(aiSemantic) && aiSemantic > 0
      ? Math.round(aiSemantic * 0.6 + ats.experienceScore * 0.4)
      : Math.round(ats.experienceScore * 0.5 + ats.seniorityScore * 0.3 + 60 * 0.2)
    merged.display_score = Math.max(0, Math.min(100, deferred))
    merged.match_probability = Number.isFinite(aiRecruiter) && aiRecruiter > 0 ? Math.round(aiRecruiter) : merged.display_score
    merged.overall_verdict = merged.display_score >= 75 ? 'likely_passed' : merged.display_score >= 55 ? 'borderline' : 'likely_filtered'
    // Extraction only ever yields recognized canonical skills now, so the missing list
    // (if any) is clean and genuinely useful guidance — keep it rather than blanking it.
    // The score is still deferred and confidence lowered because keyword *coverage* is thin.
    if (!Number.isFinite(aiSemantic)) merged.confidence = { ...(merged.confidence || {}), level: 'low' }
  }

  // Path-to-interview simulator + transparent breakdown: only attach when the keyword
  // signal is trustworthy, so projections and the breakdown reflect the number shown.
  if (ats.keywordSignalReliable) {
    if (ats.missingSkills.length) merged.improvement_plan = simulateImprovements(ats)
    merged.score_breakdown = ats.scoreBreakdown
    merged.score_penalty = ats.criticalGapPenalty
    merged.score_explanation = ats.scoreExplanation
  }

  return merged
}
