import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Archive,
  ArrowDownToLine,
  CalendarDays,
  Check,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Cloud,
  Copy,
  Database,
  ExternalLink,
  File,
  FileCheck2,
  FileClock,
  FileWarning,
  Filter,
  FolderSearch2,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Star,
  X,
} from 'lucide-react';
import { GoogleAuthProvider, signInWithRedirect, signOut } from 'firebase/auth';
import { demoApplications, demoSyncRuns, demoSyncState } from './data/demoApplications';
import { auth } from './firebase/auth';
import { isFirebaseConfigured } from './firebase/env';
import { defaultFilters, searchApplications } from './services/search';
import type {
  ApplicationRecord,
  CvStatus,
  RecruiterStage,
  RecruiterState,
  SearchFilters,
  SortOption,
  SyncRun,
  SyncState,
  UserProfile,
} from './types';
import { PIPELINE_STAGES } from './types';

type AppView = 'applications' | 'sync';
type DrawerTab = 'Application' | 'CV' | 'Raw data';

const EMPTY_SYNC_STATE: SyncState = {
  status: 'never_run',
  sourceTotal: 0,
  activeApplications: 0,
  lastSuccessfulAt: null,
  lastAttemptAt: null,
  nextExpectedAt: null,
  lastError: null,
};

const CV_LABELS: Record<CvStatus, string> = {
  missing: 'No CV supplied',
  queued: 'CV queued',
  downloaded: 'CV ready',
  failed: 'CV failed',
};

export function isDevelopmentDemoAllowed(development: boolean, search: string): boolean {
  return development && new URLSearchParams(search).get('demo') === '1';
}

const demoMode = isDevelopmentDemoAllowed(import.meta.env.DEV, typeof window === 'undefined' ? '' : window.location.search);

function formatDate(value: string | null, includeTime = false): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'AP';
}

export function archiveFreshness(state: SyncState): 'never' | 'current' | 'overdue' | 'critical' {
  if (!state.lastSuccessfulAt) return 'never';
  const lastSuccessfulAt = new Date(state.lastSuccessfulAt).getTime();
  if (Number.isNaN(lastSuccessfulAt)) return 'critical';
  const age = Date.now() - lastSuccessfulAt;
  if (age > 8 * 60 * 60 * 1000) return 'critical';
  if (age > 5 * 60 * 60 * 1000) return 'overdue';
  return 'current';
}

export function isArchiveStale(state: SyncState): boolean {
  return archiveFreshness(state) !== 'current';
}

export function displayError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const friendlyMessages: Record<string, string> = {
    'auth/internal-error': 'Google sign-in is not available yet. Please try again shortly or contact the archive owner.',
    'auth/operation-not-allowed': 'Google sign-in has not been enabled for this archive.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled before completion.',
    'auth/network-request-failed': 'The sign-in service could not be reached. Check your connection and try again.',
    'auth/unauthorized-domain': 'This website is not authorized to use Google sign-in.',
    'auth/redirect-cancelled-by-user': 'Google sign-in was cancelled before completion.',
    'auth/user-disabled': 'This Google account has been disabled for this archive.',
    'access/email-unverified': 'Use a verified approved Google account to open this archive.',
    'access/not-approved': 'This Google account is not approved for Apex Talent Archive.',
    'access/profile-invalid': 'This archive profile is inactive or has invalid access settings.',
    'access/profile-unavailable': 'This archive profile is inactive or unavailable. Contact the archive owner.',
    'permission-denied': 'This Google account is not approved for Apex Talent Archive.',
    'firestore/permission-denied': 'This Google account is not approved for Apex Talent Archive.',
    'functions/permission-denied': 'This Google account is not approved for Apex Talent Archive.',
    'functions/unauthenticated': 'Your sign-in session has expired. Please sign in again.',
    'functions/not-found': 'The archive service is not available yet. Please try again shortly.',
    'functions/unavailable': 'The archive service is temporarily unavailable. Please try again.',
  };
  if (friendlyMessages[code]) return friendlyMessages[code];
  if (code.startsWith('auth/') || code.startsWith('functions/') || code.startsWith('access/') || code.startsWith('firestore/')) {
    return 'The archive could not complete that request. Please try again.';
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}

function LoginScreen({ error, busy, onSignIn }: { error: string; busy: boolean; onSignIn: () => void }) {
  return (
    <main className="login-shell">
      <section className="login-brand" aria-label="Apex Talent Archive">
        <div className="brand-mark large"><Archive size={30} /></div>
        <p className="eyebrow">Apex HRM private workspace</p>
        <h1>Every application.<br />Ready when you need it.</h1>
        <p className="login-copy">Search the ApexHRM applicant archive, review submitted details, and open the original CV from one secure workspace.</p>
        <div className="login-proof">
          <span><ShieldCheck size={18} /> Approved accounts only</span>
          <span><Cloud size={18} /> Synced every four hours</span>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div>
          <span className="login-kicker">Recruiter access</span>
          <h2 id="login-title">Sign in to the archive</h2>
          <p>Use the approved Google account for Nilhan or Prashanthi.</p>
        </div>
        {!isFirebaseConfigured && !demoMode ? (
          <div className="inline-alert danger"><AlertCircle size={18} /><span>Firebase is not configured on this device. Complete the setup in the README before signing in.</span></div>
        ) : null}
        {error ? <div className="inline-alert danger" role="alert"><AlertCircle size={18} /><span>{error}</span></div> : null}
        <button className="button primary wide" onClick={onSignIn} disabled={busy || (!isFirebaseConfigured && !demoMode)}>
          <CircleUserRound size={19} /> {busy ? 'Checking account...' : 'Continue with Google'}
        </button>
        <p className="login-privacy">Applicant information stays inside the approved Firebase project and is not public.</p>
      </section>
    </main>
  );
}

function Sidebar({ view, profile, onView, onSignOut }: { view: AppView; profile: UserProfile; onView: (view: AppView) => void; onSignOut: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand-lockup">
        <div className="brand-mark"><Archive size={21} /></div>
        <div><strong>Apex</strong><span>Talent Archive</span></div>
      </div>
      <nav className="primary-nav" aria-label="Main navigation">
        <button className={view === 'applications' ? 'active' : ''} onClick={() => onView('applications')}>
          <FolderSearch2 size={19} /><span>Applications</span>
        </button>
        <button className={view === 'sync' ? 'active' : ''} onClick={() => onView('sync')}>
          <Database size={19} /><span>Sync status</span>
        </button>
      </nav>
      <div className="sidebar-footer">
        <div className="profile-chip">
          <span className="avatar">{initials(profile.displayName)}</span>
          <span><strong>{profile.displayName}</strong><small>{profile.role === 'owner' ? 'Archive owner' : 'Recruiter'}</small></span>
        </div>
        <button className="icon-button inverse" onClick={onSignOut} title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
      </div>
    </aside>
  );
}

function StatusPill({ state }: { state: SyncState }) {
  const freshness = archiveFreshness(state);
  const stale = freshness !== 'current';
  return (
    <span className={`sync-pill ${state.status === 'failed' || stale ? 'warning' : state.status}`}>
      <span className="pulse-dot" />
      {state.status === 'running' ? 'Syncing now' : freshness === 'never' ? 'Not synced' : freshness === 'critical' ? 'Sync critically overdue' : freshness === 'overdue' ? 'Sync overdue' : 'Archive current'}
    </span>
  );
}

function FilterPanel({ filters, tags, onChange, onClear, open }: { filters: SearchFilters; tags: string[]; onChange: (filters: SearchFilters) => void; onClear: () => void; open: boolean }) {
  return (
    <aside className={`filters ${open ? 'mobile-open' : ''}`} aria-label="Application filters">
      <div className="filters-heading"><strong>Filter applications</strong><button className="text-button" onClick={onClear}>Clear</button></div>
      <label>Stage<select value={filters.stage} onChange={(event) => onChange({ ...filters, stage: event.target.value as SearchFilters['stage'] })}><option value="all">All stages</option>{PIPELINE_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
      <label>CV status<select value={filters.cvStatus} onChange={(event) => onChange({ ...filters, cvStatus: event.target.value as SearchFilters['cvStatus'] })}><option value="all">All CV states</option><option value="downloaded">CV ready</option><option value="queued">CV queued</option><option value="failed">CV failed</option><option value="missing">No CV supplied</option></select></label>
      <label>Assigned to<select value={filters.assignedTo} onChange={(event) => onChange({ ...filters, assignedTo: event.target.value })}><option value="all">Anyone</option><option value="Nilhan">Nilhan</option><option value="Prashanthi">Prashanthi</option></select></label>
      <label>Tag<select value={filters.tag} onChange={(event) => onChange({ ...filters, tag: event.target.value })}><option value="">All tags</option>{tags.map((tag) => <option key={tag}>{tag}</option>)}</select></label>
      <div className="date-pair"><label>From<input type="date" value={filters.submittedFrom} onChange={(event) => onChange({ ...filters, submittedFrom: event.target.value })} /></label><label>To<input type="date" value={filters.submittedTo} onChange={(event) => onChange({ ...filters, submittedTo: event.target.value })} /></label></div>
      <div className="filter-checks">
        <label><input type="checkbox" checked={filters.hasCv} onChange={(event) => onChange({ ...filters, hasCv: event.target.checked })} /><span>Has a CV reference</span></label>
        <label><input type="checkbox" checked={filters.favoritesOnly} onChange={(event) => onChange({ ...filters, favoritesOnly: event.target.checked })} /><span>Favourites only</span></label>
        <label><input type="checkbox" checked={filters.sourcePresentOnly} onChange={(event) => onChange({ ...filters, sourcePresentOnly: event.target.checked })} /><span>Still on ApexHRM</span></label>
      </div>
    </aside>
  );
}

function CvBadge({ status }: { status: CvStatus }) {
  const Icon = status === 'downloaded' ? FileCheck2 : status === 'queued' ? FileClock : status === 'failed' ? FileWarning : File;
  return <span className={`cv-badge ${status}`}><Icon size={15} />{CV_LABELS[status]}</span>;
}

function ApplicationRow({ application, reasons, snippet, selected, checked, onOpen, onCheck }: { application: ApplicationRecord; reasons: string[]; snippet?: string; selected: boolean; checked: boolean; onOpen: () => void; onCheck: () => void }) {
  return (
    <article className={`application-row ${selected ? 'selected' : ''}`}>
      <label className="row-check" aria-label={`Select ${application.fullName || 'application'}`}><input type="checkbox" checked={checked} onChange={onCheck} /></label>
      <button className="application-open" onClick={onOpen}>
        <span className="candidate-avatar">{initials(application.fullName)}</span>
        <span className="candidate-identity"><strong>{application.fullName || 'Unnamed applicant'}</strong><small>{application.email || 'No email provided'}</small></span>
        <span className="role-cell"><strong>{application.jobReference || 'General application'}</strong><small>{snippet || application.applicationMessage || 'No application note supplied.'}</small></span>
        <span className="row-meta"><CvBadge status={application.cv.status} /><small>{formatDate(application.submittedAt)}</small></span>
        <span className={`stage-chip stage-${application.recruiter.stage.toLowerCase().replace(/\s/g, '-')}`}>{application.recruiter.stage}</span>
        <ChevronRight className="row-chevron" size={18} />
      </button>
      {reasons.length ? <div className="match-reasons">Matched: {reasons.join(', ')}</div> : null}
    </article>
  );
}

function safeFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not provided';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value, null, 2); } catch { return 'Unserializable value'; }
}

function ApplicationDrawer({ application, onClose, onRecruiterChange, demo }: { application: ApplicationRecord; onClose: () => void; onRecruiterChange: (state: RecruiterState) => Promise<void>; demo: boolean }) {
  const [tab, setTab] = useState<DrawerTab>('Application');
  const [busy, setBusy] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [textPreview, setTextPreview] = useState('');
  const [error, setError] = useState('');

  useEffect(() => () => { if (fileUrl) URL.revokeObjectURL(fileUrl); }, [fileUrl]);
  useEffect(() => { setTab('Application'); setError(''); setFileUrl(''); setTextPreview(''); }, [application.id]);

  async function changeRecruiter(patch: Partial<RecruiterState>) {
    setBusy('recruiter'); setError('');
    try {
      await onRecruiterChange({ ...application.recruiter, ...patch, lastReviewedAt: new Date().toISOString() });
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(''); }
  }

  async function loadCv(preview: boolean) {
    if (!application.cv.storagePath) return;
    setBusy(preview ? 'preview' : 'download'); setError('');
    try {
      const { getCvBlob } = await import('./services/archive');
      const blob = await getCvBlob(application.cv.storagePath);
      if (preview && application.cv.contentType === 'text/plain') {
        setTextPreview(await blob.text()); setFileUrl('');
      } else if (preview) {
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        setFileUrl(URL.createObjectURL(blob)); setTextPreview('');
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = application.cv.originalFileName ?? 'candidate-cv';
        anchor.click();
        URL.revokeObjectURL(url);
      }
    } catch (caught) { setError(displayError(caught)); }
    finally { setBusy(''); }
  }

  const previewable = Boolean(application.cv.contentType && (application.cv.contentType === 'application/pdf' || application.cv.contentType.startsWith('image/') || application.cv.contentType === 'text/plain'));
  return (
    <aside className="application-drawer" aria-label={`Application from ${application.fullName}`}>
      <header className="drawer-header">
        <div className="drawer-avatar">{initials(application.fullName)}</div>
        <div><span className="eyebrow">Application #{application.entryId}</span><h2>{application.fullName || 'Unnamed applicant'}</h2><a href={`mailto:${application.email}`}>{application.email || 'No email provided'}</a></div>
        <button className="icon-button" onClick={onClose} aria-label="Close application"><X size={20} /></button>
      </header>
      <div className="drawer-actions">
        <button className="button secondary" onClick={() => navigator.clipboard.writeText(application.email)} disabled={!application.email}><Copy size={16} />Copy email</button>
        <button className={`icon-button star ${application.recruiter.favorite ? 'active' : ''}`} onClick={() => changeRecruiter({ favorite: !application.recruiter.favorite })} aria-label={application.recruiter.favorite ? 'Remove favourite' : 'Add favourite'}><Star size={19} fill={application.recruiter.favorite ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="review-controls">
        <label>Stage<select value={application.recruiter.stage} disabled={busy === 'recruiter'} onChange={(event) => changeRecruiter({ stage: event.target.value as RecruiterStage })}>{PIPELINE_STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></label>
        <label>Assigned to<select value={application.recruiter.assignedTo ?? ''} disabled={busy === 'recruiter'} onChange={(event) => changeRecruiter({ assignedTo: event.target.value || null })}><option value="">Unassigned</option><option>Nilhan</option><option>Prashanthi</option></select></label>
      </div>
      {error ? <div className="inline-alert danger compact" role="alert"><AlertCircle size={16} />{error}</div> : null}
      <nav className="drawer-tabs">{(['Application', 'CV', 'Raw data'] as DrawerTab[]).map((item) => <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>)}</nav>
      <div className="drawer-content">
        {tab === 'Application' ? <>
          {!application.sourcePresent ? <div className="inline-alert warning"><Archive size={17} /><span>This application is retained in the archive but is no longer present at ApexHRM.</span></div> : null}
          <section className="detail-section"><h3>Applied for</h3><p className="role-title">{application.jobReference || 'General application'}</p><span className="muted"><CalendarDays size={15} /> Submitted {formatDate(application.submittedAt, true)}</span></section>
          <section className="detail-section"><h3>Application message</h3><p className="message-copy">{application.applicationMessage || 'No application message was supplied.'}</p></section>
          <section className="detail-section"><h3>Tags</h3><div className="tag-list">{application.recruiter.tags.length ? application.recruiter.tags.map((tag) => <span key={tag}>{tag}</span>) : <em>No recruiter tags yet</em>}</div></section>
          <section className="detail-section detail-grid"><div><span>Email</span><strong>{application.email || 'Not provided'}</strong></div><div><span>Last reviewed</span><strong>{formatDate(application.recruiter.lastReviewedAt)}</strong></div><div><span>Source</span><strong>Forminator form 2989</strong></div><div><span>Last seen</span><strong>{formatDate(application.lastSeenAt, true)}</strong></div></section>
        </> : null}
        {tab === 'CV' ? <>
          <section className="cv-file-summary"><div className="file-icon"><File size={25} /></div><div><strong>{application.cv.originalFileName ?? 'No CV filename'}</strong><span>{application.cv.sizeBytes ? `${Math.ceil(application.cv.sizeBytes / 1024)} KB` : CV_LABELS[application.cv.status]}</span></div><CvBadge status={application.cv.status} /></section>
          {application.cv.lastError ? <div className="inline-alert danger"><FileWarning size={17} /><span>{application.cv.lastError}</span></div> : null}
          <div className="cv-actions">
            <button className="button primary" onClick={() => loadCv(true)} disabled={!previewable || !application.cv.storagePath || busy !== '' || demo}><ExternalLink size={17} />{busy === 'preview' ? 'Opening...' : 'Preview CV'}</button>
            <button className="button secondary" onClick={() => loadCv(false)} disabled={!application.cv.storagePath || busy !== '' || demo}><ArrowDownToLine size={17} />{busy === 'download' ? 'Downloading...' : 'Download'}</button>
          </div>
          {demo ? <p className="helper-copy">File access is disabled in the fictional development preview.</p> : null}
          {fileUrl && application.cv.contentType === 'application/pdf' ? <iframe className="cv-preview" title={`${application.fullName} CV preview`} src={fileUrl} sandbox="" /> : null}
          {fileUrl && application.cv.contentType?.startsWith('image/') ? <img className="image-preview" src={fileUrl} alt={`${application.fullName} CV`} /> : null}
          {textPreview ? <pre className="text-preview">{textPreview}</pre> : null}
        </> : null}
        {tab === 'Raw data' ? <section className="raw-fields"><p>Original submitted fields are retained for audit and unusual form values. Forminator IP addresses are deliberately excluded.</p>{Object.entries(application.rawFields).map(([key, value]) => <div key={key}><span>{key}</span><pre>{safeFieldValue(value)}</pre></div>)}</section> : null}
      </div>
    </aside>
  );
}

function exportCsv(applications: ApplicationRecord[]) {
  const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = [['Name', 'Email', 'Job reference', 'Submitted', 'Stage', 'Assigned to', 'CV status', 'Tags'], ...applications.map((item) => [item.fullName, item.email, item.jobReference, item.submittedAt ?? item.submittedAtRaw, item.recruiter.stage, item.recruiter.assignedTo ?? '', item.cv.status, item.recruiter.tags.join('; ')])];
  const blob = new Blob([rows.map((row) => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `apex-applications-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function ApplicationsView({ applications, syncState, demo, onRecruiterChange }: { applications: ApplicationRecord[]; syncState: SyncState; demo: boolean; onRecruiterChange: (id: string, state: RecruiterState) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [sort, setSort] = useState<SortOption>('relevance');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchApplications(applications, query, filters, sort), [applications, filters, query, sort]);
  const selected = applications.find((application) => application.id === selectedId) ?? null;
  const tags = useMemo(() => [...new Set(applications.flatMap((application) => application.recruiter.tags))].sort(), [applications]);
  const activeFilters = Object.entries(filters).filter(([key, value]) => value !== (defaultFilters as unknown as Record<string, unknown>)[key]).length;
  const freshness = archiveFreshness(syncState);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (event.key === '/' && !typing) { event.preventDefault(); searchRef.current?.focus(); }
      if (event.key === 'Escape') { setSelectedId(null); setFiltersOpen(false); }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !typing && results.length) {
        event.preventDefault();
        const currentIndex = results.findIndex((result) => result.application.id === selectedId);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(results.length - 1, currentIndex < 0 ? 0 : currentIndex + direction));
        setSelectedId(results[nextIndex].application.id);
      }
      if (event.key === 'Enter' && !typing && selectedId) setSelectedId(selectedId);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [results, selectedId]);

  return <>
    <header className="page-header"><div><p className="eyebrow">ApexHRM form 2989</p><h1>Applications</h1><p>Search every submitted field and open the archived CV.</p></div><StatusPill state={syncState} /></header>
    {freshness !== 'current' ? <div className={`stale-banner ${freshness === 'critical' ? 'critical' : ''}`} role="alert"><AlertCircle size={18} /><span>{freshness === 'never' ? 'The archive has not completed its first sync.' : freshness === 'critical' ? `Archive data is more than eight hours old. Owner action is required. Last successful sync: ${formatDate(syncState.lastSuccessfulAt, true)}.` : `Archive data is more than five hours old. Last successful sync: ${formatDate(syncState.lastSuccessfulAt, true)}.`}</span></div> : null}
    <section className="search-command" aria-label="Search applications">
      <div className="search-input"><Search size={21} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, role, application text, tag, or CV filename" aria-label="Search applications" />{query ? <button onClick={() => setQuery('')} aria-label="Clear search"><X size={17} /></button> : <kbd>/</kbd>}</div>
      <button className="button secondary mobile-filter-button" onClick={() => setFiltersOpen((value) => !value)}><Filter size={17} />Filters{activeFilters ? ` (${activeFilters})` : ''}</button>
      <label className="sort-control"><span>Sort</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="relevance">Relevance</option><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Applicant name</option><option value="reviewed">Recently reviewed</option></select></label>
    </section>
    <div className={`workspace-grid ${selected ? 'has-drawer' : ''}`}>
      <FilterPanel filters={filters} tags={tags} onChange={setFilters} onClear={() => setFilters(defaultFilters)} open={filtersOpen} />
      <section className="results-pane">
        <div className="results-toolbar"><div><strong>{results.length}</strong><span>{results.length === 1 ? 'application' : 'applications'}</span>{query ? <small>matching “{query}”</small> : null}</div><div>{checkedIds.length ? <span className="selection-count">{checkedIds.length} selected</span> : null}<button className="button secondary compact-button" onClick={() => exportCsv(checkedIds.length ? applications.filter((item) => checkedIds.includes(item.id)) : results.map((result) => result.application))} disabled={!results.length}><ArrowDownToLine size={16} />Export CSV</button></div></div>
        <div className="result-columns" aria-hidden="true"><span>Applicant</span><span>Role and application</span><span>CV and date</span><span>Stage</span></div>
        <div className="application-list">{results.map((result) => <ApplicationRow key={result.application.id} application={result.application} reasons={result.reasons} snippet={result.snippets[0]} selected={selectedId === result.application.id} checked={checkedIds.includes(result.application.id)} onOpen={() => setSelectedId(result.application.id)} onCheck={() => setCheckedIds((ids) => ids.includes(result.application.id) ? ids.filter((id) => id !== result.application.id) : [...ids, result.application.id])} />)}{!results.length ? <div className="empty-state"><FolderSearch2 size={31} /><h2>No applications found</h2><p>Clear a filter or try a broader search phrase.</p><button className="button secondary" onClick={() => { setQuery(''); setFilters(defaultFilters); }}>Clear search</button></div> : null}</div>
      </section>
      {selected ? <><button className="drawer-backdrop" onClick={() => setSelectedId(null)} aria-label="Close application" /><ApplicationDrawer application={selected} demo={demo} onClose={() => setSelectedId(null)} onRecruiterChange={(state) => onRecruiterChange(selected.id, state)} /></> : null}
    </div>
  </>;
}

function SyncView({ state, runs, profile, demo, onRunSync }: { state: SyncState; runs: SyncRun[]; profile: UserProfile; demo: boolean; onRunSync: (mode: 'dry-run' | 'apply') => Promise<unknown> }) {
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  async function run(mode: 'dry-run' | 'apply') {
    if (mode === 'apply' && !window.confirm('Run a full ApexHRM import now? Existing recruiter fields will be preserved.')) return;
    setBusy(mode); setMessage('');
    try { await onRunSync(mode); setMessage(mode === 'apply' ? 'The sync has completed.' : 'Source check completed without changing archive data.'); }
    catch (error) { setMessage(displayError(error)); }
    finally { setBusy(''); }
  }
  const latest = runs[0];
  return <>
    <header className="page-header"><div><p className="eyebrow">Source health</p><h1>Sync status</h1><p>Reconcile ApexHRM submissions and CV imports.</p></div><StatusPill state={state} /></header>
    <section className="sync-summary-band">
      <div><span>Applications on source</span><strong>{state.sourceTotal}</strong><small>Form 2989</small></div>
      <div><span>Active in archive</span><strong>{state.activeApplications}</strong><small>Retained records stay separate</small></div>
      <div><span>Last successful sync</span><strong className="date-value">{formatDate(state.lastSuccessfulAt, true)}</strong><small>Next expected {formatDate(state.nextExpectedAt, true)}</small></div>
      <div><span>Latest CV outcome</span><strong>{latest ? `${latest.cvCompleted}/${latest.cvReferenced}` : '—'}</strong><small>{latest?.cvFailures ?? 0} failed</small></div>
    </section>
    {state.lastError ? <div className="inline-alert danger"><AlertCircle size={18} /><span>{state.lastError}</span></div> : null}
    {message ? <div className="inline-alert success"><Check size={18} /><span>{message}</span></div> : null}
    <section className="sync-actions-band"><div><h2>WordPress source check</h2><p>A dry run reads and reconciles the live source without writing applications or queuing CV files.</p></div><div><button className="button secondary" onClick={() => run('dry-run')} disabled={busy !== '' || profile.role !== 'owner' || demo}><ClipboardCheck size={17} />{busy === 'dry-run' ? 'Checking...' : 'Check source'}</button><button className="button primary" onClick={() => run('apply')} disabled={busy !== '' || profile.role !== 'owner' || demo}><RefreshCw size={17} className={busy === 'apply' ? 'spin' : ''} />{busy === 'apply' ? 'Syncing...' : 'Sync now'}</button></div></section>
    {demo ? <p className="helper-copy sync-helper">Sync controls are disabled in the fictional development preview.</p> : null}
    <section className="runs-section"><div className="section-heading"><div><h2>Recent runs</h2><p>Every run records reconciliation and CV outcomes.</p></div></div><div className="runs-table"><div className="runs-row header"><span>Started</span><span>Status</span><span>Scanned</span><span>Added</span><span>Updated</span><span>Missing</span><span>CV files</span></div>{runs.map((run) => <div className="runs-row" key={run.id}><span>{formatDate(run.startedAt, true)}</span><span><i className={`run-status ${run.status}`} />{run.status.replace(/_/g, ' ')}</span><span>{run.scanned}</span><span>{run.inserted}</span><span>{run.updated}</span><span>{run.missing}</span><span>{run.cvCompleted} ready / {run.cvFailures} failed</span></div>)}{!runs.length ? <div className="empty-run">No sync runs have been recorded.</div> : null}</div></section>
  </>;
}

export default function App() {
  const [profile, setProfile] = useState<UserProfile | null>(demoMode ? { uid: 'demo-owner', email: 'demo@apexhrm.com', displayName: 'Nilhan', role: 'owner', approved: true, active: true } : null);
  const [applications, setApplications] = useState<ApplicationRecord[]>(demoMode ? demoApplications : []);
  const [syncState, setSyncState] = useState<SyncState>(demoMode ? demoSyncState : EMPTY_SYNC_STATE);
  const [runs, setRuns] = useState<SyncRun[]>(demoMode ? demoSyncRuns : []);
  const [view, setView] = useState<AppView>('applications');
  const [authReady, setAuthReady] = useState(demoMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const activeAuth = auth;
    if (demoMode || !activeAuth) { setAuthReady(true); return; }
    let disposed = false;
    let stop: () => void = () => undefined;
    void import('./services/authSession').then(({ startAuthSession }) => {
      if (disposed) return;
      stop = startAuthSession(activeAuth, {
        onPhase: (phase) => {
          if (phase === 'resolving' || phase === 'provisioning') setAuthReady(false);
          if (phase === 'signedOut') { setProfile(null); setAuthReady(true); }
        },
        onReady: (nextProfile) => { setProfile(nextProfile); setError(''); setAuthReady(true); },
        onError: (caught) => setError(displayError(caught)),
      });
    }).catch((caught) => { if (!disposed) { setProfile(null); setError(displayError(caught)); setAuthReady(true); } });
    return () => { disposed = true; stop(); };
  }, []);

  useEffect(() => {
    if (demoMode || !profile) return;
    setBusy(true);
    let disposed = false;
    const unsubscribers: Array<() => void> = [];
    void import('./services/archive').then(({ subscribeApplications, subscribeSyncRuns, subscribeSyncState }) => {
      if (disposed) return;
      unsubscribers.push(
        subscribeApplications((data) => { setApplications(data); setBusy(false); }, (caught) => { setError(caught.message); setBusy(false); }),
        subscribeSyncState(setSyncState, (caught) => setError(caught.message)),
        subscribeSyncRuns(setRuns, (caught) => setError(caught.message)),
      );
    }).catch((caught) => { if (!disposed) { setError(displayError(caught)); setBusy(false); } });
    return () => { disposed = true; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [profile]);

  async function signIn() {
    if (demoMode) return;
    if (!auth) { setError('Firebase is not configured.'); return; }
    setBusy(true); setError('');
    try { await signInWithRedirect(auth, new GoogleAuthProvider()); }
    catch (caught) { setError(displayError(caught)); }
    finally { setBusy(false); }
  }

  async function signOutUser() {
    if (demoMode) { window.location.search = ''; return; }
    if (auth) await signOut(auth);
  }

  async function changeRecruiter(applicationId: string, recruiter: RecruiterState) {
    if (demoMode) {
      setApplications((items) => items.map((item) => item.id === applicationId ? { ...item, recruiter } : item));
      return;
    }
    const { updateRecruiterState } = await import('./services/archive');
    await updateRecruiterState(applicationId, recruiter);
  }

  if (!authReady) return <div className="boot-screen"><RefreshCw className="spin" /><span>Opening the archive...</span></div>;
  if (!profile) return <LoginScreen error={error} busy={busy} onSignIn={signIn} />;

  return (
    <div className="app-shell">
      <Sidebar view={view} profile={profile} onView={(next) => { setView(next); setMenuOpen(false); }} onSignOut={signOutUser} />
      <main className="app-main">
        <div className="mobile-bar"><button className="icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Open navigation"><Menu size={20} /></button><strong>Apex Talent Archive</strong><StatusPill state={syncState} /></div>
        {menuOpen ? <div className="mobile-menu"><button onClick={() => { setView('applications'); setMenuOpen(false); }}><FolderSearch2 size={18} />Applications</button><button onClick={() => { setView('sync'); setMenuOpen(false); }}><Database size={18} />Sync status</button><button onClick={signOutUser}><LogOut size={18} />Sign out</button></div> : null}
        {error ? <div className="global-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div> : null}
        {busy && view === 'applications' && !applications.length ? <div className="loading-state"><RefreshCw className="spin" /><p>Loading applications...</p></div> : null}
        {view === 'applications' ? <ApplicationsView applications={applications} syncState={syncState} demo={demoMode} onRecruiterChange={changeRecruiter} /> : <SyncView state={syncState} runs={runs} profile={profile} demo={demoMode} onRunSync={async (mode) => { const { runApexSync } = await import('./services/archive'); return runApexSync(mode); }} />}
      </main>
    </div>
  );
}
