'use client';

import React, { useState } from 'react';
import { csrfFetch } from '@/lib/csrf-fetch';
import {
  Sparkles,
  Wand2,
  X,
  Loader2,
  Check,
  Code2,
  FileText,
  Ruler,
  Layers,
  Save,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CadConstraint {
  name: string;
  target_value: number;
  tolerance: number;
  unit: string;
}

interface CadItemPayload {
  prompt: string;
  cad_brief: string;
  constraints: CadConstraint[];
  parametric_code?: string;
  region_standard: string;
  unit_system: string;
  viva_required: boolean;
}

interface TextToCADModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPayload?: (payload: CadItemPayload) => void;
}

const PRESET_PROMPTS = [
  {
    title: 'Mounting Bracket',
    icon: '🔩',
    prompt: 'Create a 60x40mm aluminium mounting bracket with 2 M6 counterbored holes and a 5mm fillet radius.',
  },
  {
    title: 'Flange Plate',
    icon: '⚙️',
    prompt: 'Design a 100mm outer diameter circular flange plate with 4 PCD bolt holes and a 30mm central bore.',
  },
  {
    title: 'Stepped Shaft',
    icon: '📏',
    prompt: 'Model a 150mm stepped drive shaft with 30mm and 20mm diameter sections and a 5mm keyway slot.',
  },
  {
    title: 'Enclosure Cover',
    icon: '📦',
    prompt: 'Create a 120x80x15mm electronic enclosure cover with 4 corner mounting posts and 2.5mm wall thickness.',
  },
];

export function TextToCADModal({ isOpen, onClose, onApplyPayload }: TextToCADModalProps) {
  const [prompt, setPrompt] = useState('');
  const [regionStandard, setRegionStandard] = useState('ISO');
  const [unitSystem, setUnitSystem] = useState('metric');
  const [vivaRequired, setVivaRequired] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPayload, setGeneratedPayload] = useState<CadItemPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'brief' | 'constraints' | 'code'>('brief');
  const [savedSuccess, setSavedSuccess] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    setSavedSuccess(false);

    try {
      const res = await csrfFetch('/api/cad/generate-text-to-cad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          region_standard: regionStandard,
          unit_system: unitSystem,
          viva_required: vivaRequired,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to generate CAD model specifications from prompt');
      }

      const data = await res.json();
      if (data.ok && data.item_payload) {
        setGeneratedPayload(data.item_payload);
      } else {
        throw new Error(data.error || 'Invalid response from AI CAD service');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An error occurred during CAD model synthesis.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveToItemBank = async () => {
    if (!generatedPayload) return;
    try {
      const res = await csrfFetch('/api/item-bank/cad-step/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `CAD Challenge: ${prompt.slice(0, 45)}...`,
          prompt: prompt.trim(),
          region_standard: regionStandard,
          unit_system: unitSystem,
          viva_required: vivaRequired,
          points: 100.0,
        }),
      });
      if (res.ok) {
        setSavedSuccess(true);
        setTimeout(() => setSavedSuccess(false), 3000);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200 motion-reduce:animate-none">
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-border/70 bg-card shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/40 px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                Text to CAD
                <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  Parametric
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Describe a part in plain words and get a CAD brief, constraints and a parametric Python model.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Preset Chips */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Quick Prompt Presets
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESET_PROMPTS.map((preset) => (
                <button
                  key={preset.title}
                  onClick={() => setPrompt(preset.prompt)}
                  className="flex items-center gap-2 text-left p-2.5 rounded-lg border border-border/40 bg-card/60 hover:bg-accent/40 hover:border-primary/40 transition-all text-xs group"
                >
                  <span className="text-base">{preset.icon}</span>
                  <span className="font-medium text-foreground group-hover:text-primary truncate">
                    {preset.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Natural Language Prompt Input */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                Natural Language Description
              </label>
              <span className="text-[11px] text-muted-foreground">
                {prompt.length} chars
              </span>
            </div>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Create a 70x40mm aluminium bracket with two 10mm mounting holes, 3mm fillet radius, and 8mm plate thickness..."
              className="w-full rounded-lg border border-border/60 bg-background/80 px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none"
            />
          </div>

          {/* Engineering Options Grid */}
          <div className="grid grid-cols-3 gap-3 bg-muted/10 p-3 rounded-lg border border-border/30">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                Standard
              </label>
              <select
                value={regionStandard}
                onChange={(e) => setRegionStandard(e.target.value)}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="ISO">ISO (International)</option>
                <option value="ANSI">ANSI (US Standard)</option>
                <option value="DIN">DIN (German)</option>
                <option value="JIS">JIS (Japanese)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                Unit System
              </label>
              <select
                value={unitSystem}
                onChange={(e) => setUnitSystem(e.target.value)}
                className="w-full rounded-md border border-border/60 bg-background px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="metric">Metric (mm)</option>
                <option value="imperial">Imperial (in)</option>
              </select>
            </div>

            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-foreground select-none">
                <input
                  type="checkbox"
                  checked={vivaRequired}
                  onChange={(e) => setVivaRequired(e.target.checked)}
                  className="rounded border-border/60 text-primary focus:ring-primary h-3.5 w-3.5"
                />
                Require Viva Rationale
              </label>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
              <X className="h-4 w-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Trigger */}
          <div className="flex justify-end">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Synthesizing Parametric Model…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate CAD Specifications
                </>
              )}
            </button>
          </div>

          {/* Results Output Card */}
          {generatedPayload && (
            <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-inner mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {/* Output Tab Header */}
              <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-4 py-2">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setActiveTab('brief')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      activeTab === 'brief'
                        ? 'bg-background text-foreground shadow-sm border border-border/40'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    CAD Brief
                  </button>

                  <button
                    onClick={() => setActiveTab('constraints')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      activeTab === 'constraints'
                        ? 'bg-background text-foreground shadow-sm border border-border/40'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Ruler className="h-3.5 w-3.5 text-primary" />
                    Geometric Constraints ({generatedPayload.constraints.length})
                  </button>

                  <button
                    onClick={() => setActiveTab('code')}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                      activeTab === 'code'
                        ? 'bg-background text-foreground shadow-sm border border-border/40'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Code2 className="h-3.5 w-3.5 text-primary" />
                    Parametric Code
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveToItemBank}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border/60 bg-background hover:bg-accent text-foreground transition-colors"
                  >
                    {savedSuccess ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        Saved to Bank!
                      </>
                    ) : (
                      <>
                        <Save className="h-3.5 w-3.5 text-muted-foreground" />
                        Save to Item Bank
                      </>
                    )}
                  </button>

                  {onApplyPayload && (
                    <button
                      onClick={() => {
                        onApplyPayload(generatedPayload);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Apply to Workspace
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Output Tab Body */}
              <div className="p-4 bg-background/50">
                {activeTab === 'brief' && (
                  <div className="space-y-3">
                    <pre className="text-xs font-sans text-foreground whitespace-pre-wrap leading-relaxed bg-muted/20 p-3 rounded-lg border border-border/30">
                      {generatedPayload.cad_brief}
                    </pre>
                    <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                      <span>Standard: <strong className="text-foreground">{generatedPayload.region_standard}</strong></span>
                      <span>Units: <strong className="text-foreground">{generatedPayload.unit_system}</strong></span>
                      <span>Viva Required: <strong className="text-foreground">{generatedPayload.viva_required ? 'Yes' : 'No'}</strong></span>
                    </div>
                  </div>
                )}

                {activeTab === 'constraints' && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {generatedPayload.constraints.map((c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border/40 bg-card text-xs"
                        >
                          <span className="font-medium text-foreground">{c.name}</span>
                          <span className="font-mono text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                            {c.target_value} {c.unit} (±{c.tolerance})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'code' && (
                  <div>
                    <pre className="max-h-60 overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-100">
                      <code>{generatedPayload.parametric_code || '# No parametric code available'}</code>
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
