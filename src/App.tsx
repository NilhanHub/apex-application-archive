import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowDownToLine,
  Brain,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Copy,
  Database,
  Download,
  FileSearch,
  FileText,
  Filter,
  Gauge,
  History,
  Import,
  Lock,
  Mail,
  PanelRightOpen,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Users,
  X,
} from 'lucide-react';
import { mockCandidates, importRuns, pipelineStages } from './data/mockCandidates';
import { isFirebaseConfigured } from './firebase/env';
import { runMockAiSearch } from './services/ai';
import { defaultFilters, searchCandidates } from './services/search';
import type { AiSearchResponse, Candidate, PipelineStage, SearchFilters } from './types';

export type View = 'workspace' | 'pipeline' | 'ai' | 'import' | 'settings';
type DetailTab = 'Overview' | 'CV' | 'AI summary' | 'Notes' | 'Raw data';

const stageAccent: Record<PipelineStage, string> = {
  New: 'stage-new',
  Review: 'stage-review',
  Shortlisted: 'stage-shortlisted',
  Contacted: 'stage-contacted',
  Interview: 'stage-interview',
  Hold: 'stage-hold',
  Rejected: 'stage-rejected',
  Placed: 'stage-placed',
};

const savedSearches = [
  'Sales + technical',
  'Singapore education',
  'PLC experience',
  'Needs CV extraction',
  'New applicants this month',
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function fileStatusLabel(status: Candidate['cv']['downloadStatus']) {
  return {
    missing_upload: 'Missing upload',
    url_known: 'URL known',
    downloaded: 'Downloaded',
    text_indexed: 'Text indexed',
    failed: 'Failed',
  }[status];
}

export function getInitialSessionFromSearch(search: string): { user: 'Nilhan' | 'Prashanthi' | null; view: View } {
  const params = new URLSearchParams(search);
  const demoUser = params.get('demo');
  const demoView = params.get('view');

  return {
    user: demoUser === 'Prashanthi' ? 'Prashanthi' : demoUser === 'Nilhan' ? 'Nilhan' : null,
    view: demoView === 'pipeline' || demoView === 'ai' || demoView === 'import' || demoView === 'settings' ? demoView : 'workspace',
  };
}

function exportCandidatesCsv(candidates: Candidate[]) {
  const headers = ['name', 'email', 'phone', 'stage', 'tags', 'submittedAt', 'cvStatus', 'fileName'];
  const rows = candidates.map((candidate) =>
    [
      candidate.fullName,
      candidate.email,
      candidate.phone ?? '',
      candidate.stage,
      candidate.tags.join('; '),
      candidate.submittedAt,
      candidate.cv.downloadStatus,
      candidate.cv.fileName ?? '',
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`),
  );
  const blob = new Blob([[headers.join(','), ...rows.map((row) => row.join(','))].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'apex-talent-candidates.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function LoginScreen({ onLogin }: { onLogin: (name: 'Nilhan' | 'Prashanthi') => void }) {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="brand-mark">
          <Archive size={30} />
        </div>
        <div>
          <p className="eyebrow">Private recruitment archive</p>
          <h1>Apex Talent Archive</h1>
          <p className="muted">Secure candidate search for Apex HRM.</p>
        </div>
        <div className="login-actions">
          <button className="primary-action" onClick={() => onLogin('Nilhan')}>
            <Lock size={18} /> Continue as Nilhan
          </button>
          <button className="secondary-action" onClick={() => onLogin('Prashanthi')}>
            <Users size={18} /> Continue as Prashanthi
          </button>
        </div>
        <div className="security-note">
          <ShieldCheck size={18} />
          <span>Firebase Auth gate ready. Approved users only.</span>
        </div>
      </section>
    </main>
  );
}

function TopNav({
  activeView,
  setActiveView,
  currentUser,
}: {
  activeView: View;
  setActiveView: (view: View) => void;
  currentUser: string;
}) {
  const navItems: Array<[View, string, typeof Search]> = [
    ['workspace', 'Search', Search],
    ['pipeline', 'Pipeline', BriefcaseBusiness],
    ['ai', 'AI search', Brain],
    ['import', 'Import', Import],
    ['settings', 'Settings', Settings],
  ];

  return (
    <header className="topbar">
      <div className="product">
        <div className="product-icon">
          <Archive size={21} />
        </div>
        <div>
          <strong>Apex Talent Archive</strong>
          <span>Recruiter intelligence</span>
        </div>
      </div>
      <nav className="nav-tabs" aria-label="Primary">
        {navItems.map(([view, label, Icon]) => (
          <button key={view} className={activeView === view ? 'active' : ''} onClick={() => setActiveView(view)}>
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="session-pill">
        <span className={isFirebaseConfigured ? 'online-dot' : 'offline-dot'} />
        {currentUser}
      </div>
    </header>
  );
}

function MetricsStrip({ candidates }: { candidates: Candidate[] }) {
  const metrics = [
    ['Total candidates', candidates.length, Users],
    ['New this week', candidates.filter((candidate) => candidate.stage === 'New').length, Gauge],
    ['CVs indexed', candidates.filter((candidate) => candidate.cv.downloadStatus === 'text_indexed').length, FileSearch],
    ['Missing CVs', candidates.filter((candidate) => candidate.cv.downloadStatus === 'missing_upload').length, AlertTriangle],
    ['Shortlisted', candidates.filter((candidate) => candidate.stage === 'Shortlisted').length, Star],
    ['Placed', candidates.filter((candidate) => candidate.stage === 'Placed').length, CheckCircle2],
  ] as const;

  return (
    <section className="metrics-strip" aria-label="Recruiting metrics">
      {metrics.map(([label, value, Icon]) => (
        <div className="metric" key={label}>
          <Icon size={18} />
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function FilterRail({
  filters,
  setFilters,
  tags,
}: {
  filters: SearchFilters;
  setFilters: (filters: SearchFilters) => void;
  tags: string[];
}) {
  return (
    <aside className="filter-rail">
      <div className="rail-title">
        <Filter size={17} />
        <span>Filters</span>
      </div>
      <label>
        Status
        <select value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value as SearchFilters['stage'] })}>
          <option value="all">All stages</option>
          {pipelineStages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </label>
      <label>
        Source form
        <select
          value={filters.sourceForm}
          onChange={(event) => setFilters({ ...filters, sourceForm: event.target.value === 'all' ? 'all' : Number(event.target.value) })}
        >
          <option value="all">All forms</option>
          <option value="2989">Job applications</option>
          <option value="3107">Contact form</option>
        </select>
      </label>
      <label>
        CV status
        <select value={filters.cvStatus} onChange={(event) => setFilters({ ...filters, cvStatus: event.target.value as SearchFilters['cvStatus'] })}>
          <option value="all">Any status</option>
          <option value="missing_upload">Missing upload</option>
          <option value="url_known">URL known</option>
          <option value="downloaded">Downloaded</option>
          <option value="text_indexed">Text indexed</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      <label>
        File type
        <select value={filters.fileType} onChange={(event) => setFilters({ ...filters, fileType: event.target.value as SearchFilters['fileType'] })}>
          <option value="all">Any type</option>
          <option value="pdf">PDF</option>
          <option value="docx">DOCX</option>
          <option value="txt">TXT</option>
          <option value="jpg">JPG</option>
          <option value="png">PNG</option>
        </select>
      </label>
      <label>
        Tags
        <select value={filters.tag} onChange={(event) => setFilters({ ...filters, tag: event.target.value })}>
          <option value="">Any tag</option>
          {tags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </label>
      <label>
        Skill keyword
        <input value={filters.skill} onChange={(event) => setFilters({ ...filters, skill: event.target.value })} placeholder="SQL, sales, QA" />
      </label>
      <label>
        Company keyword
        <input value={filters.company} onChange={(event) => setFilters({ ...filters, company: event.target.value })} placeholder="PLC, Hayleys" />
      </label>
      <label>
        Education keyword
        <input value={filters.education} onChange={(event) => setFilters({ ...filters, education: event.target.value })} placeholder="Singapore" />
      </label>
      <label>
        From
        <input type="date" value={filters.submittedFrom} onChange={(event) => setFilters({ ...filters, submittedFrom: event.target.value })} />
      </label>
      <label>
        To
        <input type="date" value={filters.submittedTo} onChange={(event) => setFilters({ ...filters, submittedTo: event.target.value })} />
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={filters.hasCv} onChange={(event) => setFilters({ ...filters, hasCv: event.target.checked })} />
        Has CV
      </label>
      <label className="toggle-row">
        <input type="checkbox" checked={filters.hasEmail} onChange={(event) => setFilters({ ...filters, hasEmail: event.target.checked })} />
        Has email
      </label>
    </aside>
  );
}

function SearchCommand({
  query,
  setQuery,
  resultCount,
  onAi,
  selectedCount,
  onExport,
}: {
  query: string;
  setQuery: (query: string) => void;
  resultCount: number;
  onAi: () => void;
  selectedCount: number;
  onExport: () => void;
}) {
  return (
    <section className="command-center">
      <div className="search-input-wrap">
        <Search size={20} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search name, email, skill, company, education, or CV text"
          aria-label="Candidate search"
        />
        <kbd>/</kbd>
      </div>
      <div className="command-actions">
        <span className="result-count">{resultCount} matches</span>
        <button className="secondary-action" onClick={onAi}>
          <Sparkles size={17} /> Ask archive
        </button>
        <button className="secondary-action" onClick={onExport}>
          <Download size={17} /> CSV {selectedCount ? `(${selectedCount})` : ''}
        </button>
      </div>
    </section>
  );
}

function CandidateRow({
  candidate,
  reasons,
  snippets,
  isActive,
  isSelected,
  onOpen,
  onToggleSelected,
}: {
  candidate: Candidate;
  reasons: string[];
  snippets: string[];
  isActive: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
}) {
  return (
    <article className={`candidate-row ${isActive ? 'is-active' : ''}`}>
      <input type="checkbox" checked={isSelected} onChange={onToggleSelected} aria-label={`Select ${candidate.fullName}`} />
      <button className="candidate-main" onClick={onOpen}>
        <div className="candidate-head">
          <strong>{candidate.fullName}</strong>
          {candidate.favorite && <Star size={15} className="favorite" fill="currentColor" />}
          <span className={`stage-chip ${stageAccent[candidate.stage]}`}>{candidate.stage}</span>
        </div>
        <div className="candidate-subline">
          <Mail size={14} />
          <span>{candidate.email}</span>
          <span>{formatDate(candidate.submittedAt)}</span>
        </div>
        <p>{snippets[0] ?? candidate.aiSummary.shortSummary}</p>
        <div className="row-tags">
          {candidate.tags.slice(0, 4).map((tag) => (
            <span key={tag}>
              <Tag size={12} />
              {tag}
            </span>
          ))}
        </div>
      </button>
      <div className="row-meta">
        <span className={`cv-pill cv-${candidate.cv.downloadStatus}`}>{fileStatusLabel(candidate.cv.downloadStatus)}</span>
        <span className="reason-pill">{reasons.join(', ')}</span>
        <PanelRightOpen size={18} />
      </div>
    </article>
  );
}

function DetailPanel({
  candidate,
  tab,
  setTab,
  onClose,
  updateStage,
}: {
  candidate: Candidate;
  tab: DetailTab;
  setTab: (tab: DetailTab) => void;
  onClose: () => void;
  updateStage: (stage: PipelineStage) => void;
}) {
  const tabs: DetailTab[] = ['Overview', 'CV', 'AI summary', 'Notes', 'Raw data'];

  return (
    <aside className="detail-panel">
      <header className="detail-header">
        <div>
          <p className="eyebrow">Candidate</p>
          <h2>{candidate.fullName}</h2>
          <span>{candidate.email}</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close profile">
          <X size={20} />
        </button>
      </header>
      <div className="detail-toolbar">
        <button className="secondary-action" onClick={() => navigator.clipboard?.writeText(candidate.email)}>
          <Copy size={16} /> Copy email
        </button>
        <a className="secondary-action" href={`mailto:${candidate.email}`}>
          <Mail size={16} /> Email
        </a>
        <select value={candidate.stage} onChange={(event) => updateStage(event.target.value as PipelineStage)}>
          {pipelineStages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
      </div>
      <nav className="detail-tabs">
        {tabs.map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>
      <section className="detail-body">
        {tab === 'Overview' && (
          <div className="stack">
            <div className="summary-box">
              <Brain size={18} />
              <p>{candidate.aiSummary.shortSummary}</p>
            </div>
            <dl className="profile-grid">
              <div>
                <dt>Phone</dt>
                <dd>{candidate.phone ?? 'Not provided'}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>Form {candidate.formId} / Entry {candidate.entryId}</dd>
              </div>
              <div>
                <dt>Assigned</dt>
                <dd>{candidate.assignedTo ?? 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(candidate.submittedAt)}</dd>
              </div>
            </dl>
            <ChipSection title="Skills" items={candidate.aiSummary.skills} />
            <ChipSection title="Companies" items={candidate.aiSummary.companies} />
            <ChipSection title="Education" items={candidate.aiSummary.education} />
          </div>
        )}
        {tab === 'CV' && (
          <div className="stack">
            <div className="cv-preview">
              <FileText size={42} />
              <strong>{candidate.cv.fileName ?? 'No CV uploaded'}</strong>
              <span>{fileStatusLabel(candidate.cv.downloadStatus)}</span>
            </div>
            <div className="button-grid">
              <button className="primary-action" disabled={candidate.cv.downloadStatus === 'missing_upload'}>
                <FileSearch size={17} /> Preview CV
              </button>
              <button className="secondary-action" disabled={candidate.cv.downloadStatus === 'missing_upload'}>
                <ArrowDownToLine size={17} /> Download CV
              </button>
              <button className="secondary-action" disabled={!candidate.cv.originalUrl}>
                <FileText size={17} /> Open source file
              </button>
              <button className="secondary-action">
                <Brain size={17} /> Re-run extraction
              </button>
            </div>
            <dl className="profile-grid">
              <div>
                <dt>File type</dt>
                <dd>{candidate.cv.fileType?.toUpperCase() ?? 'Unknown'}</dd>
              </div>
              <div>
                <dt>Extraction</dt>
                <dd>{candidate.cv.extractedTextStatus}</dd>
              </div>
              <div>
                <dt>Storage path</dt>
                <dd>{candidate.cv.storagePath ?? 'Not stored yet'}</dd>
              </div>
            </dl>
            <pre className="cv-text">{candidate.cv.extractedText ?? 'No extracted CV text yet.'}</pre>
          </div>
        )}
        {tab === 'AI summary' && (
          <div className="stack">
            <ChipSection title="Strengths" items={candidate.aiSummary.strengths} />
            <ChipSection title="Interview questions" items={candidate.aiSummary.questionsToAsk} />
            <ChipSection title="Missing or unclear" items={candidate.aiSummary.redFlags.length ? candidate.aiSummary.redFlags : ['No flags recorded']} />
            <div className="notice-inline">
              <ShieldCheck size={17} />
              <span>AI assists review. Recruiters remain responsible for decisions.</span>
            </div>
          </div>
        )}
        {tab === 'Notes' && (
          <div className="stack">
            {candidate.notes.length ? (
              candidate.notes.map((note) => (
                <article className="note" key={note.id}>
                  <strong>{note.authorName}</strong>
                  <span>{formatDate(note.createdAt)}</span>
                  <p>{note.body}</p>
                </article>
              ))
            ) : (
              <div className="empty-state">No notes yet.</div>
            )}
            <textarea placeholder="Add internal note" rows={4} />
            <button className="primary-action">
              <ClipboardList size={17} /> Add note
            </button>
          </div>
        )}
        {tab === 'Raw data' && <pre className="raw-json">{JSON.stringify(candidate.rawFields, null, 2)}</pre>}
      </section>
    </aside>
  );
}

function ChipSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="chip-cloud">
        {items.length ? items.map((item) => <span key={item}>{item}</span>) : <span>None recorded</span>}
      </div>
    </section>
  );
}

function WorkspaceView({
  candidates,
  setCandidates,
  setActiveView,
}: {
  candidates: Candidate[];
  setCandidates: (candidates: Candidate[]) => void;
  setActiveView: (view: View) => void;
}) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [selectedId, setSelectedId] = useState(candidates[0]?.id ?? '');
  const [detailTab, setDetailTab] = useState<DetailTab>('Overview');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const tags = useMemo(() => Array.from(new Set(candidates.flatMap((candidate) => candidate.tags))).sort(), [candidates]);
  const results = useMemo(() => searchCandidates(candidates, query, filters), [candidates, filters, query]);
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedId) ?? results[0]?.candidate;

  const updateStage = (stage: PipelineStage) => {
    setCandidates(
      candidates.map((candidate) =>
        candidate.id === selectedCandidate?.id
          ? {
              ...candidate,
              stage,
              updatedAt: new Date().toISOString(),
              activity: [
                {
                  id: `act-${Date.now()}`,
                  type: 'stage_changed',
                  label: `Moved to ${stage}`,
                  createdAt: new Date().toISOString(),
                  actorName: 'Current user',
                },
                ...candidate.activity,
              ],
            }
          : candidate,
      ),
    );
  };

  return (
    <>
      <MetricsStrip candidates={candidates} />
      <SearchCommand
        query={query}
        setQuery={setQuery}
        resultCount={results.length}
        selectedCount={selectedIds.length}
        onAi={() => setActiveView('ai')}
        onExport={() => exportCandidatesCsv(selectedIds.length ? candidates.filter((candidate) => selectedIds.includes(candidate.id)) : results.map((result) => result.candidate))}
      />
      <div className="saved-searches">
        {savedSearches.map((saved) => (
          <button key={saved} onClick={() => setQuery(saved.replace(' + ', ' '))}>
            {saved}
          </button>
        ))}
      </div>
      <main className="workspace-grid">
        <FilterRail filters={filters} setFilters={setFilters} tags={tags} />
        <section className="results-pane">
          <div className="bulk-bar">
            <span>{selectedIds.length ? `${selectedIds.length} selected` : 'Select candidates for bulk actions'}</span>
            <button className="secondary-action" disabled={!selectedIds.length}>
              <Tag size={16} /> Tag
            </button>
            <button className="secondary-action" disabled={!selectedIds.length}>
              <ChevronDown size={16} /> Stage
            </button>
          </div>
          {results.length ? (
            results.map((result) => (
              <CandidateRow
                key={result.candidate.id}
                candidate={result.candidate}
                reasons={result.reasons}
                snippets={result.snippets}
                isActive={selectedCandidate?.id === result.candidate.id}
                isSelected={selectedIds.includes(result.candidate.id)}
                onOpen={() => {
                  setSelectedId(result.candidate.id);
                  setDetailTab('Overview');
                }}
                onToggleSelected={() =>
                  setSelectedIds((ids) =>
                    ids.includes(result.candidate.id) ? ids.filter((id) => id !== result.candidate.id) : [...ids, result.candidate.id],
                  )
                }
              />
            ))
          ) : (
            <div className="empty-state">No candidates match the current filters.</div>
          )}
        </section>
        {selectedCandidate && (
          <DetailPanel
            candidate={selectedCandidate}
            tab={detailTab}
            setTab={setDetailTab}
            onClose={() => setSelectedId('')}
            updateStage={updateStage}
          />
        )}
      </main>
    </>
  );
}

function PipelineView({ candidates, setCandidates }: { candidates: Candidate[]; setCandidates: (candidates: Candidate[]) => void }) {
  const [draggingId, setDraggingId] = useState<string>('');

  const moveCandidate = (candidateId: string, stage: PipelineStage) => {
    setCandidates(candidates.map((candidate) => (candidate.id === candidateId ? { ...candidate, stage, updatedAt: new Date().toISOString() } : candidate)));
  };

  return (
    <main className="pipeline-board">
      {pipelineStages.map((stage) => (
        <section
          className="pipeline-column"
          key={stage}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => draggingId && moveCandidate(draggingId, stage)}
        >
          <header>
            <span className={`stage-dot ${stageAccent[stage]}`} />
            <strong>{stage}</strong>
            <em>{candidates.filter((candidate) => candidate.stage === stage).length}</em>
          </header>
          {candidates
            .filter((candidate) => candidate.stage === stage)
            .map((candidate) => (
              <article className="pipeline-card" draggable key={candidate.id} onDragStart={() => setDraggingId(candidate.id)}>
                <strong>{candidate.fullName}</strong>
                <span>{candidate.aiSummary.skills.slice(0, 3).join(', ') || 'Skills pending'}</span>
                <small>{fileStatusLabel(candidate.cv.downloadStatus)}</small>
              </article>
            ))}
        </section>
      ))}
    </main>
  );
}

function AiView({ candidates }: { candidates: Candidate[] }) {
  const [query, setQuery] = useState(
    'Find candidates with sales and technical experience who worked at Sri Lankan PLCs and studied in Singapore.',
  );
  const [response, setResponse] = useState<AiSearchResponse>(() => runMockAiSearch(query, candidates));
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  return (
    <main className="ai-layout">
      <section className="ai-query-panel">
        <div className="section-title">
          <Brain size={20} />
          <h2>Ask the archive</h2>
        </div>
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={7} />
        <div className="button-row">
          <button className="primary-action" onClick={() => setResponse(runMockAiSearch(query, candidates))}>
            <Sparkles size={17} /> Run AI search
          </button>
          <button className="secondary-action">
            <Star size={17} /> Save search
          </button>
        </div>
        <div className="notice-inline">
          <ShieldCheck size={17} />
          <span>AI assists search and summarization. Protected characteristics are not used for filtering or ranking.</span>
        </div>
      </section>
      <section className="ai-results-panel">
        <p className={response.excludedUnsafeCriteria.length ? 'compliance-warning' : 'compliance-ok'}>{response.answer}</p>
        <div className="criteria-grid">
          <div>
            <strong>Criteria used</strong>
            {response.interpretedCriteria.map((criterion) => (
              <span key={criterion}>{criterion}</span>
            ))}
          </div>
          <div>
            <strong>Excluded</strong>
            {response.excludedUnsafeCriteria.length ? response.excludedUnsafeCriteria.map((criterion) => <span key={criterion}>{criterion}</span>) : <span>None</span>}
          </div>
        </div>
        {response.results.map((result) => {
          const candidate = byId.get(result.candidateId);
          if (!candidate) return null;
          return (
            <article className="ai-result" key={result.candidateId}>
              <div>
                <strong>{candidate.fullName}</strong>
                <span className={`confidence confidence-${result.confidence.toLowerCase()}`}>{result.confidence}</span>
              </div>
              {result.evidence.map((evidence) => (
                <p key={evidence}>{evidence}</p>
              ))}
              <button className="secondary-action">
                <Star size={16} /> Add to shortlist
              </button>
            </article>
          );
        })}
      </section>
    </main>
  );
}

function ImportView({ candidates }: { candidates: Candidate[] }) {
  const totalCvRefs = 140;
  const downloaded = candidates.filter((candidate) => ['downloaded', 'text_indexed'].includes(candidate.cv.downloadStatus)).length;
  const indexed = candidates.filter((candidate) => candidate.cv.downloadStatus === 'text_indexed').length;
  const failed = candidates.filter((candidate) => candidate.cv.downloadStatus === 'failed').length;

  return (
    <main className="import-layout">
      <section className="status-grid">
        {[
          ['Forminator submissions', 158],
          ['Job applications', 141],
          ['CV references', totalCvRefs],
          ['Downloaded in demo', downloaded],
          ['Text indexed in demo', indexed],
          ['Failed in demo', failed],
        ].map(([label, value]) => (
          <div className="status-tile" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>
      <section className="import-actions">
        <div className="section-title">
          <Database size={20} />
          <h2>Import jobs</h2>
        </div>
        <div className="button-row">
          <button className="primary-action">
            <Import size={17} /> Import missing CVs
          </button>
          <button className="secondary-action">
            <FileSearch size={17} /> Extract pending text
          </button>
          <button className="secondary-action">
            <AlertTriangle size={17} /> Retry failed
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Started</th>
              <th>Submissions</th>
              <th>CVs</th>
              <th>Errors</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {importRuns.map((run) => (
              <tr key={run.id}>
                <td>{run.subcommand}</td>
                <td>{formatDate(run.startedAt)}</td>
                <td>{run.insertedSubmissions}</td>
                <td>{run.copiedCvs}</td>
                <td>{run.errorCount}</td>
                <td>{run.exitStatus === 0 ? 'OK' : 'Failed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function SettingsView() {
  return (
    <main className="settings-layout">
      <section>
        <div className="section-title">
          <ShieldCheck size={20} />
          <h2>Access</h2>
        </div>
        <div className="settings-list">
          <div>
            <strong>Approved users</strong>
            <span>Nilhan, Prashanthi</span>
          </div>
          <div>
            <strong>Auth provider</strong>
            <span>Firebase Auth</span>
          </div>
          <div>
            <strong>Firebase config</strong>
            <span>{isFirebaseConfigured ? 'Configured' : 'Waiting for .env.local'}</span>
          </div>
        </div>
      </section>
      <section>
        <div className="section-title">
          <History size={20} />
          <h2>Backend architecture</h2>
        </div>
        <div className="architecture-list">
          <span>Firestore: candidates, notes, importRuns, aiSummaries, searchDocuments, users</span>
          <span>Storage: cvs/{'{candidateId}'}/{'{originalFileName}'}</span>
          <span>Functions: importCvForCandidate, importAllMissingCvs, extractCvText, generateCvSummary, aiSearch</span>
          <span>Secrets: Gemini/API credentials stay in Firebase Secret Manager or AI Logic server paths</span>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const initialSession = getInitialSessionFromSearch(window.location.search);
  const [currentUser, setCurrentUser] = useState<'Nilhan' | 'Prashanthi' | null>(initialSession.user);
  const [activeView, setActiveView] = useState<View>(initialSession.view);
  const [candidates, setCandidates] = useState<Candidate[]>(mockCandidates);

  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <div className="app-shell">
      <TopNav activeView={activeView} setActiveView={setActiveView} currentUser={currentUser} />
      <div className="page-frame">
        {activeView === 'workspace' && <WorkspaceView candidates={candidates} setCandidates={setCandidates} setActiveView={setActiveView} />}
        {activeView === 'pipeline' && <PipelineView candidates={candidates} setCandidates={setCandidates} />}
        {activeView === 'ai' && <AiView candidates={candidates} />}
        {activeView === 'import' && <ImportView candidates={candidates} />}
        {activeView === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}
