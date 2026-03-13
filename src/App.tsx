/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  orderBy, 
  limit, 
  onSnapshot
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { GoogleGenAI } from "@google/genai";
import { 
  UserCircle, 
  LogOut, 
  PlusCircle, 
  Send, 
  MessageCircle, 
  CheckCircle2, 
  Users, 
  Loader2,
  Phone,
  User as UserIcon,
  FileText,
  AlertCircle,
  Camera,
  X,
  Image as ImageIcon,
  RefreshCw,
  Download,
  Wifi,
  WifiOff,
  Settings,
  ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Product categories with visuals
const PRODUCT_CATEGORIES = [
  { name: "Precision Brass Components", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=100&h=100&fit=crop" },
  { name: "Brass Valve", image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=100&h=100&fit=crop" },
  { name: "Brass Fasteners", image: "https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=100&h=100&fit=crop" },
  { name: "Brass Hardware Components", image: "https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=100&h=100&fit=crop" },
  { name: "Brass Fitting Parts", image: "https://images.unsplash.com/photo-1581093458791-9f3c3900df4b?w=100&h=100&fit=crop" },
  { name: "Decorative Metal Parts", image: "https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=100&h=100&fit=crop" },
  { name: "Brass Auto Components", image: "https://images.unsplash.com/photo-1581092335397-9583eb92d232?w=100&h=100&fit=crop" },
  { name: "Brass Table Flag Stand", image: "https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=100&h=100&fit=crop" },
  { name: "Other / Custom Requirement", image: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=100&h=100&fit=crop" }
];

const STAFF_NAMES = [
  "Jeet Mehta",
  "Kapil Dave",
  "Sanjay Vekariya",
  "Narendra Kanjariya",
  "Pankaj Bhai",
  "Staff 1",
  "Staff 2",
  "Staff 3",
  "Staff 4",
  "Staff 5"
];

interface Lead {
  id?: string;
  name: string;
  mobile: string;
  inquiry: string;
  notes?: string;
  cardImage?: string;
  staffName: string;
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [lastSavedLead, setLastSavedLead] = useState<Lead | null>(null);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'success' | 'list'>('form');
  const [showCamera, setShowCamera] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);
  const [pendingLeads, setPendingLeads] = useState<Lead[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    mobile: '',
    inquiry: PRODUCT_CATEGORIES[0].name,
    notes: '',
    cardImage: '',
    staffName: STAFF_NAMES[0]
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Load pending leads
    const saved = localStorage.getItem('paani_pending_leads');
    if (saved) setPendingLeads(JSON.parse(saved));

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline && pendingLeads.length > 0) {
      syncOfflineLeads();
    }
  }, [isOnline, pendingLeads]);

  const syncOfflineLeads = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const toSync = [...pendingLeads];
    for (const lead of toSync) {
      try {
        const { id, ...data } = lead;
        await addDoc(collection(db, 'leads'), {
          ...data,
          createdAt: serverTimestamp()
        });
      } catch (err) {
        console.error("Sync error:", err);
      }
    }
    setPendingLeads([]);
    localStorage.removeItem('paani_pending_leads');
    setIsSyncing(false);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const leads = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lead[];
      setRecentLeads(leads);
    }, (err) => {
      console.error("Firestore error:", err);
      if (err.message.includes('permission-denied')) {
        setError("Access denied. Please ensure you are an authorized staff member.");
      }
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to sign in. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const startCamera = async () => {
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' }, 
        audio: false 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera error:", err);
      setError("Could not access camera. Please check permissions.");
      setShowCamera(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        const maxWidth = 800;
        const scale = maxWidth / video.videoWidth;
        canvas.width = maxWidth;
        canvas.height = video.videoHeight * scale;

        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
        setFormData({ ...formData, cardImage: dataUrl });
        stopCamera();

        // Start OCR
        handleOCR(dataUrl);
      }
    }
  };

  const handleOCR = async (base64Image: string) => {
    if (!process.env.GEMINI_API_KEY) {
      console.warn("Gemini API Key missing. OCR skipped.");
      return;
    }
    setIsProcessingOCR(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: {
          parts: [
            { text: "Extract the Visitor's Name and Mobile Number from this business card. Return ONLY a valid JSON object like: { \"name\": \"...\", \"mobile\": \"...\" }. If a field is not found, use an empty string. Do not include any other text or markdown formatting." },
            { inlineData: { data: base64Image.split(',')[1], mimeType: "image/jpeg" } }
          ]
        }
      });
      
      const text = response.text;
      if (text) {
        const cleanJson = text.replace(/```json|```/g, '').trim();
        try {
          const data = JSON.parse(cleanJson);
          setFormData(prev => ({
            ...prev,
            name: data.name || prev.name,
            mobile: data.mobile || prev.mobile
          }));
        } catch (e) {
          console.error("JSON Parse Error:", e, text);
        }
      }
    } catch (err) {
      console.error("OCR Error:", err);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);
    setError(null);

    try {
      const leadData = {
        ...formData,
        createdAt: isOnline ? serverTimestamp() : new Date().toISOString()
      };

      if (isOnline) {
        const docRef = await addDoc(collection(db, 'leads'), leadData);
        setLastSavedLead({ id: docRef.id, ...leadData });
      } else {
        const offlineLead = { ...leadData, id: 'offline-' + Date.now() };
        const newPending = [...pendingLeads, offlineLead];
        setPendingLeads(newPending);
        localStorage.setItem('paani_pending_leads', JSON.stringify(newPending));
        setLastSavedLead(offlineLead);
      }

      setFormData({ 
        name: '', 
        mobile: '', 
        inquiry: PRODUCT_CATEGORIES[0].name, 
        notes: '', 
        cardImage: '',
        staffName: formData.staffName
      });
      setView('success');
    } catch (err) {
      console.error("Submit error:", err);
      setError("Failed to save lead. Please check your connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const shareOnWhatsApp = () => {
    if (!lastSavedLead) return;

    const message = `Hi ${lastSavedLead.name}, thank you for visiting Paani Precision Products LLP at the exhibition. We have noted your inquiry about ${lastSavedLead.inquiry}. Our team will get in touch with you soon.\n\nVisit our website: https://www.paaniprecisions.com/`;
    
    // Clean mobile number (remove non-digits)
    const cleanMobile = lastSavedLead.mobile.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
  };

  const exportToCSV = () => {
    const headers = ["Date", "Time", "Staff", "Visitor", "Mobile", "Inquiry", "Notes"];
    const rows = recentLeads.map(l => [
      l.createdAt?.toDate ? l.createdAt.toDate().toLocaleDateString() : (typeof l.createdAt === 'string' ? new Date(l.createdAt).toLocaleDateString() : ''),
      l.createdAt?.toDate ? l.createdAt.toDate().toLocaleTimeString() : (typeof l.createdAt === 'string' ? new Date(l.createdAt).toLocaleTimeString() : ''),
      l.staffName,
      l.name,
      l.mobile,
      l.inquiry,
      l.notes || ''
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.map(val => `"${val}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `paani_leads_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const GearLoader = () => (
    <div className="relative w-24 h-24">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Settings className="w-20 h-20 text-brass-500 opacity-20" />
      </motion.div>
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Settings className="w-12 h-12 text-brass-600" />
      </motion.div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-brass-800 font-black text-xl">P</span>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-brass-50">
        <GearLoader />
        <p className="mt-4 text-brass-800 font-bold animate-pulse">Initializing Paani Lead System...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-brass-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-10 left-10 w-64 h-64 bg-brass-400 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-brass-600 rounded-full blur-3xl" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white/95 backdrop-blur-xl rounded-[2.5rem] shadow-2xl p-10 border border-brass-200 relative z-10"
        >
          <div className="flex flex-col items-center mb-10">
            <div className="w-20 h-20 bg-gradient-to-tr from-brass-400 to-brass-600 rounded-3xl flex items-center justify-center mb-6 shadow-lg rotate-3">
              <img 
                src="https://www.paaniprecisions.com/images/logo.png" 
                alt="Logo" 
                className="w-12 h-12 object-contain brightness-0 invert"
                referrerPolicy="no-referrer"
              />
            </div>
            <h1 className="text-3xl font-black text-brass-900 text-center tracking-tight">Paani Precision</h1>
            <p className="text-brass-600 text-center mt-2 font-medium">Exhibition Lead Management</p>
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-brass-600 to-brass-800 hover:from-brass-700 hover:to-brass-900 text-white font-bold py-5 rounded-2xl transition-all flex items-center justify-center gap-4 shadow-xl shadow-brass-200 group relative overflow-hidden"
          >
            <motion.div
              className="absolute inset-0 bg-white/20 -skew-x-12"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            />
            <div className="bg-white rounded-full p-1 group-hover:scale-110 transition-transform relative z-10">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            </div>
            <span className="relative z-10">Sign in to Dashboard</span>
          </button>
          
          <div className="mt-10 flex items-center justify-center gap-2">
            <div className="h-px w-8 bg-brass-100" />
            <p className="text-[10px] text-brass-400 font-bold uppercase tracking-[0.2em]">Authorized Personnel Only</p>
            <div className="h-px w-8 bg-brass-100" />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brass-50 text-stone-900 font-sans selection:bg-brass-100 selection:text-brass-900">
      {/* Header */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-brass-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-brass-600 rounded-xl flex items-center justify-center shadow-lg shadow-brass-200 overflow-hidden">
              <img 
                src="https://www.paaniprecisions.com/images/logo.png" 
                alt="Paani Logo" 
                className="w-full h-full object-contain p-1 bg-white"
                referrerPolicy="no-referrer"
              />
            </div>
            <div>
              <span className="font-black text-xl tracking-tighter text-brass-900 block leading-none">Paani</span>
              <span className="text-[10px] font-bold text-brass-500 uppercase tracking-widest">Precision Products LLP</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setView(view === 'list' ? 'form' : 'list')}
              className={cn(
                "px-4 py-2 rounded-xl font-black text-sm transition-all flex items-center gap-2 shadow-sm",
                view === 'list' 
                  ? "bg-brass-600 text-white shadow-brass-200" 
                  : "bg-white text-brass-600 border border-brass-100 hover:bg-brass-50"
              )}
            >
              {view === 'list' ? (
                <>
                  <PlusCircle className="w-4 h-4" />
                  New Entry
                </>
              ) : (
                <>
                  <Users className="w-4 h-4" />
                  All Entry
                </>
              )}
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 text-stone-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className={cn("mx-auto p-6 pb-32", view === 'list' ? "max-w-6xl" : "max-w-2xl")}>
        <AnimatePresence mode="wait">
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 bg-rose-50 border border-rose-100 text-rose-600 p-5 rounded-3xl flex items-center gap-4 shadow-sm"
            >
              <div className="bg-rose-100 p-2 rounded-full">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold">{error}</p>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-rose-100 rounded-full transition-colors">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}

          {view === 'form' && (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-[2rem] p-8 shadow-2xl shadow-brass-100 border border-brass-50">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-brass-900">
                    <div className="w-2 h-8 bg-brass-500 rounded-full" />
                    Visitor Entry
                  </h2>
                  <div className="flex items-center gap-2">
                    {!isOnline && (
                      <div className="bg-rose-100 text-rose-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                        <WifiOff className="w-3 h-3" /> Offline
                      </div>
                    )}
                    <div className="text-[10px] font-black bg-brass-50 text-brass-600 px-3 py-1 rounded-full uppercase tracking-widest">
                      Exhibition 2026
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-brass-400 uppercase tracking-[0.15em] ml-1">Staff Member</label>
                    <div className="relative group">
                      <UserCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-brass-300 group-focus-within:text-brass-500 transition-colors pointer-events-none" />
                      <select 
                        required
                        className="w-full bg-brass-50/50 border-2 border-transparent rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-brass-500 transition-all outline-none appearance-none font-bold text-brass-900"
                        value={formData.staffName}
                        onChange={e => setFormData({...formData, staffName: e.target.value})}
                      >
                        {STAFF_NAMES.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] ml-1">Visitor Name</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300 group-focus-within:text-brass-500 transition-colors" />
                        <input 
                          required
                          type="text"
                          placeholder={isProcessingOCR ? "Scanning..." : "Full Name"}
                          className={cn(
                            "w-full bg-stone-50 border-2 border-transparent rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-brass-500 transition-all outline-none font-medium",
                            isProcessingOCR && "animate-pulse opacity-50"
                          )}
                          value={formData.name}
                          onChange={e => setFormData({...formData, name: e.target.value})}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] ml-1">Mobile Number</label>
                      <div className="relative group">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300 group-focus-within:text-brass-500 transition-colors" />
                        <input 
                          required
                          type="tel"
                          placeholder={isProcessingOCR ? "Scanning..." : "+91 00000 00000"}
                          className={cn(
                            "w-full bg-stone-50 border-2 border-transparent rounded-2xl py-4 pl-12 pr-4 focus:bg-white focus:border-brass-500 transition-all outline-none font-medium",
                            isProcessingOCR && "animate-pulse opacity-50"
                          )}
                          value={formData.mobile}
                          onChange={e => setFormData({...formData, mobile: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] ml-1">Product Interest</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {PRODUCT_CATEGORIES.map(cat => (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => setFormData({...formData, inquiry: cat.name})}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left",
                            formData.inquiry === cat.name 
                              ? "bg-brass-50 border-brass-500 shadow-md shadow-brass-100" 
                              : "bg-white border-stone-100 hover:border-brass-200"
                          )}
                        >
                          <img src={cat.image} className="w-10 h-10 rounded-lg object-cover" alt={cat.name} />
                          <span className={cn(
                            "text-xs font-bold leading-tight",
                            formData.inquiry === cat.name ? "text-brass-900" : "text-stone-600"
                          )}>{cat.name}</span>
                          {formData.inquiry === cat.name && <CheckCircle2 className="w-4 h-4 text-brass-600 ml-auto" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Visiting Card Photo Section */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] ml-1">Visiting Card Photo</label>
                    
                    {!formData.cardImage ? (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="w-full aspect-[16/9] bg-stone-50 border-2 border-dashed border-stone-200 rounded-3xl flex flex-col items-center justify-center gap-3 hover:bg-brass-50 hover:border-brass-200 transition-all group"
                      >
                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                          <Camera className="w-8 h-8 text-stone-400 group-hover:text-brass-500" />
                        </div>
                        <span className="text-sm font-bold text-stone-500 group-hover:text-brass-600">Capture Visiting Card</span>
                      </button>
                    ) : (
                      <div className="relative rounded-3xl overflow-hidden aspect-[16/9] border-2 border-brass-100 shadow-inner group">
                        <img src={formData.cardImage} alt="Visiting Card" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm">
                          <button 
                            type="button"
                            onClick={startCamera}
                            className="bg-white text-stone-900 p-3 rounded-full shadow-xl hover:scale-110 transition-transform"
                          >
                            <RefreshCw className="w-5 h-5" />
                          </button>
                          <button 
                            type="button"
                            onClick={() => setFormData({...formData, cardImage: ''})}
                            className="bg-rose-500 text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                        {isProcessingOCR && (
                          <div className="absolute inset-0 bg-brass-900/40 backdrop-blur-sm flex flex-col items-center justify-center text-white">
                            <GearLoader />
                            <p className="mt-2 text-xs font-black uppercase tracking-widest">Scanning Card...</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-stone-400 uppercase tracking-[0.15em] ml-1">Additional Notes</label>
                    <textarea 
                      placeholder="Specific requirements, quantity, timeline..."
                      className="w-full bg-stone-50 border-2 border-transparent rounded-2xl py-4 px-6 focus:bg-white focus:border-brass-500 transition-all outline-none min-h-[120px] font-medium resize-none"
                      value={formData.notes}
                      onChange={e => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>

                  <button
                    disabled={submitting}
                    type="submit"
                    className="w-full bg-gradient-to-r from-brass-500 to-brass-700 hover:from-brass-600 hover:to-brass-800 text-white font-black py-5 rounded-2xl transition-all flex items-center justify-center gap-4 disabled:opacity-50 shadow-xl shadow-brass-100 mt-4 relative overflow-hidden group"
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -skew-x-12"
                      animate={{ x: ['-100%', '200%'] }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                    {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : <Send className="w-6 h-6" />}
                    <span className="relative z-10">Save Visitor Record</span>
                  </button>

                  <div className="pt-4 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => setView('list')}
                      className="text-[10px] font-black text-brass-400 uppercase tracking-[0.2em] hover:text-brass-600 transition-colors flex items-center gap-2"
                    >
                      <Users className="w-3 h-3" />
                      View All Entries
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center space-y-10 py-10"
            >
              <div className="flex flex-col items-center">
                <motion.div 
                  initial={{ rotate: -10, scale: 0 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', damping: 12 }}
                  className="w-24 h-24 bg-gradient-to-tr from-emerald-400 to-teal-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-emerald-200"
                >
                  <CheckCircle2 className="w-14 h-14 text-white" />
                </motion.div>
                <h2 className="text-4xl font-black text-stone-900 tracking-tight">Success!</h2>
                <p className="text-stone-500 mt-3 font-medium text-lg">Lead captured and synced to cloud.</p>
              </div>

              <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-brass-200/50 border border-brass-100 max-w-md mx-auto relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-brass-50 rounded-full -mr-16 -mt-16 opacity-50" />
                
                <div className="space-y-6 text-left relative z-10">
                  <div className="space-y-1">
                    <span className="text-[10px] font-black text-brass-400 uppercase tracking-widest">Visitor</span>
                    <p className="text-xl font-black text-brass-900">{lastSavedLead?.name}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-brass-400 uppercase tracking-widest">Mobile</span>
                      <p className="font-bold text-brass-600">{lastSavedLead?.mobile}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-brass-400 uppercase tracking-widest">Inquiry</span>
                      <p className="font-bold text-brass-700 leading-tight">{lastSavedLead?.inquiry}</p>
                    </div>
                  </div>
                  {lastSavedLead?.cardImage && (
                    <div className="pt-2">
                      <span className="text-[10px] font-black text-brass-400 uppercase tracking-widest block mb-2">Visiting Card</span>
                      <img src={lastSavedLead.cardImage} className="w-full h-32 object-cover rounded-2xl border border-brass-100" alt="Card" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-4 max-w-md mx-auto">
                <button
                  onClick={shareOnWhatsApp}
                  className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black py-6 rounded-3xl transition-all flex items-center justify-center gap-4 shadow-2xl shadow-emerald-200 group"
                >
                  <MessageCircle className="w-8 h-8 group-hover:scale-110 transition-transform" />
                  Send WhatsApp Welcome
                </button>
                
                <button
                  onClick={() => setView('form')}
                  className="w-full bg-white hover:bg-stone-50 text-stone-600 font-black py-5 rounded-3xl transition-all border-2 border-stone-100"
                >
                  Next Visitor
                </button>
              </div>
            </motion.div>
          )}

          {view === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-black tracking-tight flex items-center gap-3 text-brass-900">
                  <div className="w-2 h-8 bg-brass-500 rounded-full" />
                  All Entries
                </h2>
                <div className="flex items-center gap-3">
                  <button
                    onClick={exportToCSV}
                    className="bg-white text-brass-700 border border-brass-200 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 hover:bg-brass-50 transition-all shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Export CSV
                  </button>
                  <div className="bg-brass-600 px-4 py-2 rounded-2xl shadow-lg shadow-brass-100 text-xs font-black text-white">
                    {recentLeads.length} Total Records
                  </div>
                </div>
              </div>

              {recentLeads.length === 0 ? (
                <div className="text-center py-32 bg-white rounded-[2.5rem] border-2 border-dashed border-brass-100">
                  <div className="w-20 h-20 bg-brass-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Users className="w-10 h-10 text-brass-200" />
                  </div>
                  <p className="text-brass-400 font-bold">No visitors recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white rounded-[2rem] shadow-2xl shadow-brass-100 border border-brass-50 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-brass-50/50 border-b border-brass-100">
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Date & Time</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Staff</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Visitor</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Mobile</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Inquiry</th>
                          <th className="px-6 py-4 text-[10px] font-black text-brass-400 uppercase tracking-widest">Card</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brass-50">
                        {recentLeads.map((lead) => (
                          <tr key={lead.id} className="hover:bg-brass-50/30 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-stone-900">
                                {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleDateString() : (typeof lead.createdAt === 'string' ? new Date(lead.createdAt).toLocaleDateString() : 'Just now')}
                              </div>
                              <div className="text-[10px] font-medium text-stone-400">
                                {lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (typeof lead.createdAt === 'string' ? new Date(lead.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-black text-brass-600 bg-brass-50 px-2 py-1 rounded-lg">
                                {lead.staffName}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-black text-stone-900">{lead.name}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-stone-600 flex items-center gap-1">
                                <Phone className="w-3 h-3 text-brass-400" />
                                {lead.mobile}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg inline-block">
                                {lead.inquiry}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {lead.cardImage ? (
                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-brass-100 shadow-sm">
                                  <img src={lead.cardImage} className="w-full h-full object-cover" alt="Card" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-stone-50 flex items-center justify-center border border-stone-100">
                                  <ImageIcon className="w-4 h-4 text-stone-300" />
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Camera Modal Overlay */}
      <AnimatePresence>
        {showCamera && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-brass-900/95 backdrop-blur-xl flex flex-col p-6"
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-white font-black text-xl">Capture Card</h3>
              <button onClick={stopCamera} className="bg-white/10 text-white p-3 rounded-full hover:bg-white/20 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="flex-1 relative rounded-[2.5rem] overflow-hidden bg-stone-900 shadow-2xl border border-white/10">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 border-[3px] border-white/20 rounded-[2.5rem] pointer-events-none m-8" />
              
              <div className="absolute bottom-10 left-0 right-0 flex justify-center">
                <button 
                  onClick={capturePhoto}
                  className="w-20 h-20 bg-white rounded-full p-1 shadow-2xl active:scale-90 transition-transform"
                >
                  <div className="w-full h-full border-4 border-stone-900 rounded-full flex items-center justify-center">
                    <div className="w-12 h-12 bg-brass-600 rounded-full" />
                  </div>
                </button>
              </div>
            </div>
            
            <p className="text-white/40 text-[10px] font-bold text-center mt-6 uppercase tracking-[0.3em]">Align card within the frame</p>
            <canvas ref={canvasRef} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Status Bar */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-md z-20">
        <motion.div 
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="bg-white/90 backdrop-blur-2xl border border-brass-200 shadow-2xl rounded-3xl p-4 flex justify-between items-center"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full animate-pulse shadow-lg",
              isOnline ? "bg-emerald-500 shadow-emerald-200" : "bg-rose-500 shadow-rose-200"
            )} />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-brass-800">
                {isOnline ? "Live Session" : "Offline Mode"}
              </span>
              <span className="text-[8px] font-bold text-brass-400 uppercase tracking-tight">
                {formData.staffName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {pendingLeads.length > 0 && (
              <button 
                onClick={() => isOnline && syncOfflineLeads()}
                disabled={isSyncing}
                className={cn(
                  "bg-rose-50 text-rose-600 px-2 py-1 rounded-lg text-[8px] font-black uppercase flex items-center gap-1",
                  isOnline ? "animate-bounce cursor-pointer" : "opacity-50 cursor-not-allowed",
                  isSyncing && "animate-pulse"
                )}
              >
                {(isOnline || isSyncing) && <RefreshCw className={cn("w-2 h-2", isSyncing ? "animate-spin" : "animate-spin-slow")} />}
                {isSyncing ? "Syncing..." : `${pendingLeads.length} Sync`}
              </button>
            )}
            <span className="text-[10px] font-black text-brass-700 bg-brass-50 px-3 py-1 rounded-full uppercase tracking-widest">
              {recentLeads.length + pendingLeads.length} Leads
            </span>
          </div>
        </motion.div>
      </footer>
    </div>
  );
}
