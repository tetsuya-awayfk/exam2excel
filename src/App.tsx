import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, 
  FileText, 
  Download, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Loader2,
  Table as TableIcon,
  ChevronRight,
  FileSpreadsheet
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { ExamQuestion, ExtractionStatus } from './types';
import { parseExamFile } from './services/geminiService';
import { cn } from './lib/utils';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

// Helper component to render text with potential LaTeX
const SafeLatex = ({ text, fallback = "" }: { text: string, fallback?: string }) => {
  if (!text || text.trim() === "") {
    return <span className="text-gray-300 italic">{fallback}</span>;
  }
  
  // Split text by $...$ to find LaTeX parts
  const parts = text.split(/(\$.*?\$)/g);
  
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('$') && part.endsWith('$')) {
          const math = part.slice(1, -1);
          if (!math.trim()) return <span key={i}>$</span>;
          try {
            return <InlineMath key={i} math={math} />;
          } catch (e) {
            return <span key={i}>{part}</span>;
          }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<ExtractionStatus>('idle');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setQuestions([]);
      setStatus('idle');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    multiple: false
  } as any);

  const handleProcess = async () => {
    if (!file) return;

    setStatus('parsing');
    setError(null);

    try {
      let parsedQuestions = [];
      const fileExtension = file.name.split('.').pop()?.toLowerCase();

      if (fileExtension === 'pdf') {
        // Use multimodal parsing for PDF (best for layout and bold detection)
        parsedQuestions = await parseExamFile(file);
      } else {
        throw new Error('Unsupported file format. Please upload a PDF file.');
      }
      
      if (parsedQuestions.length === 0) {
        throw new Error('No questions could be extracted. Please check the file format.');
      }

      setQuestions(parsedQuestions);
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      let errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred';
      
      if (errorMessage.includes("429") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "The AI is currently busy (quota exceeded). Please wait a few seconds and try again.";
      }
      
      setError(errorMessage);
      setStatus('error');
    }
  };

  const cleanForExcel = (text: string) => {
    if (!text) return text;
    let cleaned = text;
    
    // Handle subscripts and superscripts by converting LaTeX to Unicode
    // This is a simplified mapping for common characters
    const superscripts: Record<string, string> = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'x': 'ˣ', 'y': 'ʸ'
    };
    const subscripts: Record<string, string> = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 
      'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 
      'v': 'ᵥ', 'x': 'ₓ'
    };

    // Replace LaTeX subscripts: _{...} or _x
    cleaned = cleaned.replace(/_\{([^}]+)\}/g, (_, p1) => {
      return p1.split('').map((c: string) => subscripts[c] || c).join('');
    });
    cleaned = cleaned.replace(/_([0-9a-z])/g, (_, p1) => subscripts[p1] || p1);

    // Replace LaTeX superscripts: ^{...} or ^x
    cleaned = cleaned.replace(/\^\{([^}]+)\}/g, (_, p1) => {
      return p1.split('').map((c: string) => superscripts[c] || c).join('');
    });
    cleaned = cleaned.replace(/\^([0-9a-z])/g, (_, p1) => superscripts[p1] || p1);

    // Replace common LaTeX symbols with Unicode for better Excel readability
    const replacements: Record<string, string> = {
      '\\Omega': 'Ω',
      '\\omega': 'ω',
      '\\degree': '°',
      '\\circ': '°',
      '\\%': '%',
      '\\pm': '±',
      '\\pi': 'π',
      '\\theta': 'θ',
      '\\phi': 'φ',
      '\\mu': 'μ',
      '\\Delta': 'Δ',
      '\\alpha': 'α',
      '\\beta': 'β',
      '\\gamma': 'γ',
      '\\sigma': 'σ',
      '\\tau': 'τ',
      '\\rho': 'ρ',
      '\\lambda': 'λ',
      '\\epsilon': 'ε',
      '\\eta': 'η',
      '\\zeta': 'ζ',
      '\\chi': 'χ',
      '\\psi': 'ψ',
      '\\kappa': 'κ',
      '\\nu': 'ν',
      '\\xi': 'ξ',
      '\\iota': 'ι',
      '\\upsilon': 'υ',
      '\\times': '×',
      '\\cdot': '·',
      '\\sqrt': '√',
      '\\infty': '∞',
      '\\approx': '≈',
      '\\neq': '≠',
      '\\leq': '≤',
      '\\geq': '≥',
    };

    Object.entries(replacements).forEach(([latex, unicode]) => {
      cleaned = cleaned.split(latex).join(unicode);
    });

    // Handle '/' separator request - put spaces around it or a clear separator
    // If it's a fraction in LaTeX like \frac{a}{b}, we might want to keep it or simplify
    cleaned = cleaned.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2');
    
    // Put space around literal '/' if it's used as a choice separator
    cleaned = cleaned.replace(/([^\s])\/([^\s])/g, '$1 / $2');

    // Remove $ delimiters
    return cleaned.replace(/\$/g, '');
  };

  const handleExport = () => {
    if (questions.length === 0) return;

    // Map data to use the desired labels as keys and clean LaTeX for Excel
    const dataToExport = questions.map(q => ({
      'Question No.': q.questionNo,
      'Questions': cleanForExcel(q.question),
      'Option 1': cleanForExcel(q.option1),
      'Option 2': cleanForExcel(q.option2),
      'Option 3': cleanForExcel(q.option3),
      'Option 4': cleanForExcel(q.option4),
      'Answer': q.answer
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    
    // Improved autofit logic
    const keys = Object.keys(dataToExport[0]);
    const colWidths = keys.map(key => {
      let maxLen = key.length;
      dataToExport.forEach(row => {
        const val = row[key as keyof typeof row];
        if (val) {
          const str = val.toString();
          // Approximate width: count characters, but give more weight to uppercase
          const len = str.split('').reduce((acc, char) => {
            return acc + (char === char.toUpperCase() && char !== char.toLowerCase() ? 1.3 : 1);
          }, 0);
          maxLen = Math.max(maxLen, len);
        }
      });
      return { wch: Math.min(Math.max(maxLen + 4, 12), 100) };
    });
    
    worksheet['!cols'] = colWidths;

    // Add row height hints for long questions
    const rowHeights = dataToExport.map(row => {
      const qLen = row['Questions']?.toString().length || 0;
      if (qLen > 100) return { hpt: Math.ceil(qLen / 100) * 15 + 10 };
      return { hpt: 25 };
    });
    worksheet['!rows'] = rowHeights;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Questions");
    XLSX.writeFile(workbook, "Exam_Questions.xlsx");
  };

  const handleEdit = (index: number, field: keyof ExamQuestion, value: string) => {
    const updated = [...questions];
    updated[index] = { ...updated[index], [field]: value };
    setQuestions(updated);
  };

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-3 bg-emerald-100 rounded-2xl mb-4"
          >
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-4"
          >
            Exam<span className="text-emerald-600">2</span>Excel
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-gray-500 max-w-xl mx-auto text-lg"
          >
            Convert your PDF exam papers into structured Excel spreadsheets in seconds using AI.
          </motion.p>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Upload & Controls */}
          <div className="lg:col-span-4 space-y-6">
            <section className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-4">Upload Exam</h2>
              
              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200",
                  isDragActive ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-400 hover:bg-gray-50",
                  file ? "bg-emerald-50/30 border-emerald-200" : ""
                )}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-3">
                  {file ? (
                    <div className="p-3 bg-emerald-100 rounded-xl">
                      <FileText className="w-8 h-8 text-emerald-600" />
                    </div>
                  ) : (
                    <div className="p-3 bg-gray-100 rounded-xl">
                      <Upload className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-700">
                      {file ? file.name : "Drop exam file here"}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      PDF files only (up to 10MB)
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleProcess}
                disabled={!file || status === 'uploading' || status === 'parsing'}
                className={cn(
                  "w-full mt-6 py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all active:scale-95",
                  !file || status === 'uploading' || status === 'parsing'
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-200"
                )}
              >
                {(status === 'uploading' || status === 'parsing') ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {status === 'uploading' ? 'Uploading...' : 'AI Parsing...'}
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-5 h-5" />
                    Start Conversion
                  </>
                )}
              </button>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-4 p-4 bg-red-50 text-red-600 rounded-2xl text-sm flex flex-col gap-3"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                  {error.includes("Security session expired") && (
                    <button
                      onClick={() => window.location.reload()}
                      className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      Refresh Page
                    </button>
                  )}
                  {error.includes("quota exceeded") && (
                    <button
                      onClick={handleProcess}
                      className="w-full py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                    >
                      Retry Now
                    </button>
                  )}
                </motion.div>
              )}
            </section>

            {status === 'success' && (
              <motion.section 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-emerald-600 p-6 rounded-3xl text-white shadow-xl shadow-emerald-100"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 bg-white/20 rounded-lg">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold">Extraction Complete</h3>
                    <p className="text-emerald-100 text-sm">{questions.length} questions found</p>
                  </div>
                </div>
                <button
                  onClick={handleExport}
                  className="w-full py-3 bg-white text-emerald-700 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download Excel
                </button>
              </motion.section>
            )}
          </div>

          {/* Right Column: Preview Table */}
          <div className="lg:col-span-8">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden min-h-[500px] flex flex-col">
              <div className="p-6 border-bottom border-gray-50 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <TableIcon className="w-5 h-5 text-gray-400" />
                  <h2 className="font-semibold text-gray-700">Preview & Edit</h2>
                </div>
                {questions.length > 0 && (
                  <span className="text-xs font-medium px-2 py-1 bg-gray-200 rounded-md text-gray-600">
                    Editable
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-auto">
                {questions.length > 0 ? (
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                      <tr className="text-[11px] uppercase tracking-wider text-gray-400 font-bold border-b border-gray-100">
                        <th className="px-4 py-3 w-16">No</th>
                        <th className="px-4 py-3 min-w-[300px]">Question</th>
                        <th className="px-4 py-3">Options</th>
                        <th className="px-4 py-3 w-20">Ans</th>
                        <th className="px-4 py-3 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      <AnimatePresence>
                        {questions.map((q, idx) => (
                          <motion.tr 
                            key={idx}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="group hover:bg-gray-50/50 transition-colors"
                          >
                            <td className="px-4 py-3 align-top">
                              <input 
                                value={q.questionNo}
                                onChange={(e) => handleEdit(idx, 'questionNo', e.target.value)}
                                className="w-full bg-transparent border-none focus:ring-0 text-sm font-mono text-gray-400"
                              />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="group/edit relative">
                                <textarea 
                                  value={q.question}
                                  onChange={(e) => handleEdit(idx, 'question', e.target.value)}
                                  className="w-full bg-transparent border-none focus:ring-0 text-sm leading-relaxed resize-none min-h-[60px] opacity-0 absolute inset-0 z-10"
                                  rows={2}
                                />
                                <div className="text-sm leading-relaxed min-h-[60px] p-1 pointer-events-none">
                                  <SafeLatex text={q.question} />
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 align-top space-y-1">
                              {['option1', 'option2', 'option3', 'option4'].map((opt, i) => (
                                <div key={opt} className="flex items-start gap-2 group/opt relative">
                                  <span className="text-[10px] font-bold text-gray-300 w-4 mt-1">{String.fromCharCode(65 + i)}</span>
                                  <div className="flex-1 relative">
                                    <input 
                                      value={q[opt as keyof ExamQuestion]}
                                      onChange={(e) => handleEdit(idx, opt as keyof ExamQuestion, e.target.value)}
                                      className="w-full bg-transparent border-none focus:ring-0 text-xs text-gray-600 py-0.5 opacity-0 absolute inset-0 z-10"
                                    />
                                    <div className="text-xs text-gray-600 py-0.5 pointer-events-none">
                                      <SafeLatex text={q[opt as keyof ExamQuestion]} fallback="[Empty Option]" />
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <input 
                                value={q.answer}
                                onChange={(e) => handleEdit(idx, 'answer', e.target.value)}
                                className="w-full bg-emerald-50 border-none focus:ring-0 text-sm font-bold text-emerald-700 text-center rounded-md"
                              />
                            </td>
                            <td className="px-4 py-3 align-top">
                              <button 
                                onClick={() => removeQuestion(idx)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 p-12 text-center">
                    <div className="p-6 bg-gray-50 rounded-full mb-4">
                      <TableIcon className="w-12 h-12 opacity-20" />
                    </div>
                    <p className="max-w-[200px]">Upload a file to see the extracted questions here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
