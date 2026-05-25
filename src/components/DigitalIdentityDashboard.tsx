import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Shield, CreditCard as CardIcon, Fingerprint, ArrowLeft,
  Camera, Upload, Eye, Lock, LogOut, Bell, RefreshCw,
  Monitor, Clock, Key, ChevronRight, Check,
  Star, Zap, Crown, BookOpen, Briefcase, FileText,
  GraduationCap, DollarSign, Award, FlaskConical,
  Github, Mail, Phone, MapPin, Edit2, Save, X,
  Smartphone, Globe, AlertTriangle, Download, Plus,
  Trash2, ChevronDown, Info, QrCode, Calendar,
  IdCard, Layers,
} from 'lucide-react';
import { initializeVault, addDocumentToVault, saveVaultState } from '../lib/vaultManager';
import type { VaultDocument } from '../lib/vaultManager';

// ─── Types ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCallback = (doc: any) => void;

interface Props {
  onBack?: () => void;
  userName?: string;
  setUserName?: (n: string) => void;
  profileImage?: string | null;
  setProfileImage?: (img: string) => void;
  userId?: string | null;
  onDocumentUploaded?: AnyCallback;
}

type MainTab = 'profile' | 'identity' | 'security' | 'subscription';

interface SubItem {
  id: string;
  label: string;
  icon: string;
  hint: string;
}

interface IdentityCategory {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  description: string;
  items: SubItem[];
}

interface ProfileData {
  displayName: string;
  pinitId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  github: string;
}

// ─── Category definitions with subsections ────────────────────────────────────

const IDENTITY_CATEGORIES: IdentityCategory[] = [
  {
    id: 'personal',
    label: 'Personal Docs',
    icon: IdCard,
    color: 'from-blue-500 to-cyan-500',
    description: 'ID proofs, birth cert, passport',
    items: [
      { id: 'resume', label: 'Resume', icon: '📄', hint: 'PDF or DOC format preferred' },
      { id: 'pan', label: 'PAN Card', icon: '💳', hint: 'Clear scan of both sides' },
      { id: 'aadhaar', label: 'Aadhaar Card', icon: '🪪', hint: 'Front and back scan' },
      { id: 'passport', label: 'Passport', icon: '🛂', hint: 'Bio-data page scan' },
      { id: 'driving', label: 'Driving Licence', icon: '🚗', hint: 'Front and back' },
      { id: 'birth', label: 'Birth Certificate', icon: '📋', hint: 'Official certificate' },
    ],
  },
  {
    id: 'academic',
    label: 'Academic',
    icon: GraduationCap,
    color: 'from-purple-500 to-violet-500',
    description: 'Degrees, marksheets, transcripts',
    items: [
      { id: 'degree', label: 'Degree Certificate', icon: '🎓', hint: 'Official degree copy' },
      { id: 'marksheet', label: 'Marksheets', icon: '📝', hint: 'Semester-wise marks' },
      { id: 'transcript', label: 'Transcripts', icon: '📃', hint: 'Official transcripts' },
      { id: 'tc', label: 'Transfer Certificate', icon: '📜', hint: 'TC from institution' },
      { id: 'migration', label: 'Migration Certificate', icon: '🗂️', hint: 'Board migration cert' },
      { id: '10th', label: '10th Marksheet', icon: '🏫', hint: 'SSC / CBSE / ICSE' },
      { id: '12th', label: '12th Marksheet', icon: '🏛️', hint: 'HSC / CBSE / ICSE' },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: Briefcase,
    color: 'from-orange-500 to-amber-500',
    description: 'Project files, reports, demos',
    items: [
      { id: 'report', label: 'Project Report', icon: '📊', hint: 'Full project documentation' },
      { id: 'synopsis', label: 'Synopsis', icon: '📑', hint: 'Project synopsis/abstract' },
      { id: 'certificate', label: 'Completion Certificate', icon: '🏆', hint: 'Project completion cert' },
      { id: 'screenshots', label: 'Screenshots / Demo', icon: '🖼️', hint: 'App or website screenshots' },
      { id: 'code', label: 'Code Repository Link', icon: '💻', hint: 'GitHub / GitLab link' },
    ],
  },
  {
    id: 'internships',
    label: 'Internships',
    icon: BookOpen,
    color: 'from-green-500 to-emerald-500',
    description: 'Offer letters, completion certs',
    items: [
      { id: 'offer', label: 'Offer Letter', icon: '📩', hint: 'Internship offer letter' },
      { id: 'completion', label: 'Completion Certificate', icon: '✅', hint: 'End-of-internship cert' },
      { id: 'recommendation', label: 'Recommendation Letter', icon: '⭐', hint: 'From your supervisor' },
      { id: 'stipend', label: 'Stipend Slips', icon: '💰', hint: 'Monthly stipend proof' },
      { id: 'nda', label: 'NDA / Agreement', icon: '🤝', hint: 'Signed agreements' },
    ],
  },
  {
    id: 'certifications',
    label: 'Certifications',
    icon: Award,
    color: 'from-pink-500 to-rose-500',
    description: 'Skill & course certificates',
    items: [
      { id: 'online', label: 'Online Course Certificate', icon: '🎖️', hint: 'Coursera, Udemy, etc.' },
      { id: 'nptel', label: 'NPTEL Certificate', icon: '🎓', hint: 'NPTEL / SWAYAM cert' },
      { id: 'aws', label: 'Cloud Certifications', icon: '☁️', hint: 'AWS, GCP, Azure certs' },
      { id: 'programming', label: 'Programming Certificate', icon: '💻', hint: 'Coding platform cert' },
      { id: 'language', label: 'Language Certificate', icon: '🌐', hint: 'IELTS, TOEFL, etc.' },
      { id: 'workshop', label: 'Workshop Certificate', icon: '🔧', hint: 'Workshop / seminar cert' },
    ],
  },
  {
    id: 'exams',
    label: 'Entrance & Exams',
    icon: FlaskConical,
    color: 'from-yellow-500 to-orange-400',
    description: 'Score cards, rank letters',
    items: [
      { id: 'jee', label: 'JEE Score Card', icon: '📈', hint: 'JEE Mains / Advanced' },
      { id: 'neet', label: 'NEET Score Card', icon: '🩺', hint: 'NEET UG / PG' },
      { id: 'cat', label: 'CAT / MBA Scores', icon: '🎯', hint: 'CAT, XAT, GMAT, etc.' },
      { id: 'gate', label: 'GATE Score Card', icon: '⚙️', hint: 'GATE exam score' },
      { id: 'rank', label: 'Rank Letter', icon: '🏅', hint: 'Official rank letter' },
      { id: 'admit', label: 'Admit Card', icon: '🪪', hint: 'Entrance exam admit card' },
    ],
  },
  {
    id: 'others',
    label: 'Others',
    icon: Layers,
    color: 'from-teal-500 to-cyan-600',
    description: 'Any other documents',
    items: [
      { id: 'medical', label: 'Medical Documents', icon: '🏥', hint: 'Health records, prescriptions' },
      { id: 'insurance', label: 'Insurance Policy', icon: '🛡️', hint: 'Health / life insurance' },
      { id: 'voter', label: 'Voter ID', icon: '🗳️', hint: 'Election commission card' },
      { id: 'noc', label: 'NOC / Clearance', icon: '✔️', hint: 'No-objection certificates' },
      { id: 'other', label: 'Other Document', icon: '📁', hint: 'Any other important file' },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function doSaveToVault(
  dataUrl: string,
  fileName: string,
  fileType: string,
  onDocumentUploaded?: AnyCallback
): boolean {
  try {
    const vault = initializeVault();
    const doc: VaultDocument = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      fileName,
      fileType: (fileType === 'image' ? 'image' : fileType === 'pdf' ? 'pdf' : 'document') as VaultDocument['fileType'],
      fileSize: 'unknown',
      fileData: dataUrl,
      createdAt: new Date(),
      isEncrypted: false,
    };
    const updated = addDocumentToVault(vault, doc);
    saveVaultState(updated);
    onDocumentUploaded?.(doc);
    return true;
  } catch {
    return false;
  }
}

// ─── Sub-component: Tab bar ───────────────────────────────────────────────────

const TabBar: React.FC<{ active: MainTab; onChange: (t: MainTab) => void }> = ({ active, onChange }) => {
  const tabs: { id: MainTab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'identity', label: 'Identity', icon: Fingerprint },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'subscription', label: 'Plans', icon: Crown },
  ];

  return (
    <div className="flex bg-slate-800/60 rounded-2xl p-1 gap-0.5 border border-slate-700/50 backdrop-blur-sm">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 ${
            active === t.id
              ? 'bg-gradient-to-b from-cyan-500/25 to-purple-500/25 text-cyan-400 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <t.icon className="w-4 h-4" />
          <span className="text-[10px]">{t.label}</span>
        </button>
      ))}
    </div>
  );
};

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 ${className}`}>
    {children}
  </div>
);

// ─── ProfileField — module-level to prevent focus-loss on re-render ───────────
// IMPORTANT: Never define components inside another component's render — it
// causes React to treat them as a new type on every render, unmounting the DOM
// node and losing keyboard focus after each keystroke.
type ProfileFieldKey = keyof ProfileData;

const ProfileField: React.FC<{
  label: string; value: string; field: ProfileFieldKey;
  icon: React.ElementType; editing: boolean;
  readOnly?: boolean; multiline?: boolean;
  onChange: (field: ProfileFieldKey, value: string) => void;
}> = ({ label, value, field, icon: Icon, editing, readOnly = false, multiline = false, onChange }) => (
  <div className="space-y-1">
    <label className="text-xs text-slate-500 flex items-center gap-1.5">
      <Icon className="w-3 h-3" /> {label}
    </label>
    {multiline ? (
      <textarea
        value={value}
        readOnly={!editing || readOnly}
        onChange={e => onChange(field, e.target.value)}
        rows={3}
        className={`w-full bg-slate-900/50 border rounded-xl px-3 py-2 text-sm text-white resize-none transition-colors ${
          editing && !readOnly ? 'border-cyan-500/50 outline-none' : 'border-slate-700/50 text-slate-300'
        } ${readOnly ? 'opacity-60' : ''}`}
      />
    ) : (
      <input
        type="text"
        value={value}
        readOnly={!editing || readOnly}
        onChange={e => onChange(field, e.target.value)}
        className={`w-full bg-slate-900/50 border rounded-xl px-3 py-2 text-sm text-white transition-colors ${
          editing && !readOnly ? 'border-cyan-500/50 outline-none' : 'border-slate-700/50 text-slate-300'
        } ${readOnly ? 'opacity-60' : ''}`}
      />
    )}
  </div>
);

// ─── SecurityToggle — module-level to prevent re-mount ───────────────────────
const SecurityToggle: React.FC<{ on: boolean; toggle: () => void }> = ({ on, toggle }) => (
  <button onClick={toggle} className={`relative w-11 h-6 rounded-full transition-colors ${on ? 'bg-cyan-500' : 'bg-slate-600'}`}>
    <motion.div layout className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow ${on ? 'left-5' : 'left-0.5'} transition-all`} />
  </button>
);

// ─── SecurityAccordion — module-level to prevent re-mount ────────────────────
const SecurityAccordion: React.FC<{
  id: string; icon: React.ElementType; title: string; sub: string;
  children: React.ReactNode; danger?: boolean;
  openSection: string | null; setOpenSection: (id: string | null) => void;
}> = ({ id, icon: Icon, title, sub, children, danger = false, openSection, setOpenSection }) => {
  const open = openSection === id;
  return (
    <div className={`rounded-2xl overflow-hidden border ${danger ? 'border-red-500/30' : 'border-slate-700/40'}`}>
      <button
        onClick={() => setOpenSection(open ? null : id)}
        className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
          danger ? 'bg-red-900/20 hover:bg-red-900/30' : 'bg-slate-800/40 hover:bg-slate-800/70'
        }`}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${danger ? 'bg-red-500/20' : 'bg-slate-700/60'}`}>
          <Icon className={`w-4 h-4 ${danger ? 'text-red-400' : 'text-slate-300'}`} />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-semibold ${danger ? 'text-red-400' : 'text-white'}`}>{title}</p>
          <p className="text-xs text-slate-500">{sub}</p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.18 }}>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden">
            <div className={`p-4 pt-0 ${danger ? 'bg-red-900/10' : 'bg-slate-900/30'}`}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Document Item (subsection card) ─────────────────────────────────────────

interface DocItemProps {
  item: SubItem;
  categoryId: string;
  onDocumentUploaded?: AnyCallback;
  onRequestPreview: (dataUrl: string, name: string) => void;
}

const DocumentItem: React.FC<DocItemProps> = ({ item, categoryId, onDocumentUploaded, onRequestPreview }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const savedKey = `pinit_doc_saved_${categoryId}_${item.id}`;
  const [saved, setSaved] = useState(() => !!localStorage.getItem(savedKey));
  const [saving, setSaving] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = () => {
    if (!preview) return;
    setSaving(true);
    const ft = preview.startsWith('data:image') ? 'image' : 'document';
    const name = fileName || `${categoryId}_${item.id}`;
    const ok = doSaveToVault(preview, name, ft, onDocumentUploaded);
    setSaving(false);
    if (ok) {
      setSaved(true);
      localStorage.setItem(savedKey, '1');
    }
  };

  const handleClear = () => {
    setPreview(null);
    setFileName('');
    setSaved(false);
    localStorage.removeItem(savedKey);
  };

  return (
    <div className={`rounded-2xl border transition-all duration-200 ${
      saved ? 'border-green-500/50 bg-green-500/5'
            : preview ? 'border-cyan-500/40 bg-slate-800/60'
            : 'border-slate-700/40 bg-slate-800/30'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-2xl leading-none">{item.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${saved ? 'text-green-400' : 'text-white'}`}>{item.label}</p>
          <p className="text-xs text-slate-500 truncate">{saved ? 'Saved to vault ✓' : item.hint}</p>
        </div>
        {saved && <Check className="w-4 h-4 text-green-400 shrink-0" />}
      </div>

      {/* No file yet — upload & capture buttons */}
      {!preview && (
        <div className="flex gap-2 px-4 pb-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-700/50 border border-slate-600/40 text-slate-300 rounded-xl text-xs hover:bg-slate-700/80 hover:border-cyan-500/40 transition-all"
          >
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <button
            onClick={() => captureInputRef.current?.click()}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-700/50 border border-slate-600/40 text-slate-300 rounded-xl text-xs hover:bg-slate-700/80 hover:border-purple-500/40 transition-all"
          >
            <Camera className="w-3.5 h-3.5" /> Capture
          </button>
          {/* Browse any file */}
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFile} />
          {/* Camera capture (prefer rear camera) */}
          <input ref={captureInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
        </div>
      )}

      {/* File loaded */}
      {preview && (
        <div className="px-4 pb-3 space-y-2">
          {/* Thumbnail / file row */}
          {preview.startsWith('data:image') ? (
            <div className="relative rounded-xl overflow-hidden h-28 bg-slate-900/50">
              <img src={preview} alt="preview" className="w-full h-full object-cover" />
              <button
                onClick={() => onRequestPreview(preview, fileName || item.label)}
                className="absolute inset-0 flex items-center justify-center bg-black/50"
              >
                <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/20">
                  <Eye className="w-4 h-4 text-white" />
                  <span className="text-white text-xs font-medium">Preview</span>
                </div>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-slate-900/40 rounded-xl">
              <FileText className="w-5 h-5 text-cyan-400 shrink-0" />
              <span className="text-xs text-slate-300 truncate flex-1">{fileName}</span>
              <button
                onClick={() => onRequestPreview(preview, fileName || item.label)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-400 transition-colors shrink-0"
              >
                <Eye className="w-3.5 h-3.5" /> View
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleClear}
              className="px-3 py-2 bg-slate-700/50 text-slate-400 rounded-xl text-xs flex items-center gap-1 hover:bg-slate-700/80 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                saved
                  ? 'bg-green-500/20 border border-green-500/40 text-green-400'
                  : 'bg-gradient-to-r from-cyan-500 to-purple-500 text-white hover:opacity-90'
              } disabled:opacity-60`}
            >
              {saving
                ? <><div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Encrypting...</>
                : saved
                ? <><Check className="w-3 h-3" /> Saved to Vault</>
                : <><Lock className="w-3 h-3" /> Encrypt & Save</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Full-screen preview overlay — rendered via Portal directly into body ─────
// This ensures position:fixed works even inside framer-motion/overflow containers.

const PreviewOverlay: React.FC<{
  dataUrl: string;
  name: string;
  onClose: () => void;
}> = ({ dataUrl, name, onClose }) => {
  const isImage = dataUrl.startsWith('data:image');
  const isPdf   = dataUrl.startsWith('data:application/pdf') || name.toLowerCase().endsWith('.pdf');

  const overlay = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.96)', display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ color: 'white', fontSize: 14, fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>{name}</p>
        <button
          onClick={onClose}
          style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <X style={{ width: 16, height: 16, color: 'white' }} />
        </button>
      </div>

      {/* Content */}
      <div
        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        {isImage ? (
          <img
            src={dataUrl}
            alt={name}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12, boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
          />
        ) : isPdf ? (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <iframe
              src={dataUrl}
              title={name}
              style={{ width: '100%', flex: 1, border: 'none', borderRadius: 8, minHeight: 400 }}
            />
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>Scroll to view all pages</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(6,182,212,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileText style={{ width: 40, height: 40, color: '#06b6d4' }} />
            </div>
            <p style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>{name}</p>
            <p style={{ color: 'rgba(148,163,184,1)', fontSize: 13, textAlign: 'center' }}>
              This file type cannot be previewed directly.{'\n'}Save it to vault and download to open.
            </p>
          </div>
        )}
      </div>
    </motion.div>
  );

  return createPortal(
    <AnimatePresence>{overlay}</AnimatePresence>,
    document.body
  );
};

// ─── Category Page (subsections list) ────────────────────────────────────────

const CategoryPage: React.FC<{
  category: IdentityCategory;
  onBack: () => void;
  onDocumentUploaded?: AnyCallback;
}> = ({ category, onBack, onDocumentUploaded }) => {
  const [previewData, setPreviewData] = useState<{ dataUrl: string; name: string } | null>(null);

  return (
    <>
      {/* Preview overlay — rendered outside scroll container so fixed positioning works */}
      {previewData && (
        <PreviewOverlay
          dataUrl={previewData.dataUrl}
          name={previewData.name}
          onClose={() => setPreviewData(null)}
        />
      )}

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -30 }}
        className="space-y-3"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            className="w-9 h-9 bg-slate-800/60 border border-slate-700/50 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${category.color} flex items-center justify-center shrink-0 shadow-md`}>
            <category.icon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold leading-tight">{category.label}</h3>
            <p className="text-xs text-slate-500">{category.items.length} documents</p>
          </div>
        </div>

        {/* Encryption notice */}
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
          <Lock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <p className="text-xs text-cyan-300">All files are AES-256 encrypted before vault storage</p>
        </div>

        {/* Document items */}
        <div className="space-y-2">
          {category.items.map(item => (
            <DocumentItem
              key={item.id}
              item={item}
              categoryId={category.id}
              onDocumentUploaded={onDocumentUploaded}
              onRequestPreview={(dataUrl, name) => setPreviewData({ dataUrl, name })}
            />
          ))}
        </div>
      </motion.div>
    </>
  );
};

// ─── Digital Identity Tab ─────────────────────────────────────────────────────

const IdentityTab: React.FC<{
  userId: string | null | undefined;
  onDocumentUploaded?: AnyCallback;
}> = ({ onDocumentUploaded }) => {
  const [activeCategory, setActiveCategory] = useState<IdentityCategory | null>(null);

  if (activeCategory) {
    return (
      <CategoryPage
        category={activeCategory}
        onBack={() => setActiveCategory(null)}
        onDocumentUploaded={onDocumentUploaded}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-2xl">
        <div className="flex items-start gap-2">
          <Fingerprint className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-white">Digital Identity Vault</p>
            <p className="text-xs text-slate-400 mt-0.5">Tap a category to manage your documents. All files are encrypted automatically.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {IDENTITY_CATEGORIES.map(cat => (
          <motion.button
            key={cat.id}
            whileTap={{ scale: 0.96 }}
            onClick={() => setActiveCategory(cat)}
            className="flex flex-col items-start gap-3 p-4 bg-slate-800/40 border border-slate-700/40 rounded-2xl hover:border-slate-600/70 hover:bg-slate-800/70 transition-all text-left group"
          >
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${cat.color} flex items-center justify-center shadow-lg shadow-black/30`}>
              <cat.icon className="w-5 h-5 text-white" />
            </div>
            <div className="w-full">
              <p className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors leading-tight">{cat.label}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-snug">{cat.description}</p>
            </div>
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-600">{cat.items.length} docs</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

// ─── Profile Tab ──────────────────────────────────────────────────────────────

const ProfileTab: React.FC<{
  profileImage: string | null;
  setProfileImage: (s: string) => void;
  userName: string;
  setUserName: (s: string) => void;
  userId: string | null | undefined;
}> = ({ profileImage, setProfileImage, userName, setUserName, userId }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<ProfileData>(() => {
    try {
      const s = localStorage.getItem('biovault_profileData');
      if (s) return JSON.parse(s);
    } catch { /* ignore */ }
    return {
      displayName: userName || '',
      pinitId: userId ? `PINIT-${userId.slice(-6).toUpperCase()}` : 'PINIT-000000',
      name: '',
      email: localStorage.getItem('biovault_email') || '',
      phone: '',
      address: '',
      bio: '',
      github: '',
    };
  });

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const url = ev.target?.result as string;
      setProfileImage(url);
      localStorage.setItem('biovault_profileImage', url);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    localStorage.setItem('biovault_profileData', JSON.stringify(profile));
    setUserName(profile.displayName);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };

  // ProfileField is defined at module level — using it here by reference
  // avoids the focus-loss bug caused by inline component definitions.
  const handleFieldChange = (field: ProfileFieldKey, value: string) =>
    setProfile(p => ({ ...p, [field]: value }));

  return (
    <div className="space-y-4">
      {/* Avatar card */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-cyan-500/40 shadow-lg shadow-cyan-500/10">
              {profileImage ? (
                <img src={profileImage} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center">
                  <User className="w-10 h-10 text-cyan-400/60" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 bg-cyan-500 rounded-full flex items-center justify-center shadow-md hover:bg-cyan-400 transition-colors"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-lg truncate">{profile.displayName || 'Your Name'}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-xs text-cyan-400 font-mono">{profile.pinitId}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Tap camera to change photo</p>
          </div>
        </div>
      </Card>

      {/* Actions */}
      <div className="flex gap-2">
        {editing ? (
          <>
            <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-500 text-white rounded-xl text-sm font-semibold">
              <Save className="w-4 h-4" /> Save Changes
            </button>
            <button onClick={() => setEditing(false)} className="px-4 py-2.5 bg-slate-700/50 text-slate-400 rounded-xl">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-slate-700/40 border border-slate-600/50 text-slate-300 rounded-xl text-sm hover:border-cyan-500/50 transition-colors">
            <Edit2 className="w-4 h-4" /> Edit Profile
          </button>
        )}
      </div>

      {saved && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-xl text-green-400 text-sm">
          <Check className="w-4 h-4" /> Profile saved
        </motion.div>
      )}

      <Card className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Display Info</p>
        <ProfileField label="Display Name" value={profile.displayName} field="displayName" icon={User} editing={editing} onChange={handleFieldChange} />
        <ProfileField label="PINIT ID (Read Only)" value={profile.pinitId} field="pinitId" icon={Key} readOnly editing={editing} onChange={handleFieldChange} />
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Personal Info</p>
        <ProfileField label="Full Name" value={profile.name} field="name" icon={User} editing={editing} onChange={handleFieldChange} />
        <ProfileField label="Email" value={profile.email} field="email" icon={Mail} editing={editing} onChange={handleFieldChange} />
        <ProfileField label="Phone" value={profile.phone} field="phone" icon={Phone} editing={editing} onChange={handleFieldChange} />
        <ProfileField label="Address" value={profile.address} field="address" icon={MapPin} editing={editing} onChange={handleFieldChange} />
      </Card>

      <Card className="space-y-3">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">About & Social</p>
        <ProfileField label="Bio" value={profile.bio} field="bio" icon={FileText} multiline editing={editing} onChange={handleFieldChange} />
        <ProfileField label="GitHub Username" value={profile.github} field="github" icon={Github} editing={editing} onChange={handleFieldChange} />
      </Card>
    </div>
  );
};

// ─── Security Tab ─────────────────────────────────────────────────────────────

const SecurityTab: React.FC<{ userId: string | null | undefined }> = () => {
  const [autoEncrypt, setAutoEncrypt] = useState(true);
  const [autoLock, setAutoLock] = useState(true);
  const [alerts, setAlerts] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Toggle and Accordion are defined at module level as SecurityToggle / SecurityAccordion

  const DEVICES = [
    { name: 'Android Phone', model: 'Current Device', last: 'Now', active: true },
    { name: 'Chrome Browser', model: 'Windows PC', last: '2 days ago', active: false },
  ];
  const LOGINS = [
    { device: 'Android App', loc: 'India', time: 'Just now', ok: true },
    { device: 'Chrome', loc: 'India', time: '2 days ago', ok: true },
    { device: 'Firefox', loc: 'India', time: '5 days ago', ok: false },
  ];

  return (
    <div className="space-y-3">
      {/* Vault security toggles */}
      <Card className="space-y-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-cyan-400" /> Vault Security
        </p>
        {[
          { label: 'Auto Encryption', desc: 'Encrypt files automatically on upload', val: autoEncrypt, set: setAutoEncrypt },
          { label: 'Auto Lock', desc: 'Lock vault after 5 min of inactivity', val: autoLock, set: setAutoLock },
          { label: 'Security Alerts', desc: 'Notify on suspicious activity', val: alerts, set: setAlerts },
        ].map((item, i) => (
          <React.Fragment key={item.label}>
            {i > 0 && <div className="h-px bg-slate-700/40" />}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <SecurityToggle on={item.val} toggle={() => item.set(!item.val)} />
            </div>
          </React.Fragment>
        ))}
      </Card>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="devices" icon={Monitor} title="Device Management" sub={`${DEVICES.length} connected`}>
        <div className="space-y-2 pt-3">
          {DEVICES.map(d => (
            <div key={d.name} className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl">
              <Smartphone className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-white">{d.name}</p>
                <p className="text-xs text-slate-500">{d.model} · {d.last}</p>
              </div>
              {d.active ? <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Active</span>
                : <button className="text-xs text-red-400">Remove</button>}
            </div>
          ))}
        </div>
      </SecurityAccordion>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="login" icon={Clock} title="Login Activity" sub="Recent sign-in history">
        <div className="space-y-2 pt-3">
          {LOGINS.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/60 rounded-xl">
              <div className={`w-2 h-2 rounded-full shrink-0 ${a.ok ? 'bg-green-400' : 'bg-red-400'}`} />
              <div className="flex-1">
                <p className="text-sm text-white">{a.device}</p>
                <p className="text-xs text-slate-500">{a.loc} · {a.time}</p>
              </div>
              {!a.ok && <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />}
            </div>
          ))}
        </div>
      </SecurityAccordion>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="sessions" icon={Globe} title="Session Management" sub="Manage active sessions">
        <div className="pt-3 space-y-2">
          <div className="p-3 bg-slate-800/60 rounded-xl flex items-center justify-between">
            <div><p className="text-sm text-white">Current Session</p><p className="text-xs text-slate-500">Started now · Android</p></div>
            <span className="text-xs bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded-full">Active</span>
          </div>
          <button className="w-full py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex items-center justify-center gap-2">
            <LogOut className="w-4 h-4" /> End All Other Sessions
          </button>
        </div>
      </SecurityAccordion>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="recovery" icon={RefreshCw} title="Recovery & Backup" sub="Backup and recovery options">
        <div className="pt-3 space-y-2">
          {[
            { icon: Download, label: 'Export Vault Backup' },
            { icon: Key, label: 'Show Recovery Phrase' },
            { icon: QrCode, label: 'Generate Recovery QR' },
          ].map(b => (
            <button key={b.label} className="w-full py-2.5 bg-slate-700/50 text-slate-300 text-sm rounded-xl flex items-center justify-center gap-2">
              <b.icon className="w-4 h-4" /> {b.label}
            </button>
          ))}
        </div>
      </SecurityAccordion>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="temp" icon={Clock} title="Temporary Access" sub="Grant time-limited vault access">
        <div className="pt-3 space-y-2">
          <p className="text-xs text-slate-500">Create a link that expires automatically.</p>
          <div className="flex gap-2">
            <select className="flex-1 bg-slate-800/60 border border-slate-700/50 text-slate-300 text-sm rounded-xl px-3 py-2">
              <option>1 Hour</option><option>6 Hours</option><option>24 Hours</option><option>7 Days</option>
            </select>
            <button className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-sm rounded-xl">Generate</button>
          </div>
        </div>
      </SecurityAccordion>

      <SecurityAccordion openSection={openSection} setOpenSection={setOpenSection} id="logout" icon={LogOut} title="Sign Out Everywhere" sub="Revoke all active sessions" danger>
        <div className="pt-3">
          {confirmLogout ? (
            <div className="space-y-2">
              <p className="text-sm text-red-300">Are you sure? This signs you out on all devices.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmLogout(false)} className="flex-1 py-2 bg-slate-700/50 text-slate-300 text-sm rounded-xl">Cancel</button>
                <button className="flex-1 py-2 bg-red-500/20 border border-red-500/40 text-red-400 text-sm rounded-xl">Confirm</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmLogout(true)} className="w-full py-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl flex items-center justify-center gap-2">
              <LogOut className="w-4 h-4" /> Sign Out All Devices
            </button>
          )}
        </div>
      </SecurityAccordion>
    </div>
  );
};

// ─── Subscription Tab ─────────────────────────────────────────────────────────

const SubscriptionTab: React.FC = () => {
  const [selected, setSelected] = useState<string>('free');
  const [showBilling, setShowBilling] = useState(false);

  const plans = [
    {
      id: 'free', name: 'Free', price: '₹0', period: 'Forever', icon: Star,
      color: 'from-slate-500 to-slate-600', storage: '1 GB', popular: false,
      features: ['5 MB file limit', 'Basic encryption', '7-day history', 'Up to 50 files', 'Manual vault lock'],
    },
    {
      id: 'pro', name: 'Pro', price: '₹299', period: '/month', icon: Zap,
      color: 'from-cyan-500 to-purple-500', storage: '25 GB', popular: true,
      features: ['50 MB file limit', 'AES-256 encryption', 'Unlimited history', 'Unlimited files', 'Auto lock + backup', 'Portfolio sharing', 'Priority support'],
    },
    {
      id: 'enterprise', name: 'Enterprise', price: '₹999', period: '/month', icon: Crown,
      color: 'from-amber-500 to-orange-500', storage: '500 GB', popular: false,
      features: ['Unlimited file size', 'Military-grade crypto', 'Full audit trail', 'Custom branding', 'Team management', 'API access', 'Dedicated support'],
    },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex justify-between items-center mb-3">
          <div><p className="text-xs text-slate-500">Current Plan</p><p className="text-lg font-bold text-white">Free Plan</p></div>
          <div className="text-right"><p className="text-xs text-slate-500">Storage</p><p className="text-sm font-semibold text-cyan-400">0 MB / 1 GB</p></div>
        </div>
        <div className="bg-slate-700/40 rounded-full h-1.5">
          <div className="bg-gradient-to-r from-cyan-500 to-purple-500 h-1.5 rounded-full w-[2%]" />
        </div>
        <p className="text-xs text-slate-500 mt-2">Renews: Never (Free plan)</p>
      </Card>

      {plans.map(plan => (
        <motion.div
          key={plan.id}
          whileTap={{ scale: 0.99 }}
          onClick={() => setSelected(plan.id)}
          className={`relative rounded-2xl border-2 overflow-hidden cursor-pointer transition-all ${
            selected === plan.id ? 'border-cyan-500/60 shadow-lg shadow-cyan-500/10' : 'border-slate-700/40'
          }`}
        >
          {plan.popular && (
            <div className="absolute top-0 right-0 bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-xs px-3 py-1 rounded-bl-xl font-semibold">
              Most Popular
            </div>
          )}
          <div className={`bg-gradient-to-r ${plan.color} p-4 flex items-center gap-3`}>
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <plan.icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-lg leading-tight">{plan.name}</p>
              <p className="text-white/70 text-xs">{plan.storage} Storage</p>
            </div>
            <div className="text-right">
              <p className="text-white font-bold text-xl">{plan.price}</p>
              <p className="text-white/70 text-xs">{plan.period}</p>
            </div>
          </div>
          <div className="bg-slate-800/60 p-4">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
              {plan.features.map(f => (
                <div key={f} className="flex items-center gap-1.5">
                  <Check className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="text-xs text-slate-300">{f}</span>
                </div>
              ))}
            </div>
            {selected === plan.id && plan.id !== 'free' && (
              <button className={`mt-3 w-full py-2.5 bg-gradient-to-r ${plan.color} text-white text-sm font-bold rounded-xl`}>
                Upgrade to {plan.name}
              </button>
            )}
          </div>
        </motion.div>
      ))}

      <button
        onClick={() => setShowBilling(!showBilling)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-800/40 border border-slate-700/40 rounded-2xl text-sm text-slate-300"
      >
        <div className="flex items-center gap-2"><CardIcon className="w-4 h-4 text-slate-500" /> Billing History</div>
        <motion.div animate={{ rotate: showBilling ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronDown className="w-4 h-4 text-slate-500" />
        </motion.div>
      </button>
      <AnimatePresence>
        {showBilling && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl overflow-hidden divide-y divide-slate-700/30">
              {[{ date: 'May 1, 2026', plan: 'Free', amount: '₹0', status: 'Active' },
                { date: 'Apr 1, 2026', plan: 'Free', amount: '₹0', status: 'Paid' },
                { date: 'Mar 1, 2026', plan: 'Free', amount: '₹0', status: 'Paid' }].map((b, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{b.plan} Plan</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> {b.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{b.amount}</p>
                    <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{b.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-300 flex items-center gap-2"><CardIcon className="w-4 h-4 text-slate-500" /> Payment Methods</p>
          <button className="text-xs text-cyan-400 flex items-center gap-1"><Plus className="w-3 h-3" /> Add</button>
        </div>
        <div className="flex flex-col items-center gap-2 py-4 text-slate-600">
          <CardIcon className="w-8 h-8" />
          <p className="text-sm text-center text-slate-500">No payment methods added.</p>
        </div>
      </Card>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DigitalIdentityDashboard({
  onBack,
  userName = '',
  setUserName,
  profileImage: propProfileImage,
  setProfileImage: propSetProfileImage,
  userId,
  onDocumentUploaded,
}: Props) {
  const [activeTab, setActiveTab] = useState<MainTab>('profile');
  const [localProfileImage, setLocalProfileImage] = useState<string | null>(
    () => propProfileImage || localStorage.getItem('biovault_profileImage') || null
  );

  const handleSetProfileImage = (img: string) => {
    setLocalProfileImage(img);
    propSetProfileImage?.(img);
  };

  const content: Record<MainTab, React.ReactNode> = {
    profile: (
      <ProfileTab
        profileImage={localProfileImage}
        setProfileImage={handleSetProfileImage}
        userName={userName}
        setUserName={n => setUserName?.(n)}
        userId={userId}
      />
    ),
    identity: <IdentityTab userId={userId} onDocumentUploaded={onDocumentUploaded} />,
    security: <SecurityTab userId={userId} />,
    subscription: <SubscriptionTab />,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col">
      {/* Ambient glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <div className="relative px-4 pt-10 pb-4 z-10">
        <div className="flex items-center gap-3 mb-4">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 bg-slate-800/60 border border-slate-700/50 rounded-xl flex items-center justify-center text-slate-400 hover:text-white transition-colors shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">My Profile</h1>
            <p className="text-xs text-slate-500">Manage your identity &amp; security</p>
          </div>
          {localProfileImage && (
            <div className="w-9 h-9 rounded-xl overflow-hidden border border-cyan-500/40 shrink-0">
              <img src={localProfileImage} alt="avatar" className="w-full h-full object-cover" />
            </div>
          )}
        </div>
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28 relative z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {content[activeTab]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
